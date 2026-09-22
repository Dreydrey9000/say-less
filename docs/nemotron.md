# Nemotron in Say Less

Say Less inherited native Nemotron support from Handy v0.9.7. Both Nemotron Streaming 3.5 (multilingual) and Nemotron Speech Streaming EN are in the bundled catalog. The existing `transcribe-cpp` session handles inference and live preview. Adding a second Rust/ONNX or Swift runtime is unnecessary.

## Use it

1. Open Models and search for **Nemotron Streaming 3.5**.
2. Download the model, then select it. The default Q8_0 file is 751,094,240 bytes; total running memory is larger than the download.
3. In General, select your shortcut. In Advanced, set the overlay style to Live. Allow Microphone and Accessibility access when macOS requests them.
4. Speak into a disposable text document. Release the shortcut (or tap again in toggle mode), and check the final words and punctuation.
5. Keep optional cloud post-processing off for fully local dictation. Model downloads and update checks still need network access.

Changing models is reversible. If Nemotron is slow or inaccurate on a laptop, select an already-downloaded Parakeet or Whisper model in Models. The batch fallback after a failed/empty stream uses the **same selected model**, not a silent switch to a different engine or cloud service.

## Pinned model

- Repository: `handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf`
- Revision: `6d44e540bc31b0de1dbe174a3cea87f53a7f22fb`
- File: `nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf`
- SHA-256: `b94545b313b3223fda7b2857a52681da813935c2127643d1e9ff0c23d988089c`
- Runtime lockfile: `transcribe-cpp` / `transcribe-cpp-sys` 0.2.3.

The HF CLI's pinned download writes a snapshot without a branch-reference file. Say Less now resolves that snapshot directly, so it reuses the download above. Previously the app incorrectly showed this file as not downloaded. This cache fix preserves older `main` downloads and does not change the selected model automatically.

Do not replace this GGUF with an arbitrary NeMo, MLX, or ONNX file: model formats and runtime versions must agree. The bundled catalog initially advertises 28 base languages; the loaded model supplies the actual supported locale codes. That is different from the upstream model's 40 tokenizer locales, eight of which require adaptation before production use.

## Reproduce the acceptance check

### Verified September 22, 2026

On an Apple M3 Pro with 36 GB memory, the pinned Q8_0 model passed the check below using the public 11-second JFK recording. The runtime selected Metal (`MTL0`). Two streaming passes produced nine partial-text updates each and identical final transcripts. Automatic language selection and cancellation recovery also passed.

Streaming computation took 1.27 s and 1.00 s; finalization took 103 ms and 90 ms. First text appeared after feeding 1.1 s of audio. Initial model load took 16.47 s on this run. These are preliminary debug-build measurements, not an 8GB-device benchmark or a live microphone latency guarantee. The full result is in [the verification JSON](verification/nemotron-m3-pro.json).

After fixing the pinned-cache lookup, the **packaged Say Less executable** also transcribed the same sample through its actual ModelManager and TranscriptionManager. Two batch runs took 2.26 s and 1.05 s, with the expected transcript. See [the app-level result](verification/say-less-cli-m3-pro.json). This confirms the app can locate and use the downloaded model; it does not establish live microphone or cross-app paste behavior.

The packaged debug build also passed a launch check with `/` as its working directory and reported Nemotron as downloaded. Normal macOS app launch reached the native Microphone and Accessibility permission screen. Development binding export is now restricted to development mode and uses an absolute source path, avoiding the previous Finder-launch panic. Permissions were left for the user to grant; live dictation and cross-app paste remain unverified.

The example uses Say Less's locked inference dependency, verifies the model hash and size against the bundled catalog, requires partial text before finalization, checks two consecutive recordings, and verifies recovery after dropping a partial recording. Missing inputs, mismatched hashes, and empty transcripts fail instead of reporting a skipped success.

```sh
hf download handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf \
  nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf \
  --revision 6d44e540bc31b0de1dbe174a3cea87f53a7f22fb

cd src-tauri
cargo run --locked --example nemotron-smoke -- \
  /absolute/path/to/nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf \
  /absolute/path/to/16khz-mono-pcm16.wav 'expected phrase'
```

The example emits JSON with the transcript, backend, load time, batch time, partial update count, and finalization time. Audio is replayed without real-time pacing: those numbers measure computation, not microphone-to-paste latency. It does not measure battery life or prove Windows/8GB performance.

Before distributing installers, test real microphone input and pasting, silence, cancellation, model switching, first-run permissions, offline restart, and long recordings. Measure latency, peak memory, and battery impact on an 8GB Mac and a typical Windows laptop. Signing/notarization, updater keys, and release artifacts are separate release work.

## Sources

- [NVIDIA model card](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)
- [Runtime model documentation](https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/nemotron-3.5-asr-streaming-0.6b.md)
- [Converted model](https://huggingface.co/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf)
- [Public smoke-test audio](https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav)
