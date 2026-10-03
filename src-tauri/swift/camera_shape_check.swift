// Permission-free native regression check. Run from the repository root:
// xcrun swiftc -parse-as-library -import-objc-header \
//   src-tauri/swift/screen_recorder_bridge.h \
//   src-tauri/swift/screen_recorder.swift src-tauri/swift/camera_shape_check.swift \
//   -o /tmp/camera_shape_check && /tmp/camera_shape_check
import Foundation

@main
struct CameraShapeCheck {
    static func main() throws {
        for diameter in [120.0, 180.0, 240.0] {
            precondition(cameraCornerRadius(shape: "circle", diameter: diameter) == diameter / 2)
            precondition(cameraCornerRadius(shape: "square", diameter: diameter) == 0)
            precondition(cameraCornerRadius(shape: nil, diameter: diameter) == diameter / 2)
            precondition(cameraCornerRadius(shape: "unknown", diameter: diameter) == diameter / 2)
        }
        let oldJSON = """
            {"source":"display","microphone":false,"systemAudio":false,"webcam":true,
            "webcamCorner":"bottom_right","webcamSize":"medium","fps":30}
            """
        let legacy = try JSONDecoder().decode(RecordOptions.self, from: Data(oldJSON.utf8))
        precondition(legacy.webcamShape == nil)
        let squareJSON = oldJSON.replacingOccurrences(of: "\"fps\":30", with: "\"fps\":30,\"webcamShape\":\"square\"")
        let square = try JSONDecoder().decode(RecordOptions.self, from: Data(squareJSON.utf8))
        precondition(square.webcamShape == "square")
        print("PASS: circle/square clipping at all sizes and legacy/current bridge decoding")
    }
}
