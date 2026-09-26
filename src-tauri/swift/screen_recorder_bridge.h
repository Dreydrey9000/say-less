#ifndef screen_recorder_bridge_h
#define screen_recorder_bridge_h

// C-compatible functions for the ScreenCaptureKit screen recorder.
// Every returned char* is owned by the caller and freed with
// sl_screen_recorder_free_string. NULL means success / no message.

#ifdef __cplusplus
extern "C" {
#endif

// 1 when this Mac can record (macOS 15 or newer, built with the macOS 15 SDK).
int sl_screen_recorder_supported(void);

// 1 when Screen Recording permission is already granted. Never shows a prompt.
int sl_screen_recorder_has_permission(void);

// Microphone permission: 0 not asked yet, 1 restricted, 2 denied, 3 allowed.
// Never shows a prompt.
int sl_screen_recorder_mic_status(void);

// Start recording the main display to `path` (an .mp4 file).
// capture_mic: 1 records the default microphone, 0 skips it.
// Blocks until capture has started or failed. Returns NULL on success.
char* sl_screen_recorder_start(const char* path, int capture_mic);

// Stop and finish the file. Blocks until the MP4 is written. NULL on success.
char* sl_screen_recorder_stop(void);

// 1 while a recording is running.
int sl_screen_recorder_is_recording(void);

// An error that ended a recording on its own (for example the user stopped
// sharing from the menu bar). NULL when there is none. Clears it.
char* sl_screen_recorder_take_error(void);

void sl_screen_recorder_free_string(char* value);

#ifdef __cplusplus
}
#endif

#endif /* screen_recorder_bridge_h */
