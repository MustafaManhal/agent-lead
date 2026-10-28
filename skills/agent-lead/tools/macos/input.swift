// Post real input (clicks, drags, keys) to a desktop app, for checks a browser driver cannot reach (native or
// Electron apps), with the user's permission. Always pass --pid <target pid> (windows.swift prints it) so nothing
// goes to another app. Needs the Accessibility permission for the terminal. Usage:
//   swift input.swift click <x> <y>        (screen points, top-left origin)
//   swift input.swift key <key> [cmd] [shift] [alt]   (key: a letter, "return", "escape", "tab")
//   swift input.swift drag <x1> <y1> <x2> <y2>         (press, move in steps, release)
import AppKit
import CoreGraphics
import Foundation
var a = CommandLine.arguments
// --pid <pid>: send nothing unless that process is the frontmost app (input must never land in another app).
if let i = a.firstIndex(of: "--pid"), i + 1 < a.count, let pid = Int32(a[i + 1]) {
  a.removeSubrange(i...(i + 1))
  let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
  if front != pid {
    FileHandle.standardError.write("refused: frontmost pid \(front.map(String.init) ?? "none") is not \(pid)\n".data(using: .utf8)!)
    exit(2)
  }
}
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap); usleep(30_000) }
if a[1] == "click" {
  let p = CGPoint(x: Double(a[2])!, y: Double(a[3])!)
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
} else if a[1] == "drag" {
  let p1 = CGPoint(x: Double(a[2])!, y: Double(a[3])!), p2 = CGPoint(x: Double(a[4])!, y: Double(a[5])!)
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p1, mouseButton: .left))
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p1, mouseButton: .left))
  for i in 1...20 {
    let t = Double(i) / 20
    let p = CGPoint(x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left))
  }
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p2, mouseButton: .left))
} else if a[1] == "key" {
  let codes: [String: CGKeyCode] = ["a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46, "return": 36, "tab": 48, "escape": 53, "delete": 51]
  guard let code = codes[a[2]] else { print("unknown key"); exit(1) }
  var flags: CGEventFlags = []
  if a.contains("cmd") { flags.insert(.maskCommand) }
  if a.contains("shift") { flags.insert(.maskShift) }
  if a.contains("alt") { flags.insert(.maskAlternate) }
  let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true); down?.flags = flags; post(down)
  let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false); up?.flags = flags; post(up)
}
