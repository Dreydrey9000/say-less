// Screen recorder for Say Less, built on ScreenCaptureKit's SCRecordingOutput
// (macOS 15+). Apple captures the screen, system audio and the microphone and
// writes one hardware-encoded MP4, so no frames ever pass through our code.
//
// The webcam is a small round window (a "bubble") that floats above other
// apps. The recording includes that one Say Less window while still leaving
// out the dock and overlay, so the face is burned into the video by the same
// hardware encoder, with no compositing code of ours.
//
// The C functions below block the calling thread with a semaphore while
// ScreenCaptureKit answers on its own queues. Rust calls them from a
// background thread, never from the main thread. Window work hops to the main
// thread with DispatchQueue.main.sync.

import AppKit
import AVFoundation
import CoreGraphics
import CoreImage
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

/// Run on the main thread and wait for the result. Safe from any thread.
private func onMain<T>(_ work: () -> T) -> T {
    if Thread.isMainThread { return work() }
    return DispatchQueue.main.sync(execute: work)
}

/// Fit a pixel size into a box, never upscaling, and keep both sides even
/// because the H.264 encoder needs that. A nil box keeps the native size.
func fitInto(width: Int, height: Int, maxWidth: Int?, maxHeight: Int?) -> (Int, Int) {
    guard width > 0, height > 0 else { return (1920, 1080) }
    var scale = 1.0
    if let maxWidth = maxWidth, let maxHeight = maxHeight, maxWidth > 0, maxHeight > 0 {
        // Landscape boxes also fit portrait windows: compare the long sides.
        let long = Double(max(maxWidth, maxHeight))
        let short = Double(min(maxWidth, maxHeight))
        let boxW = width >= height ? long : short
        let boxH = width >= height ? short : long
        scale = min(1.0, min(boxW / Double(width), boxH / Double(height)))
    }
    let even = { (value: Double) -> Int in max(2, Int(value.rounded()) & ~1) }
    return (even(Double(width) * scale), even(Double(height) * scale))
}

/// What Rust asks for. Field names match `BridgeOptions` in screen_recorder.rs.
struct RecordOptions: Decodable {
    var source: String
    var displayId: UInt32?
    var windowId: UInt32?
    var microphone: Bool
    var microphoneName: String?
    var systemAudio: Bool
    var webcam: Bool
    var cameraId: String?
    var webcamCorner: String
    var webcamSize: String
    var maxWidth: Int?
    var maxHeight: Int?
    var fps: Int
}

// MARK: Devices

private func videoDevices() -> [AVCaptureDevice] {
    var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera]
    if #available(macOS 14.0, *) {
        types += [.external, .continuityCamera]
    } else {
        types.append(.externalUnknown)
    }
    return AVCaptureDevice.DiscoverySession(
        deviceTypes: types, mediaType: .video, position: .unspecified
    ).devices
}

private func camera(id: String?) -> AVCaptureDevice? {
    if let id = id, !id.isEmpty, let found = AVCaptureDevice(uniqueID: id) { return found }
    return AVCaptureDevice.default(for: .video) ?? videoDevices().first
}

/// The microphone with this name (the name the dictation mic list shows).
@available(macOS 14.0, *)
private func microphone(named name: String) -> AVCaptureDevice? {
    return AVCaptureDevice.DiscoverySession(
        deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified
    ).devices.first { $0.localizedName == name }
}

private func cameraAllowed() -> Bool {
    return AVCaptureDevice.authorizationStatus(for: .video) == .authorized
}

/// CG (top-left origin) rect to Cocoa (bottom-left origin) screen coordinates.
private func cocoaRect(_ rect: CGRect) -> NSRect {
    let primaryHeight = CGDisplayBounds(CGMainDisplayID()).height
    return NSRect(x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height)
}

// MARK: Webcam bubble

private final class BubbleView: NSView {
    // Drag anywhere on the circle to move it.
    override var mouseDownCanMoveWindow: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Diameter in points for "small", "medium" and "large", kept inside the area.
func bubbleDiameter(size: String, areaWidth: Double, areaHeight: Double) -> Double {
    let wanted: Double
    switch size {
    case "small": wanted = 140
    case "large": wanted = 280
    default: wanted = 200
    }
    let limit = max(64, min(areaWidth, areaHeight) * 0.45)
    return min(wanted, limit)
}

/// Where the bubble sits: the chosen corner of `area`, 24 points in.
func bubbleOrigin(corner: String, area: CGRect, diameter: Double) -> CGPoint {
    let margin = min(24.0, max(0, (min(area.width, area.height) - diameter) / 2))
    let left = area.minX + margin
    let right = area.maxX - margin - diameter
    // Cocoa coordinates: y grows upward, so "top" is the larger y.
    let top = area.maxY - margin - diameter
    let bottom = area.minY + margin
    switch corner {
    case "top_left": return CGPoint(x: left, y: top)
    case "top_right": return CGPoint(x: right, y: top)
    case "bottom_left": return CGPoint(x: left, y: bottom)
    default: return CGPoint(x: right, y: bottom)
    }
}

private final class CameraBubble {
    private var panel: NSPanel?
    private var session: AVCaptureSession?

    var windowID: CGWindowID? {
        return onMain { panel.map { CGWindowID($0.windowNumber) } }
    }

    /// Start the camera and show the bubble in `area` (Cocoa coordinates).
    /// Call from a background thread. Returns an error code or nil.
    func show(cameraId: String?, corner: String, size: String, area: NSRect) -> String? {
        guard cameraAllowed() else { return "camera_denied" }
        guard let device = camera(id: cameraId) else { return "camera_missing" }
        let session = AVCaptureSession()
        session.sessionPreset = session.canSetSessionPreset(.hd1280x720) ? .hd1280x720 : .high
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return "camera_failed: input" }
            session.addInput(input)
        } catch {
            return "camera_failed: \(describe(error))"
        }
        // startRunning blocks for a moment, so keep it off the main thread.
        session.startRunning()
        guard session.isRunning else { return "camera_failed: not running" }
        self.session = session

        let diameter = bubbleDiameter(size: size, areaWidth: area.width, areaHeight: area.height)
        let origin = bubbleOrigin(corner: corner, area: area, diameter: diameter)
        onMain {
            // A command-line test has no running app yet; the real app does.
            _ = NSApplication.shared
            let rect = NSRect(x: origin.x, y: origin.y, width: diameter, height: diameter)
            let panel = NSPanel(
                contentRect: rect,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            panel.title = "Say Less camera"
            panel.isFloatingPanel = true
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            panel.backgroundColor = .clear
            panel.isOpaque = false
            panel.hasShadow = true
            panel.isMovableByWindowBackground = true
            panel.hidesOnDeactivate = false
            panel.isReleasedWhenClosed = false

            let view = BubbleView(frame: NSRect(origin: .zero, size: rect.size))
            let root = CALayer()
            root.frame = view.bounds
            root.cornerRadius = diameter / 2
            root.masksToBounds = true
            root.backgroundColor = NSColor.black.cgColor
            // Drawn above the video: a thin light ring so the circle reads on
            // dark and light screens.
            root.borderWidth = 3
            root.borderColor = NSColor.white.withAlphaComponent(0.9).cgColor
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = root.bounds
            if let connection = preview.connection, connection.isVideoMirroringSupported {
                // A mirror image, the way people expect to see themselves.
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = true
            }
            root.addSublayer(preview)
            view.layer = root
            view.wantsLayer = true
            view.setAccessibilityElement(true)
            view.setAccessibilityLabel("Your camera. Drag to move it.")
            panel.contentView = view
            panel.orderFrontRegardless()
            self.panel = panel
        }
        return nil
    }

    func hide() {
        onMain {
            panel?.orderOut(nil)
            panel = nil
        }
        let running = session
        session = nil
        DispatchQueue.global(qos: .userInitiated).async { running?.stopRunning() }
    }
}

// MARK: Recorder

@available(macOS 15.0, *)
private final class Recorder: NSObject, SCStreamDelegate, SCRecordingOutputDelegate, SCStreamOutput {
    private let lock = NSLock()
    private var stream: SCStream?
    private var output: SCRecordingOutput?
    private var bubble: CameraBubble?
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

    private func shareableContent() -> (SCShareableContent?, String?) {
        var content: SCShareableContent?
        var contentError: Error?
        let gotContent = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { found, error in
            content = found
            contentError = error
            gotContent.signal()
        }
        if gotContent.wait(timeout: .now() + waitSeconds) == .timedOut { return (nil, "timeout") }
        guard let content = content else {
            return (nil, "permission_denied: \(describe(contentError))")
        }
        return (content, nil)
    }

    /// The visible part of a display (minus menu bar and Dock), in Cocoa
    /// coordinates, for placing the bubble.
    private func visibleArea(of display: SCDisplay) -> NSRect {
        return onMain {
            let screen = NSScreen.screens.first {
                ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
                    == display.displayID
            }
            return screen?.visibleFrame ?? cocoaRect(display.frame)
        }
    }

    func start(path: String, options: RecordOptions) -> String? {
        if isRecording { return "already_recording" }
        let url = URL(fileURLWithPath: path)
        if FileManager.default.fileExists(atPath: path) { return "file_exists" }

        // 1. What can we see? This fails without Screen Recording permission.
        let (found, failure) = shareableContent()
        guard var content = found else { return failure ?? "no_display" }
        let mainID = CGMainDisplayID()
        let wantedDisplay = options.displayId ?? mainID
        guard let mainDisplay = content.displays.first(where: { $0.displayID == wantedDisplay })
            ?? content.displays.first(where: { $0.displayID == mainID })
            ?? content.displays.first
        else {
            return "no_display"
        }
        var window: SCWindow?
        if options.source == "window" {
            window = content.windows.first { $0.windowID == options.windowId }
            if window == nil { return "window_missing" }
        }
        // A window is recorded on the display that holds most of it.
        let display: SCDisplay = {
            guard let window = window else { return mainDisplay }
            let center = CGPoint(x: window.frame.midX, y: window.frame.midY)
            return content.displays.first { $0.frame.contains(center) } ?? mainDisplay
        }()

        // 2. The webcam bubble, placed in a corner of what we record.
        var bubbleWindow: SCWindow?
        if options.webcam {
            let area = window.map { cocoaRect($0.frame) } ?? visibleArea(of: display)
            let bubble = CameraBubble()
            if let error = bubble.show(
                cameraId: options.cameraId,
                corner: options.webcamCorner,
                size: options.webcamSize,
                area: area
            ) {
                bubble.hide()
                return error
            }
            self.bubble = bubble
            // The window server needs a moment to list the new window.
            for _ in 0..<6 {
                Thread.sleep(forTimeInterval: 0.15)
                let (again, _) = shareableContent()
                if let again = again {
                    content = again
                    if let id = bubble.windowID, let match = again.windows.first(where: { $0.windowID == id }) {
                        bubbleWindow = match
                        break
                    }
                }
            }
            if bubbleWindow == nil {
                hideBubble()
                return "camera_failed: bubble not listed"
            }
            if let wanted = window {
                window = content.windows.first { $0.windowID == wanted.windowID } ?? wanted
            }
        }

        // 3. The filter. Say Less's own windows (dock, overlay, settings) stay
        // out of the video; the bubble is the one exception.
        let me = getpid()
        let ours = content.applications.filter { $0.processID == me }
        let filter: SCContentFilter
        var sourceRect: CGRect?
        let pixelWidth: Int
        let pixelHeight: Int
        let displayScale: Double = {
            guard let mode = CGDisplayCopyDisplayMode(display.displayID), display.width > 0 else { return 2 }
            return Double(mode.pixelWidth) / Double(display.width)
        }()
        if let window = window {
            if let bubbleWindow = bubbleWindow {
                // The window plus the bubble on top of it, cropped to the window.
                filter = SCContentFilter(display: display, including: [window, bubbleWindow])
                let local = window.frame.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
                let rect = local.intersection(CGRect(x: 0, y: 0, width: display.frame.width, height: display.frame.height))
                if rect.isNull || rect.width < 2 || rect.height < 2 {
                    hideBubble()
                    return "window_missing"
                }
                sourceRect = rect
                pixelWidth = Int(rect.width * displayScale)
                pixelHeight = Int(rect.height * displayScale)
            } else {
                // Just the window, even when it moves or something covers it.
                filter = SCContentFilter(desktopIndependentWindow: window)
                let scale = Double(filter.pointPixelScale)
                pixelWidth = Int(window.frame.width * scale)
                pixelHeight = Int(window.frame.height * scale)
            }
        } else {
            filter = SCContentFilter(
                display: display,
                excludingApplications: ours,
                exceptingWindows: bubbleWindow.map { [$0] } ?? []
            )
            pixelWidth = Int(Double(display.width) * displayScale)
            pixelHeight = Int(Double(display.height) * displayScale)
        }

        // 4. Size, frame rate and sound.
        let config = SCStreamConfiguration()
        let (width, height) = fitInto(
            width: pixelWidth, height: pixelHeight,
            maxWidth: options.maxWidth, maxHeight: options.maxHeight
        )
        config.width = width
        config.height = height
        if let sourceRect = sourceRect { config.sourceRect = sourceRect }
        config.scalesToFit = true
        config.preservesAspectRatio = true
        let fps = options.fps == 60 ? 60 : 30
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        config.queueDepth = fps == 60 ? 8 : 6
        config.showsCursor = true
        config.capturesAudio = options.systemAudio
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2
        config.captureMicrophone = options.microphone
        if options.microphone, let name = options.microphoneName, let device = microphone(named: name) {
            config.microphoneCaptureDeviceID = device.uniqueID
        }

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
            hideBubble()
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
        let startFailure = startError
        lock.unlock()
        if let startFailure = startFailure {
            stream.stopCapture { _ in }
            reset()
            return startFailure
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

    private func hideBubble() {
        lock.lock()
        let current = bubble
        bubble = nil
        lock.unlock()
        current?.hide()
    }

    private func reset() {
        lock.lock()
        stream = nil
        output = nil
        stopping = false
        lock.unlock()
        hideBubble()
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
        if broken != nil { hideBubble() }
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
        if !wasStopping {
            hideBubble()
            finished.signal()
        }
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

// MARK: Live camera thumbnail for the setup panel

/// Small JPEG frames of the camera, about ten a second, so the settings page
/// can show a live thumbnail. Stops by itself when nobody asks for frames.
private final class CameraThumbnail: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let lock = NSLock()
    private var session: AVCaptureSession?
    private var latest: String?
    private var lastEncode: CFAbsoluteTime = 0
    private var lastRequest: CFAbsoluteTime = 0
    private let queue = DispatchQueue(label: "say-less.camera-thumbnail")
    private let context = CIContext(options: [.useSoftwareRenderer: false])

    func start(cameraId: String?) -> String? {
        stop()
        guard cameraAllowed() else { return "camera_denied" }
        guard let device = camera(id: cameraId) else { return "camera_missing" }
        let session = AVCaptureSession()
        session.sessionPreset = session.canSetSessionPreset(.medium) ? .medium : .low
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return "camera_failed: input" }
            session.addInput(input)
        } catch {
            return "camera_failed: \(describe(error))"
        }
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { return "camera_failed: output" }
        session.addOutput(output)
        lock.lock()
        self.session = session
        latest = nil
        lastRequest = CFAbsoluteTimeGetCurrent()
        lock.unlock()
        session.startRunning()
        return session.isRunning ? nil : "camera_failed: not running"
    }

    func frame() -> String? {
        lock.lock()
        defer { lock.unlock() }
        lastRequest = CFAbsoluteTimeGetCurrent()
        return latest
    }

    func stop() {
        lock.lock()
        let running = session
        session = nil
        latest = nil
        lock.unlock()
        running?.stopRunning()
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let now = CFAbsoluteTimeGetCurrent()
        lock.lock()
        let idle = now - lastRequest > 5
        let tooSoon = now - lastEncode < 0.1
        if !tooSoon { lastEncode = now }
        lock.unlock()
        if idle {
            // The page went away without saying so: turn the camera light off.
            DispatchQueue.global(qos: .utility).async { self.stop() }
            return
        }
        if tooSoon { return }
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let image = CIImage(cvPixelBuffer: pixels)
        let scale = 240.0 / max(1.0, image.extent.width)
        let small = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard
            let space = CGColorSpace(name: CGColorSpace.sRGB),
            let jpeg = context.jpegRepresentation(
                of: small, colorSpace: space,
                options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.6]
            )
        else { return }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        lock.lock()
        if session != nil { latest = url }
        lock.unlock()
    }
}

private let thumbnail = CameraThumbnail()

// MARK: C interface

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

@_cdecl("sl_screen_recorder_camera_status")
public func sl_screen_recorder_camera_status() -> Int32 {
    return Int32(AVCaptureDevice.authorizationStatus(for: .video).rawValue)
}

@_cdecl("sl_screen_recorder_start")
public func sl_screen_recorder_start(
    _ path: UnsafePointer<CChar>?, _ optionsJSON: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 15.0, *) else { return cString("unsupported_os") }
    guard let path = path else { return cString("invalid_path") }
    guard
        let optionsJSON = optionsJSON,
        let data = String(cString: optionsJSON).data(using: .utf8),
        let options = try? JSONDecoder().decode(RecordOptions.self, from: data)
    else {
        return cString("invalid_options")
    }
    if let error = recorder().start(path: String(cString: path), options: options) {
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

/// Displays, windows and cameras as JSON. Never shows a permission prompt:
/// windows are only listed when Screen Recording is already allowed.
@_cdecl("sl_screen_recorder_sources")
public func sl_screen_recorder_sources() -> UnsafeMutablePointer<CChar>? {
    var displayIDs = [CGDirectDisplayID](repeating: 0, count: 16)
    var count: UInt32 = 0
    CGGetActiveDisplayList(16, &displayIDs, &count)
    let names: [UInt32: String] = onMain {
        var map: [UInt32: String] = [:]
        for screen in NSScreen.screens {
            if let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
                map[number.uint32Value] = screen.localizedName
            }
        }
        return map
    }
    let mainID = CGMainDisplayID()
    let displays: [[String: Any]] = displayIDs.prefix(Int(count)).map { id in
        let bounds = CGDisplayBounds(id)
        return [
            "id": id,
            "name": names[id] ?? "Display \(id)",
            "width": Int(bounds.width),
            "height": Int(bounds.height),
            "is_main": id == mainID,
        ]
    }

    var windows: [[String: Any]] = []
    let allowed = CGPreflightScreenCaptureAccess()
    if allowed, #available(macOS 12.3, *) {
        var content: SCShareableContent?
        let done = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { found, _ in
            content = found
            done.signal()
        }
        if done.wait(timeout: .now() + 5) == .success, let content = content {
            let me = getpid()
            windows = content.windows
                .filter { window in
                    guard let app = window.owningApplication else { return false }
                    return window.windowLayer == 0 && app.processID != me
                        && window.frame.width >= 80 && window.frame.height >= 80
                        && !app.applicationName.isEmpty
                }
                .prefix(60)
                .map { window in
                    [
                        "id": window.windowID,
                        "app": window.owningApplication?.applicationName ?? "",
                        "title": window.title ?? "",
                    ]
                }
        }
    }

    let cameras: [[String: Any]] = videoDevices().map { ["id": $0.uniqueID, "name": $0.localizedName] }
    let result: [String: Any] = [
        "displays": displays,
        "windows": windows,
        "cameras": cameras,
        "windows_need_permission": !allowed,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: result),
        let text = String(data: data, encoding: .utf8)
    else { return nil }
    return cString(text)
}

@_cdecl("sl_camera_preview_start")
public func sl_camera_preview_start(_ cameraId: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
    let id = cameraId.map { String(cString: $0) }
    if let error = thumbnail.start(cameraId: id) { return cString(error) }
    return nil
}

@_cdecl("sl_camera_preview_frame")
public func sl_camera_preview_frame() -> UnsafeMutablePointer<CChar>? {
    return thumbnail.frame().flatMap(cString)
}

@_cdecl("sl_camera_preview_stop")
public func sl_camera_preview_stop() {
    thumbnail.stop()
}

/// Test helpers: a command-line test has no app event loop, so it runs the
/// main run loop itself while the recorder works on another thread.
@_cdecl("sl_screen_recorder_is_main_thread")
public func sl_screen_recorder_is_main_thread() -> Int32 {
    return Thread.isMainThread ? 1 : 0
}

@_cdecl("sl_screen_recorder_pump_main")
public func sl_screen_recorder_pump_main(_ seconds: Double) {
    _ = NSApplication.shared
    RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds))
}

@_cdecl("sl_screen_recorder_free_string")
public func sl_screen_recorder_free_string(_ value: UnsafeMutablePointer<CChar>?) {
    free(value)
}
