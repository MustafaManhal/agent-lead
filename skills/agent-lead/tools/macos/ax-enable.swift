// Turn on the accessibility tree of an Electron app's web content (Electron's AXManualAccessibility), so REA can
// read and press its buttons. Usage: swift ax-enable.swift <pid>. Changes nothing in the app's data.
import ApplicationServices
import Foundation
let pid = pid_t(Int32(CommandLine.arguments[1])!)
print("trusted:", AXIsProcessTrusted())
let app = AXUIElementCreateApplication(pid)
let r = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
print("AXManualAccessibility set:", r == .success ? "ok" : "error \(r.rawValue)")
