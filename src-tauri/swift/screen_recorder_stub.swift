// Fallback when the macOS SDK is older than 15 (no SCRecordingOutput).
// Every call reports that screen recording is not available on this build.

import Foundation

@_cdecl("sl_screen_recorder_supported")
public func sl_screen_recorder_supported() -> Int32 { return 0 }

@_cdecl("sl_screen_recorder_has_permission")
public func sl_screen_recorder_has_permission() -> Int32 { return 0 }

@_cdecl("sl_screen_recorder_mic_status")
public func sl_screen_recorder_mic_status() -> Int32 { return 0 }

@_cdecl("sl_screen_recorder_camera_status")
public func sl_screen_recorder_camera_status() -> Int32 { return 0 }

@_cdecl("sl_screen_recorder_start")
public func sl_screen_recorder_start(
    _ path: UnsafePointer<CChar>?, _ optionsJSON: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>? {
    return strdup("unsupported_os")
}

@_cdecl("sl_screen_recorder_stop")
public func sl_screen_recorder_stop() -> UnsafeMutablePointer<CChar>? {
    return strdup("not_recording")
}

@_cdecl("sl_screen_recorder_is_recording")
public func sl_screen_recorder_is_recording() -> Int32 { return 0 }

@_cdecl("sl_screen_recorder_take_error")
public func sl_screen_recorder_take_error() -> UnsafeMutablePointer<CChar>? { return nil }

@_cdecl("sl_screen_recorder_sources")
public func sl_screen_recorder_sources() -> UnsafeMutablePointer<CChar>? { return nil }

@_cdecl("sl_camera_preview_start")
public func sl_camera_preview_start(_ cameraId: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
    return strdup("unsupported_os")
}

@_cdecl("sl_camera_preview_frame")
public func sl_camera_preview_frame() -> UnsafeMutablePointer<CChar>? { return nil }

@_cdecl("sl_camera_preview_stop")
public func sl_camera_preview_stop() {}

@_cdecl("sl_screen_recorder_is_main_thread")
public func sl_screen_recorder_is_main_thread() -> Int32 { return Thread.isMainThread ? 1 : 0 }

@_cdecl("sl_screen_recorder_pump_main")
public func sl_screen_recorder_pump_main(_ seconds: Double) {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds))
}

@_cdecl("sl_screen_recorder_free_string")
public func sl_screen_recorder_free_string(_ value: UnsafeMutablePointer<CChar>?) { free(value) }
