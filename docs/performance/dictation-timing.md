# Dictation latency diagnostics

## Offline streaming replay

A candidate containing this diagnostic supports:

```sh
/path/to/Say\ Less.app/Contents/MacOS/handy --transcribe-file synthetic.wav --stream-replay --repeat 1 --json
```

The WAV must be nonempty16kHz mono signed16-bit PCM and at most10seconds. Only one run is accepted. The replay uses the real `start_stream` → `StreamRouter::feed` → `finalize_stream` path, feeding20ms chunks at cumulative monotonic deadlines. It does not create a microphone recorder, save history, apply optional Apple Intelligence/provider cleanup, paste text, or change retention. It never falls back to batch when a stream is unavailable.

Stdout JSON has `mode=stream_replay`, `outcome` (`complete`, `no_stream`, `empty`, or `error`), backend, load time, feed duration, finalization duration after the audio deadline, total replay duration, frame count, `stream_observed`, and output text. `stream_observed` samples activity during feeding; a short stream can complete without being observed at those sampling points. A nonempty finalized result is required for exit0; other stream outcomes return1 and invalid input returns2. Content-free stage markers go to stderr. A valid comparison uses the same candidate executable and fixture for batch and replay.

Feed duration includes deliberate real-time pacing. Finalization includes the worker reply, text filtering and any configured immediate unload; it is not pure model-compute time. The existing30-second reply timeout remains unchanged. Run under a separate whole-process timeout and memory-pressure guard; replay does not add an internal global deadline. CLI flags are diagnostic, not a production release or proof of end-to-end speed.

## Native interaction trace

The [dictation architecture](../diagrams/dictation.mmd) shows the actual local model, optional cleanup, and paste boundaries. Stage timings follow that existing flow; they do not change it or claim a speedup.

At INFO log level, normal dictation emits `Dictation timing: id=… stage=… stop_elapsed_ms=…`. An ID identifies one stop operation within a process. Values are cumulative monotonic milliseconds from the stop request; subtract consecutive values with the same ID for a stage duration. The shared clock survives the async worker and main-thread callback, so paste completion includes dispatch and queue time. No audio, transcript, target application, provider input, or settings are included in these new lines.

| Boundaries                                           | What is included                                                |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `stop_requested` → `worker_started`                  | Synchronous stop setup and async scheduling                     |
| `worker_started` → `audio_stopped`                   | Recorder stop and sample retrieval                              |
| `finalize_started` → `finalize_returned`             | Streaming reply, text filtering and configured immediate unload |
| `batch_started` → `batch_returned`                   | Fallback batch transcription and configured immediate unload    |
| `wav_wait_started` → `wav_wait_finished`             | Remaining concurrent WAV-save wait and verification             |
| `cleanup_started` → `cleanup_finished`               | Output handling, including configured optional cleanup          |
| `history_started` → `history_finished`               | History persistence, when audio was saved                       |
| `paste_queued` → `paste_callback_started`            | Main-thread queue wait                                          |
| `paste_callback_started` → `paste_started`           | Cancellation and spoken-action checks                           |
| `paste_started` → `paste_succeeded` / `paste_failed` | Paste operation                                                 |

`stream_selected` identifies a usable stream; `batch_started` identifies fallback. Terminal alternatives include `no_audio`, `cancelled`, `cleanup_cancelled`, `empty_output`, `transcription_failed`, `spoken_action_handled`, `spoken_action_failed`, `command_finished`, and `paste_dispatch_failed`. Those paths intentionally do not emit `paste_succeeded`. A process crash can leave an incomplete sequence; missing completion is not proof of a stall. Voice-command preview and later user acceptance are separate from normal dictation paste.

Model unload duration is also available as `Model unload completed (took …ms)`. It has no operation ID and should only be associated with a dictation when sequence evidence supports that association.

## Important limits

- The old `Transcription completed in … for … of audio` INFO line times batch model work and filtering, before immediate unload. It is not stop-to-paste time.
- `TranscribeAction::stop dispatched` times the handler that schedules work; it is not completion.
- Stream finalize waits at most 30 seconds for its worker reply. This is not a whole-operation deadline: subsequent filtering, unload, WAV save, cleanup and paste have their own behavior. The timing change adds no timeout or cancellation policy.
- Native CLI `transcribe_ms` includes immediate unload but excludes model reload between repetitions; collect total process wall time and initial `load_ms` as well. Batch CLI benchmarking does not exercise microphone, live streaming, cleanup or paste.
- Compare repeatable workloads under comparable memory/CPU conditions. Do not attribute paging stalls or a pre-inference startup timeout to the speech engine without stage evidence.
