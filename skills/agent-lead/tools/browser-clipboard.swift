// Bridge the UI-less browser's clipboard to the macOS pasteboard without activating an application.
import AppKit
import Foundation

let pasteboard = NSPasteboard.general
let formats: [(String, NSPasteboard.PasteboardType)] = [
    ("text/html", .html), ("text/plain", .string), ("image/png", .png),
]
if CommandLine.arguments.dropFirst().first == "read" {
    var items = [[String: String]]()
    for (mime, type) in formats {
        if let data = pasteboard.data(forType: type) {
            items.append(["type": mime, "data": data.base64EncodedString()])
        }
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: items))
} else {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let items = try JSONSerialization.jsonObject(with: input) as! [[String: String]]
    pasteboard.clearContents()
    for item in items {
        if let type = formats.first(where: { $0.0 == item["type"] })?.1,
           let data = Data(base64Encoded: item["data"] ?? "") {
            pasteboard.setData(data, forType: type)
        }
    }
}
