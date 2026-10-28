// The macOS clipboard as HTML or text, for checking copy and paste between your app and another one.
//   swift clip.swift set <file.html>       put the file on the clipboard as HTML (and as plain text)
//   swift clip.swift get [<out.html>]      print (or save) the clipboard's HTML, else its plain text
//   swift clip.swift types                 list the types on the clipboard
import AppKit
let a = CommandLine.arguments
let pb = NSPasteboard.general
guard a.count > 1 else { print("usage: swift clip.swift set <file.html> | get [out.html] | types"); exit(2) }
switch a[1] {
case "set":
  guard a.count > 2, let html = try? String(contentsOfFile: a[2], encoding: .utf8) else { print("cannot read file"); exit(1) }
  pb.clearContents()
  pb.setString(html, forType: .html)
  pb.setString(html, forType: .string)
  print("clipboard set (\(html.count) chars of HTML)")
case "get":
  let text = pb.string(forType: .html) ?? pb.string(forType: .string) ?? ""
  if a.count > 2 { try! text.write(toFile: a[2], atomically: true, encoding: .utf8); print("saved \(text.count) chars to \(a[2])") }
  else { print(text) }
case "types":
  print((pb.types ?? []).map { $0.rawValue }.joined(separator: "\n"))
default:
  print("unknown command \(a[1])"); exit(2)
}
