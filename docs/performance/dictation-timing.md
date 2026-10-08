# Dictation latency diagnostics

The [dictation architecture](../diagrams/dictation.mmd) shows the actual local model, optional cleanup, and paste boundaries. Stage timings follow that existing flow; they do not change it or claim a speedup.

At INFO log level, normal dictation emits `Dictation timing: id=… stage=… stop_elapsed_ms=…`. An ID identifies one stop operation within a process. Values are cumulative monotonic milliseconds from the stop request; subtract consecutive values with the same ID for a stage duration. The shared clock survives the async worker and main-thread callback, so paste completion includes dispatch and queue time. No audio, transcript, target application, provider input, or settings are included in these new lines.

| Boundaries | What is included |
| --- | --- |
| `stop_requested` → `worker_started` | Synchronous stop setup and async scheduling |
| `worker_started` → `audio_stopped` | Recorder stop and sample retrieval |
| `finalize_started` → `finalize_returned` | Streaming reply, text filtering and configured immediate unload |
| `batch_started` → `batch_returned` | Fallback batch transcription and configured immediate unload |
| `wav_wait_started` → `wav_wait_finished` | Remaining concurrent WAV-save wait and verification |
| `cleanup_started` → `cleanup_finished` | Output handling, including configured optional cleanup |
| `history_started` → `history_finished` | History persistence, when audio was saved |
| `paste_queued` → `paste_callback_started` | Main-thread queue wait |
| `paste_callback_started` → `paste_started` | Cancellation and spoken-action checks |
| `paste_started` → `paste_succeeded` / `paste_failed` | Paste operation |

`stream_selected` identifies a usable stream; `batch_started` identifies fallback. Terminal alternatives include `no_audio`, `cancelled`, `cleanup_cancelled`, `empty_output`, `transcription_failed`, `spoken_action_handled`, `spoken_action_failed`, `command_finished`, and `paste_dispatch_failed`. Those paths intentionally do not emit `paste_succeeded`. A process crash can leave an incomplete sequence; missing completion is not proof of a stall. Voice-command preview and later user acceptance are separate from normal dictation paste.

Model unload duration is also available as `Model unload completed (took …ms)`. It has no operation ID and should only be associated with a dictation when sequence evidence supports that association.

## Important limits

- The old `Transcription completed in … for … of audio` INFO line times batch model work and filtering, before immediate unload. It is not stop-to-paste time.
- `TranscribeAction::stop dispatched` times the handler that schedules work; it is not completion.
- Stream finalize waits at most 30 seconds for its worker reply. This is not a whole-operation deadline: subsequent filtering, unload, WAV save, cleanup and paste have their own behavior. The timing change adds no timeout or cancellation policy.
- Native CLI `transcribe_ms` includes immediate unload but excludes model reload between repetitions; collect total process wall time and initial `load_ms` as well. Batch CLI benchmarking does not exercise microphone, live streaming, cleanup or paste.
- Compare repeatable workloads under comparable memory/CPU conditions. Do not attribute paging stalls or a pre-inference startup timeout to the speech engine without stage evidence.
