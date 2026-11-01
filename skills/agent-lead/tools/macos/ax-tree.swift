// Read-only: print one app's accessibility tree, window by window, as JSON lines:
//   {"window": n, "title": "...", "depth": d, "role": "AXButton", "subrole": "...", "name": "...", "value": "...",
//    "enabled": true, "x": .., "y": .., "w": .., "h": ..}
// Usage: swift ax-tree.swift <pid> [max nodes, default 3000]   (brings the app forward: AX sees only the current Space)
// The app running it (the terminal, Emdash, the IDE) needs Accessibility in System Settings → Privacy & Security.
import AppKit
import ApplicationServices
import Foundation

guard CommandLine.arguments.count > 1, let pid = Int32(CommandLine.arguments[1]) else {
  FileHandle.standardError.write("usage: swift ax-tree.swift <pid> [max nodes]\n".data(using: .utf8)!)
  exit(2)
}
let maxNodes = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 3000 : 3000
if !AXIsProcessTrusted() {
  FileHandle.standardError.write("not trusted: allow this app in System Settings → Privacy & Security → Accessibility\n".data(using: .utf8)!)
  exit(3)
}

func attr(_ el: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}
func str(_ el: AXUIElement, _ name: String) -> String? {
  guard let v = attr(el, name) else { return nil }
  if let s = v as? String { return s.isEmpty ? nil : String(s.prefix(120)) }
  if let n = v as? NSNumber { return n.stringValue }
  return nil
}
func frame(_ el: AXUIElement) -> CGRect? {
  guard let p = attr(el, kAXPositionAttribute), let s = attr(el, kAXSizeAttribute) else { return nil }
  var pt = CGPoint.zero
  var sz = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &pt)
  AXValueGetValue(s as! AXValue, .cgSize, &sz)
  return CGRect(origin: pt, size: sz)
}

var count = 0
func emit(_ el: AXUIElement, window: Int, title: String, depth: Int) {
  guard count < maxNodes else { return }
  count += 1
  var o: [String: Any] = ["window": window, "title": title, "depth": depth]
  if let r = str(el, kAXRoleAttribute) { o["role"] = r }
  if let r = str(el, kAXSubroleAttribute) { o["subrole"] = r }
  if let n = str(el, kAXTitleAttribute) ?? str(el, kAXDescriptionAttribute) ?? str(el, kAXHelpAttribute) { o["name"] = n }
  if let v = str(el, kAXValueAttribute) { o["value"] = v }
  if let e = attr(el, kAXEnabledAttribute) as? Bool { o["enabled"] = e }
  if let f = frame(el) { o["x"] = Int(f.minX); o["y"] = Int(f.minY); o["w"] = Int(f.width); o["h"] = Int(f.height) }
  if let data = try? JSONSerialization.data(withJSONObject: o), let line = String(data: data, encoding: .utf8) { print(line) }
  for child in (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? [] { emit(child, window: window, title: title, depth: depth + 1) }
}

// Accessibility lists only windows on the current desktop (Space): bring the app forward first.
NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
Thread.sleep(forTimeInterval: 0.8)
let app = AXUIElementCreateApplication(pid)
let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
for (i, w) in windows.enumerated() { emit(w, window: i, title: str(w, kAXTitleAttribute) ?? "", depth: 0) }
// The menu bar is part of a desktop app's features too.
if let bar = attr(app, kAXMenuBarAttribute) { emit(bar as! AXUIElement, window: -1, title: "menu bar", depth: 0) }
