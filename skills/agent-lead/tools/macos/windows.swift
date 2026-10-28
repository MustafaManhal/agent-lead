// Read-only: print one app's windows (pid, window id, title, frame) as JSON lines, e.g. to crop a screenshot or
// aim real input. Usage: swift windows.swift "<app name>"   (the owner name macOS shows, e.g. "Safari")
import CoreGraphics
import Foundation
guard CommandLine.arguments.count > 1 else { print("usage: swift windows.swift \"<app name>\""); exit(2) }
let owner = CommandLine.arguments[1]
// On-screen windows first; if the app has none (other Space, minimized), list all of its windows.
let onScreen = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let hasOnScreen = onScreen.contains { ($0["kCGWindowOwnerName"] as? String) == owner && ($0["kCGWindowLayer"] as? Int) == 0 }
let list = hasOnScreen ? onScreen : (CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]).filter { ($0["kCGWindowBounds"] as? [String: Any])?["Height"] as? Int ?? 0 > 200 }
for w in list where (w["kCGWindowOwnerName"] as? String) == owner && (w["kCGWindowLayer"] as? Int) == 0 {
  let b = w["kCGWindowBounds"] as? [String: Any] ?? [:]
  let o: [String: Any] = ["pid": w["kCGWindowOwnerPID"]!, "window": w["kCGWindowNumber"]!, "title": w["kCGWindowName"] ?? "",
    "x": b["X"]!, "y": b["Y"]!, "w": b["Width"]!, "h": b["Height"]!]
  print(String(data: try! JSONSerialization.data(withJSONObject: o), encoding: .utf8)!)
}
