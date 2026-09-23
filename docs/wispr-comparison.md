# Say Less and Wispr Flow — desktop capability review

Reviewed September 22, 2026 against official Wispr documentation and the current Say Less code. **Say Less does not yet have full Wispr Flow parity.** The strongest demonstrated difference is local speech recognition with selectable models. No comparative accuracy or speed study has been run.

| Capability                                                   | Say Less status                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop dictation, configurable shortcuts, hold/toggle modes | Implemented; microphone-to-paste acceptance still needs user testing.                                                                                                     |
| Live partial transcription                                   | Verified with Nemotron and public test audio on this M3 Pro.                                                                                                              |
| Offline speech recognition                                   | Local model inference verified. Downloads need internet. Optional post-processing is a separate provider feature.                                                         |
| Personal vocabulary                                          | Existing custom-word hints/correction; model-dependent, not automatic learning from edits.                                                                                |
| Voice snippets                                               | Added: local plain text and line breaks, whole-cue and in-sentence matching, longest phrase first, preview, save/edit/remove/undo. No rich-text snippets or team sharing. |
| Filler removal                                               | Existing local cleanup.                                                                                                                                                   |
| Punctuation                                                  | Model-generated; optional configured AI cleanup supports spoken punctuation. No guarantee across models.                                                                  |
| Backtracking, list formatting, tone                          | Optional prompt-based post-processing; not equivalent to Flow's automatic behavior. Provider setup and evaluation needed.                                                 |
| App-aware writing styles                                     | Missing. No automatic app-context collection added.                                                                                                                       |
| Selected-text voice commands                                 | Missing. Dictation post-processing is not selected-text editing.                                                                                                          |
| Automatic dictionary learning                                | Missing.                                                                                                                                                                  |
| Cursor/Windsurf file tagging                                 | Missing.                                                                                                                                                                  |
| History and audio recovery                                   | Existing local history, replay, retention, copy and retry features. End-to-end recovery needs testing.                                                                    |
| Multiple languages                                           | Model-dependent. Nemotron catalog advertises 28 base languages; other models differ. Not a tested 100-language claim.                                                     |
| iOS/Android and device sync                                  | Missing. This pass delivers a macOS build; Windows/Linux code exists but was not tested here.                                                                             |
| Team dictionary, shared snippets, adoption reporting         | Missing.                                                                                                                                                                  |

Wispr advertises cross-app dictation, automatic corrections, styles, vocabulary learning, snippets, mobile support, and team features. See its [official feature list](https://wisprflow.ai/features). Its [snippet documentation](https://docs.wisprflow.ai/articles/5784437944-create-and-use-snippets) describes richer formatting and shared libraries; Say Less's first version intentionally stores plain text locally. Wispr states transcription occurs in the cloud in its [data controls](https://wisprflow.ai/data-controls).

## What this pass improves

Writing gathers personal vocabulary, filler cleanup, and snippets in one place. Primary actions share the silver finish; dropdowns use native keyboard behavior; switches expose names and state; settings reflow at narrow widths; descriptions can be opened with a keyboard. The new screens have controlled UI tests for saving, reloading, editing, removal, preview, failure recovery, keyboard interaction, and narrow/light/dark layouts.

Snippet expansions are deterministic and nonrecursive. They preserve original surrounding text and saved capitalization/line breaks. Whole cues ignore punctuation and capitalization; in-sentence cues respect word boundaries and do not cross punctuation between words. A matching snippet skips optional AI post-processing for that utterance, keeping saved text exact and out of the provider request. The preview uses the same Rust matcher as dictation. Very large expansion growth falls back to the original transcript.

## Next acceptance steps before coaching distribution

1. Grant OS permissions and test real microphone → text insertion in Notes, browser forms, and the coaching workflow. Include cancel, silence, long sessions, and a failed paste.
2. Compare the same consented recordings against Flow: punctuation, corrections, names, accents, noisy audio, latency, and memory. Do not infer quality from a single public clip.
3. Evaluate optional local cleanup for lists/backtracking/styles; make any cloud mode explicit. Then add selected-text commands with clear preview and undo.
4. Test an 8GB Mac and Windows laptop; complete developer signing, notarization, update-key setup, and install/update tests.
5. Treat mobile, sync, shared coaching libraries, and the portal listing as separate product work. No portal deployment was done in this pass.

New Writing/control copy currently uses English fallback in non-English locales; full localization remains pending.
