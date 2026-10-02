// SayLessLauncher.swift
// One tiny native WKWebView shell, compiled once and packaged four times
// (Title Ideas, Say Less Image, Say Less Recordings, Read Screens) with
// different Info.plist values. Pages are served by the local Say Less bridge
// on http://127.0.0.1:8810/app and talk to this shell through the
// "sayless" script message handler.
//
// Build: see bridge/launcher/build-launchers.sh

import AppKit
import WebKit

private let shellVersion = "1.0.0"
private let bridgeLabel = "com.luis.say-less-bridge"
private let defaultStateDir = NSHomeDirectory() + "/Desktop/_Code/say-less-bridge/state"
private let maxRetries = 20

private func isLocalHost(_ url: URL?) -> Bool {
    guard let host = url?.host?.lowercased() else { return false }
    return host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"
}

private func jsonFragment(_ value: Any) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
       let s = String(data: data, encoding: .utf8) {
        return s
    }
    return "null"
}

private let errorPageHTML = """
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{height:100%;margin:0;background:#0e0f12;color:#f2f3f5;font:15px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 32px}
  .dot{width:14px;height:14px;border-radius:50%;background:#b8ff65;box-shadow:0 0 22px #b8ff65aa;margin-bottom:22px;animation:p 1.6s ease-in-out infinite}
  @keyframes p{0%,100%{opacity:.35}50%{opacity:1}}
  h1{font-size:22px;font-weight:650;margin:0 0 8px;letter-spacing:-.01em}
  p{margin:0 0 26px;color:#9aa0aa;max-width:380px;line-height:1.5}
  button{background:#b8ff65;color:#101114;border:0;border-radius:10px;padding:11px 26px;font:600 15px -apple-system,sans-serif;cursor:pointer}
  button:hover{filter:brightness(1.08)} button:active{transform:translateY(1px)}
  button[disabled]{opacity:.55;cursor:default}
  small{margin-top:18px;color:#6b7280}
</style></head>
<body><div class="wrap">
  <div class="dot"></div>
  <h1>The Say Less bridge is not running</h1>
  <p>This window needs the local Say Less bridge. Start it and the page will load on its own.</p>
  <button id="b" onclick="go()">Start it</button>
  <small id="s">Checking again every 2 seconds.</small>
</div>
<script>
function go(){
  var b=document.getElementById('b'); b.disabled=true; b.textContent='Starting...';
  document.getElementById('s').textContent='Starting the bridge, this window will refresh when it answers.';
  try{window.webkit.messageHandlers.sayless.postMessage({id:'err-start',action:'startBridge'});}catch(e){}
  setTimeout(function(){b.disabled=false;b.textContent='Start it';},4000);
}
</script></body></html>
"""

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var startURL: URL!
    var appName = "Say Less"
    var stateDir = defaultStateDir
    var showingError = false
    var retryCount = 0
    var retryTimer: Timer?
    var capturing = false

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) {
            app.run()
        }
    }

    // MARK: Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        let info = Bundle.main.infoDictionary ?? [:]
        appName = (info["CFBundleName"] as? String) ?? "Say Less"
        stateDir = (info["SLStateDir"] as? String) ?? defaultStateDir
        let env = ProcessInfo.processInfo.environment
        let urlString = (env["SL_START_URL"].flatMap { $0.isEmpty ? nil : $0 })
            ?? (info["SLStartURL"] as? String)
            ?? "http://127.0.0.1:8810/app"
        startURL = URL(string: urlString) ?? URL(string: "http://127.0.0.1:8810/app")!
        let width = (info["SLWindowWidth"] as? NSNumber)?.doubleValue ?? 1040
        let height = (info["SLWindowHeight"] as? NSNumber)?.doubleValue ?? 760

        buildMenu()
        buildWindow(width: width, height: height)
        loadStart()
        NSApp.activate(ignoringOtherApps: true)
    }

    // While a capture hides the window, AppKit sees no visible windows; do not quit then.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { !capturing }

    // MARK: Window

    private func buildWindow(width: Double, height: Double) {
        let bg = NSColor(srgbRed: 0x0e / 255.0, green: 0x0f / 255.0, blue: 0x12 / 255.0, alpha: 1)

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        let controller = WKUserContentController()
        controller.add(self, name: "sayless")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = bg }
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        webView.allowsBackForwardNavigationGestures = false

        let style: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                          styleMask: style, backing: .buffered, defer: false)
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = bg
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 760, height: 560)

        let content = NSView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        content.wantsLayer = true
        content.layer?.backgroundColor = bg.cgColor
        window.contentView = content
        content.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: content.topAnchor, constant: 28),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        window.center()
        let autosave = Bundle.main.bundleIdentifier ?? "com.luis.sayless.launcher"
        _ = window.setFrameAutosaveName(autosave)
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: Menu

    private func buildMenu() {
        let main = NSMenu()

        // App menu
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu(title: appName)
        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        // Edit menu
        let editItem = NSMenuItem()
        main.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        // View menu
        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let viewMenu = NSMenu(title: "View")
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadPage(_:)), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(reload)
        viewMenu.addItem(.separator())
        let actual = NSMenuItem(title: "Actual Size", action: #selector(zoomActual(_:)), keyEquivalent: "0")
        actual.target = self
        viewMenu.addItem(actual)
        let zin = NSMenuItem(title: "Zoom In", action: #selector(zoomIn(_:)), keyEquivalent: "=")
        zin.target = self
        viewMenu.addItem(zin)
        let zout = NSMenuItem(title: "Zoom Out", action: #selector(zoomOut(_:)), keyEquivalent: "-")
        zout.target = self
        viewMenu.addItem(zout)
        viewItem.submenu = viewMenu

        // Window menu
        let winItem = NSMenuItem()
        main.addItem(winItem)
        let winMenu = NSMenu(title: "Window")
        winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = winMenu

        NSApp.mainMenu = main
        NSApp.windowsMenu = winMenu
    }

    @objc func reloadPage(_ sender: Any?) {
        if !showingError, webView.url?.scheme?.hasPrefix("http") == true {
            webView.reload()
        } else {
            retryCount = 0
            loadStart()
        }
    }
    @objc func zoomActual(_ sender: Any?) { webView.pageZoom = 1.0 }
    @objc func zoomIn(_ sender: Any?) { webView.pageZoom = min(3.0, webView.pageZoom + 0.1) }
    @objc func zoomOut(_ sender: Any?) { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }

    // MARK: Loading and the error page

    private func loadStart() {
        webView.load(URLRequest(url: startURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10))
    }

    private func showErrorPage() {
        if !showingError {
            showingError = true
            webView.loadHTMLString(errorPageHTML, baseURL: nil)
        }
        scheduleRetry(after: 2)
    }

    private func scheduleRetry(after seconds: TimeInterval) {
        retryTimer?.invalidate()
        guard retryCount < maxRetries else { return }
        retryTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self = self else { return }
                self.retryCount += 1
                self.loadStart()
            }
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let u = webView.url, u.scheme == "http" || u.scheme == "https" {
            showingError = false
            retryCount = 0
            retryTimer?.invalidate()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    private func handleLoadFailure(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        // 102 = frame load interrupted (a download or policy change), not a dead bridge.
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
        showErrorPage()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        retryCount = 0
        loadStart()
    }

    // MARK: Navigation policy (127.0.0.1 and localhost stay, everything else goes to the browser)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let scheme = url.scheme?.lowercased() ?? ""

        if scheme == "about" || scheme == "data" || scheme == "blob" {
            decisionHandler(.allow); return
        }
        // target=_blank / window.open: always the default browser.
        if navigationAction.targetFrame == nil {
            if scheme == "http" || scheme == "https" || scheme == "mailto" {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel); return
        }
        let isMain = navigationAction.targetFrame?.isMainFrame ?? true
        if isMain {
            if (scheme == "http" || scheme == "https") && isLocalHost(url) {
                decisionHandler(.allow); return
            }
            if scheme == "http" || scheme == "https" || scheme == "mailto" || scheme == "tel" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel); return
            }
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: File picker and JS dialogs

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canCreateDirectories = false
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { resp in completionHandler(resp == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { resp in
            completionHandler(resp == .alertFirstButtonReturn ? field.stringValue : nil)
        }
    }

    // MARK: Native bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only the local bridge pages (and our own built-in error page) may call native actions.
        let origin = message.frameInfo.request.url
        let scheme = origin?.scheme?.lowercased() ?? ""
        let trusted = (scheme == "about") || ((scheme == "http" || scheme == "https") && isLocalHost(origin))
        guard let body = message.body as? [String: Any], let id = body["id"] as? String else { return }
        guard trusted else {
            reply(id, ["ok": false, "error": "This page is not allowed to use native actions."])
            return
        }
        let action = (body["action"] as? String) ?? ""
        switch action {
        case "ping":
            reply(id, ["ok": true, "app": appName, "version": shellVersion])

        case "copy":
            guard let text = body["text"] as? String else {
                reply(id, ["ok": false, "error": "Nothing to copy: text is missing."]); return
            }
            let pb = NSPasteboard.general
            pb.clearContents()
            let ok = pb.setString(text, forType: .string)
            reply(id, ok ? ["ok": true] : ["ok": false, "error": "The clipboard refused the text."])

        case "reveal":
            guard let path = body["path"] as? String, !path.isEmpty else {
                reply(id, ["ok": false, "error": "No path was given."]); return
            }
            guard FileManager.default.fileExists(atPath: path) else {
                reply(id, ["ok": false, "error": "That file does not exist: \(path)"]); return
            }
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            reply(id, ["ok": true])

        case "open":
            if let s = body["url"] as? String, !s.isEmpty {
                guard let u = URL(string: s), let sc = u.scheme, !sc.isEmpty else {
                    reply(id, ["ok": false, "error": "That is not a valid URL: \(s)"]); return
                }
                NSWorkspace.shared.open(u)
                reply(id, ["ok": true])
            } else if let p = body["path"] as? String, !p.isEmpty {
                guard FileManager.default.fileExists(atPath: p) else {
                    reply(id, ["ok": false, "error": "That file does not exist: \(p)"]); return
                }
                NSWorkspace.shared.open(URL(fileURLWithPath: p))
                reply(id, ["ok": true])
            } else {
                reply(id, ["ok": false, "error": "Nothing to open: give a url or a path."])
            }

        case "capture":
            capture(id: id, mode: (body["mode"] as? String) ?? "screen")

        case "startBridge":
            retryCount = 0
            startBridge()
            reply(id, ["ok": true])

        default:
            reply(id, ["ok": false, "error": "Unknown action: \(action)"])
        }
    }

    private func reply(_ id: String, _ payload: [String: Any]) {
        let js = "window.__saylessNative && window.__saylessNative(\(jsonFragment(id)), \(jsonFragment(payload)));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: startBridge

    private func startBridge() {
        let uid = getuid()
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            p.arguments = ["kickstart", "-k", "gui/\(uid)/\(bridgeLabel)"]
            p.standardOutput = FileHandle.nullDevice
            p.standardError = FileHandle.nullDevice
            do { try p.run(); p.waitUntilExit() } catch { /* the retry loop reports the outcome */ }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self.scheduleRetry(after: 1.2)
                }
            }
        }
    }

    // MARK: capture

    private func capture(id: String, mode: String) {
        if capturing {
            reply(id, ["ok": false, "error": "A capture is already in progress."]); return
        }
        let region = (mode == "region")
        capturing = true
        let dir = (stateDir as NSString).appendingPathComponent("captures")
        do {
            try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        } catch {
            capturing = false
            reply(id, ["ok": false, "error": "Could not create the captures folder: \(dir)"]); return
        }
        let out = (dir as NSString).appendingPathComponent("capture-\(Int(Date().timeIntervalSince1970)).png")

        // Fully transparent, not orderOut: the capture tool then never sees this window, and the app
        // stays the active app so the window comes straight back (orderOut let another app take focus).
        window.alphaValue = 0
        window.ignoresMouseEvents = true
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 0.45) {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            p.arguments = region ? ["-x", "-i", out] : ["-x", out]
            p.standardOutput = FileHandle.nullDevice
            p.standardError = FileHandle.nullDevice
            var launched = false
            do { try p.run(); launched = true } catch { launched = false }
            if launched {
                // Screen capture is quick; region capture waits on the human. Neither may hang forever.
                let limit: TimeInterval = region ? 120 : 20
                let deadline = Date().addingTimeInterval(limit)
                while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
                if p.isRunning { p.terminate() }
                p.waitUntilExit()
            }
            let size = ((try? FileManager.default.attributesOfItem(atPath: out))?[.size] as? NSNumber)?.intValue ?? 0
            let exists = FileManager.default.fileExists(atPath: out)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self.capturing = false
                    self.window.alphaValue = 1
                    self.window.ignoresMouseEvents = false
                    self.window.makeKeyAndOrderFront(nil)
                    NSApp.activate(ignoringOtherApps: true)
                    if exists && size > 1000 {
                        self.reply(id, ["ok": true, "path": out])
                        return
                    }
                    if exists { try? FileManager.default.removeItem(atPath: out) }
                    if region && !exists {
                        self.reply(id, ["ok": false, "error": "cancelled"])
                    } else {
                        self.reply(id, ["ok": false, "error": "Screen capture did not produce an image. Allow Screen Recording for this app in System Settings > Privacy & Security > Screen Recording, then try again."])
                    }
                }
            }
        }
    }
}
