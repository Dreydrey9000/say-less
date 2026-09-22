//! Offline acceptance check using the exact inference dependency used by Say Less.
//! cargo run --example nemotron-smoke -- MODEL.gguf AUDIO.wav [EXPECTED_PHRASE]
use anyhow::{bail, ensure, Context, Result};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::PathBuf, time::Instant};
use transcribe_cpp::{Model, RunOptions, StreamOptions};

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    ensure!(
        (2..=3).contains(&args.len()),
        "Usage: nemotron-smoke MODEL.gguf AUDIO.wav [EXPECTED_PHRASE]"
    );
    let model_path = PathBuf::from(&args[0]);
    let catalog: serde_json::Value =
        serde_json::from_str(include_str!("../src/catalog/catalog.json"))?;
    let entry = catalog["models"]
        .as_array()
        .context("catalog models missing")?
        .iter()
        .find(|m| m["slug"] == "nemotron-3.5-asr-streaming-0.6b")
        .context("Nemotron missing from bundled catalog")?;
    let quant = entry["files"]
        .as_array()
        .context("catalog files missing")?
        .iter()
        .find(|f| f["quant"] == entry["default_quant"])
        .context("default quant missing")?;
    let mut file = File::open(&model_path)?;
    ensure!(
        file.metadata()?.len() == quant["size_bytes"].as_u64().context("size missing")?,
        "Model size differs from the bundled default"
    );
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let sha256 = format!("{:x}", hasher.finalize());
    ensure!(
        sha256 == quant["sha256"].as_str().context("hash missing")?,
        "Model checksum mismatch"
    );

    let mut reader = hound::WavReader::open(&args[1])?;
    let spec = reader.spec();
    ensure!(
        spec.channels == 1
            && spec.sample_rate == 16000
            && spec.bits_per_sample == 16
            && spec.sample_format == hound::SampleFormat::Int,
        "Use a 16 kHz, mono, signed 16-bit PCM WAV"
    );
    let pcm: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<std::result::Result<_, _>>()?;
    ensure!(!pcm.is_empty(), "Audio is empty");
    transcribe_cpp::init_backends_default()?;
    let load_started = Instant::now();
    let model = Model::load(&model_path)?;
    let load_ms = load_started.elapsed().as_secs_f64() * 1000.0;
    ensure!(
        model.capabilities().supports_streaming,
        "Runtime does not support streaming"
    );
    ensure!(
        model.variant().contains("nemotron"),
        "Runtime loaded a different model family"
    );
    let options = RunOptions {
        language: Some("en-US".into()),
        ..Default::default()
    };
    let mut session = model.session()?;
    let batch_started = Instant::now();
    let batch = session.run(&pcm, &options)?;
    let batch_ms = batch_started.elapsed().as_secs_f64() * 1000.0;
    ensure!(
        !batch.text.trim().is_empty(),
        "Batch transcription was empty"
    );
    let mut runs = Vec::new();
    for _ in 0..2 {
        let started = Instant::now();
        let mut stream = session.stream(&options, &StreamOptions::default())?;
        let mut updates = 0;
        let mut first_text_audio_ms = None;
        let mut samples_fed = 0;
        for frame in pcm.chunks(1600) {
            samples_fed += frame.len();
            let update = stream.feed(frame)?;
            if update.committed_changed || update.tentative_changed {
                updates += 1;
                if first_text_audio_ms.is_none() && !stream.text().full.trim().is_empty() {
                    first_text_audio_ms = Some(samples_fed as f64 / 16.0);
                }
            }
        }
        let flush_started = Instant::now();
        ensure!(stream.finalize()?.is_final, "Finalization did not finish");
        let flush_ms = flush_started.elapsed().as_secs_f64() * 1000.0;
        let text = stream.text().full.trim().to_string();
        ensure!(!text.is_empty(), "Streaming transcription was empty");
        ensure!(updates > 0, "No text updates before finalization");
        if let Some(expected) = args.get(2) {
            ensure!(
                text.to_lowercase().contains(&expected.to_lowercase()),
                "Expected phrase missing: {text}"
            );
        }
        runs.push(json!({
            "text": text, "text_updates": updates,
            "first_text_after_audio_ms": first_text_audio_ms,
            "compute_ms": started.elapsed().as_secs_f64() * 1000.0,
            "finalize_ms": flush_ms
        }));
    }
    if runs[0]["text"] != runs[1]["text"] {
        bail!("Repeated sessions differed; inspect state reset: {runs:?}");
    }
    // Dropping a partial recording must not contaminate the next recording.
    {
        let mut cancelled = session.stream(&options, &StreamOptions::default())?;
        cancelled.feed(&pcm[..pcm.len().min(8000)])?;
    }
    let after_cancel = session.run(&pcm, &options)?;
    ensure!(
        after_cancel.text == batch.text,
        "Cancelled stream contaminated the next run"
    );
    // Say Less defaults to automatic language selection; exercise that path too.
    let auto_options = RunOptions::default();
    let mut auto_stream = session.stream(&auto_options, &StreamOptions::default())?;
    for frame in pcm.chunks(1600) {
        auto_stream.feed(frame)?;
    }
    ensure!(
        auto_stream.finalize()?.is_final,
        "Automatic language stream did not finish"
    );
    let auto_text = auto_stream.text().full.trim().to_string();
    ensure!(
        !auto_text.is_empty(),
        "Automatic language transcription was empty"
    );
    if let Some(expected) = args.get(2) {
        ensure!(
            auto_text.to_lowercase().contains(&expected.to_lowercase()),
            "Automatic language output missed expected phrase: {auto_text}"
        );
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "model_revision": entry["revision"], "sha256": sha256,
            "runtime": transcribe_cpp::version(), "runtime_commit": transcribe_cpp::version_commit(),
            "backend": model.backend(), "model_variant": model.variant(),
            "audio_seconds": pcm.len() as f64 / 16000.0,
            "load_ms": load_ms, "batch_ms": batch_ms, "batch_text": batch.text.trim(),
        "stream_runs": runs, "cancel_then_retry": "passed", "auto_language_text": auto_text,
            "timing_note": "Unpaced file replay: compute timings are not microphone-to-paste latency."
        }))?
    );
    Ok(())
}
