// Hand-run check of the real recorder with the webcam bubble. Not part of
// the app build (build.rs compiles only screen_recorder.swift). The bubble is
// a window, so this runs a real app main loop, which `cargo test` can't.
//
//   cd src-tauri/swift
//   xcrun swiftc -parse-as-library -import-objc-header screen_recorder_bridge.h \
//     screen_recorder.swift record_check.swift -o /tmp/record_check
//   /tmp/record_check /tmp/check.mp4 --webcam        # mic + system audio + camera
//   /tmp/record_check /tmp/check.mp4 --webcam --ask  # show the Camera prompt first
//
// Like the app, it never starts with a permission missing; --ask is the only
// way it shows a macOS prompt, and only for the camera.

import AppKit
import AVFoundation

@main
struct RecordCheck {
    static func main() {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            print("usage: record_check <out.mp4> [--webcam] [--ask] [--seconds N]")
            exit(2)
        }
        let path = args[1]
        let webcam = args.contains("--webcam")
        let seconds = args.firstIndex(of: "--seconds").flatMap { Double(args[$0 + 1]) } ?? 5
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)

        if webcam && args.contains("--ask") && sl_screen_recorder_camera_status() == 0 {
            let asked = DispatchSemaphore(value: 0)
            AVCaptureDevice.requestAccess(for: .video) { _ in asked.signal() }
            while asked.wait(timeout: .now()) == .timedOut {
                RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
            }
        }
        if sl_screen_recorder_has_permission() != 1 { fail("Screen Recording permission missing") }
        if sl_screen_recorder_mic_status() != 3 { fail("Microphone permission missing") }
        if webcam && sl_screen_recorder_camera_status() != 3 {
            fail("Camera permission missing (status \(sl_screen_recorder_camera_status())); rerun with --ask")
        }

        let options = """
            {"source":"display","microphone":true,"systemAudio":true,"webcam":\(webcam),
            "webcamCorner":"bottom_right","webcamSize":"medium","maxWidth":1920,"maxHeight":1080,"fps":30}
            """
        var result: String?
        var done = false
        DispatchQueue.global().async {
            result = take(sl_screen_recorder_start(path, options))
            if result == nil {
                Thread.sleep(forTimeInterval: seconds)
                result = take(sl_screen_recorder_stop())
            }
            done = true
        }
        while !done { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1)) }
        if let result = result { fail(result) }
        print("RECORDED \(path)")
    }

    static func take(_ pointer: UnsafeMutablePointer<CChar>?) -> String? {
        guard let pointer = pointer else { return nil }
        defer { sl_screen_recorder_free_string(pointer) }
        return String(cString: pointer)
    }

    static func fail(_ message: String) -> Never {
        print("NOT RECORDED: \(message)")
        exit(1)
    }
}
