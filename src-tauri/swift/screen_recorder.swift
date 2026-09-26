// Screen recorder for Say Less, built on ScreenCaptureKit's SCRecordingOutput
// (macOS 15+). Apple captures the screen, system audio and the microphone and
// writes one hardware-encoded MP4, so no frames ever pass through our code.
//
// The C functions below block the calling thread with a semaphore while
// ScreenCaptureKit answers on its own queues. Rust calls them from a
// background thread, never from the main thread.

import AVFoundation
import CoreGraphics
import Foundation
import ScreenCaptureKit

private let waitSeconds: Double = 15

private func cString(_ text: String) -> UnsafeMutablePointer<CChar>? {
    return strdup(text)
}

private func describe(_ error: Error?) -> String {
    guard let error = error else { return "unknown" }
    let ns = error as NSError
    return "\(ns.domain) \(ns.code): \(ns.localizedDescription)"
}

/// Fit the display's pixel size into a 1920x1080 box, never upscaling, and
/// keep both sides even because the H.264 encoder needs that.
func fitTo1080(width: Int, height: Int) -> (Int, Int) {
    guard width > 0, height > 0 else { return (1920, 1080) }
    let scale = min(1.0, min(1920.0 / Double(width), 1080.0 / Double(height)))
    let even = { (value: Double) -> Int in max(2, Int(value.rounded()) & ~1) }
    return (even(Double(width) * scale), even(Double(height) * scale))
}

@available(macOS 15.0, *)
private final class Recorder: NSObject, SCStreamDelegate, SCRecordingOutputDelegate, SCStreamOutput {
    private let lock = NSLock()
    private var stream: SCStream?
    private var output: SCRecordingOutput?
    private var started = DispatchSemaphore(value: 0)
    private var finished = DispatchSemaphore(value: 0)
    private var startError: String?
    private var pendingError: String?
    private var stopping = false
    private let sampleQueue = DispatchQueue(label: "say-less.screen-recorder.samples")

    var isRecording: Bool {
        lock.lock()
        defer { lock.unlock() }
        return stream != nil
    }

    func start(path: String, captureMic: Bool) -> String? {
        if isRecording { return "already_recording" }
        let url = URL(fileURLWithPath: path)
        if FileManager.default.fileExists(atPath: path) { return "file_exists" }

        // 1. What can we see? This fails without Screen Recording permission.
        var content: SCShareableContent?
        var contentError: Error?
        let gotContent = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { found, error in
            content = found
            contentError = error
            gotContent.signal()
        }
        if gotContent.wait(timeout: .now() + waitSeconds) == .timedOut { return "timeout" }
        guard let content = content else {
            return "permission_denied: \(describe(contentError))"
        }
        let mainID = CGMainDisplayID()
        guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
            return "no_display"
        }

        // 2. The main display, minus Say Less's own windows (dock, overlay).
        let me = getpid()
        let ours = content.applications.filter { $0.processID == me }
        let filter = SCContentFilter(display: display, excludingApplications: ours, exceptingWindows: [])

        // 3. 1080p at 30 fps with system audio and, if allowed, the mic.
        let config = SCStreamConfiguration()
        var pixelWidth = display.width
        var pixelHeight = display.height
        if let mode = CGDisplayCopyDisplayMode(display.displayID) {
            pixelWidth = mode.pixelWidth
            pixelHeight = mode.pixelHeight
        }
        let (width, height) = fitTo1080(width: pixelWidth, height: pixelHeight)
        config.width = width
        config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.queueDepth = 6
        config.showsCursor = true
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2
        config.captureMicrophone = captureMic

        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = url
        recordingConfig.outputFileType = .mp4
        recordingConfig.videoCodecType = .h264

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        let output = SCRecordingOutput(configuration: recordingConfig, delegate: self)
        do {
            // A plain stream output keeps the pipeline pulling frames; the
            // handler drops every sample right away.
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
            try stream.addRecordingOutput(output)
        } catch {
            return "setup_failed: \(describe(error))"
        }

        lock.lock()
        self.stream = stream
        self.output = output
        started = DispatchSemaphore(value: 0)
        finished = DispatchSemaphore(value: 0)
        startError = nil
        pendingError = nil
        stopping = false
        lock.unlock()

        var captureError: Error?
        let captureStarted = DispatchSemaphore(value: 0)
        stream.startCapture { error in
            captureError = error
            captureStarted.signal()
        }
        if captureStarted.wait(timeout: .now() + waitSeconds) == .timedOut {
            reset()
            return "timeout"
        }
        if let error = captureError {
            reset()
            return "start_failed: \(describe(error))"
        }
        // Wait for the file writer to report it is recording.
        if started.wait(timeout: .now() + waitSeconds) == .timedOut {
            stream.stopCapture { _ in }
            reset()
            return "timeout"
        }
        lock.lock()
        let failure = startError
        lock.unlock()
        if let failure = failure {
            stream.stopCapture { _ in }
            reset()
            return failure
        }
        return nil
    }

    func stop() -> String? {
        lock.lock()
        guard let stream = stream else {
            lock.unlock()
            return "not_recording"
        }
        stopping = true
        let finished = self.finished
        lock.unlock()

        var stopError: Error?
        let stopped = DispatchSemaphore(value: 0)
        stream.stopCapture { error in
            stopError = error
            stopped.signal()
        }
        _ = stopped.wait(timeout: .now() + waitSeconds)
        // The MP4 is only complete once the recording output says so.
        let done = finished.wait(timeout: .now() + waitSeconds)
        lock.lock()
        let failure = pendingError
        pendingError = nil
        lock.unlock()
        reset()
        if done == .timedOut { return "finish_timeout" }
        if let failure = failure { return failure }
        if let error = stopError { return "stop_failed: \(describe(error))" }
        return nil
    }

    func takeError() -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard stream == nil else { return nil }
        let error = pendingError
        pendingError = nil
        return error
    }

    private func reset() {
        lock.lock()
        stream = nil
        output = nil
        stopping = false
        lock.unlock()
    }

    // MARK: SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {}

    // MARK: SCRecordingOutputDelegate

    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        started.signal()
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        lock.lock()
        let text = "record_failed: \(describe(error))"
        startError = text
        pendingError = text
        // Writing failed mid-recording: end capture so status shows the error.
        let broken = stopping ? nil : stream
        if !stopping {
            stream = nil
            output = nil
        }
        lock.unlock()
        broken?.stopCapture { _ in }
        started.signal()
        finished.signal()
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        finished.signal()
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        // The system or the user ended capture (for example from the menu bar).
        lock.lock()
        let wasStopping = stopping
        if !wasStopping {
            pendingError = "stopped: \(describe(error))"
            self.stream = nil
            self.output = nil
        }
        lock.unlock()
        if !wasStopping { finished.signal() }
    }
}

private var sharedRecorder: AnyObject?

@available(macOS 15.0, *)
private func recorder() -> Recorder {
    if let existing = sharedRecorder as? Recorder { return existing }
    let created = Recorder()
    sharedRecorder = created
    return created
}

@_cdecl("sl_screen_recorder_supported")
public func sl_screen_recorder_supported() -> Int32 {
    if #available(macOS 15.0, *) { return 1 }
    return 0
}

@_cdecl("sl_screen_recorder_has_permission")
public func sl_screen_recorder_has_permission() -> Int32 {
    return CGPreflightScreenCaptureAccess() ? 1 : 0
}

@_cdecl("sl_screen_recorder_mic_status")
public func sl_screen_recorder_mic_status() -> Int32 {
    return Int32(AVCaptureDevice.authorizationStatus(for: .audio).rawValue)
}

@_cdecl("sl_screen_recorder_start")
public func sl_screen_recorder_start(_ path: UnsafePointer<CChar>?, _ captureMic: Int32) -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 15.0, *) else { return cString("unsupported_os") }
    guard let path = path else { return cString("invalid_path") }
    if let error = recorder().start(path: String(cString: path), captureMic: captureMic != 0) {
        return cString(error)
    }
    return nil
}

@_cdecl("sl_screen_recorder_stop")
public func sl_screen_recorder_stop() -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 15.0, *) else { return cString("unsupported_os") }
    if let error = recorder().stop() { return cString(error) }
    return nil
}

@_cdecl("sl_screen_recorder_is_recording")
public func sl_screen_recorder_is_recording() -> Int32 {
    guard #available(macOS 15.0, *) else { return 0 }
    return recorder().isRecording ? 1 : 0
}

@_cdecl("sl_screen_recorder_take_error")
public func sl_screen_recorder_take_error() -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 15.0, *) else { return nil }
    if let error = recorder().takeError() { return cString(error) }
    return nil
}

@_cdecl("sl_screen_recorder_free_string")
public func sl_screen_recorder_free_string(_ value: UnsafeMutablePointer<CChar>?) {
    free(value)
}
