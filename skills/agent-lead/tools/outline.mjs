#!/usr/bin/env node
// Token saver: the outline of a source file (top-level declarations with their line ranges), so only the lines
// that matter get read. With --grep, the matching lines (numbered, trimmed) instead.
//   node <tools>/outline.mjs <file> [--all] [--grep <regex>]      --all also lists nested functions
// Understands JavaScript / TypeScript, Python, Go, Rust, Swift and Kotlin declarations.
import { readFileSync } from 'node:fs'

const [file, ...rest] = process.argv.slice(2)
if (!file) {
  console.error('usage: outline.mjs <file> [--all] [--grep regex]')
  process.exit(2)
}
const lines = readFileSync(file, 'utf8').split('\n')
const gi = rest.indexOf('--grep')
if (gi >= 0) {
  const re = new RegExp(rest[gi + 1], 'i')
  let n = 0
  lines.forEach((l, i) => {
    if (re.test(l) && n++ < 80) console.log(`${i + 1}: ${l.trim().slice(0, 150)}`)
  })
  if (n > 80) console.log(`… ${n - 80} more`)
  process.exit(0)
}
const all = rest.includes('--all')
const PATTERNS = [
  // JavaScript / TypeScript
  /^(\s*)(export\s+)?(default\s+)?(async\s+)?(function\*?\s+(\w+)|const\s+(\w+)\s*[:=]|let\s+(\w+)\s*[:=]|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)\s*[=<]|enum\s+(\w+))/,
  // Python
  /^(\s*)()()(async\s+)?(def\s+(\w+)|class\s+(\w+))/,
  // Go
  /^(\s*)()()()(func\s+(?:\([^)]*\)\s*)?(\w+)|type\s+(\w+))/,
  // Rust
  /^(\s*)(pub(?:\([^)]*\))?\s+)?()(async\s+)?(fn\s+(\w+)|struct\s+(\w+)|enum\s+(\w+)|trait\s+(\w+)|impl(?:<[^>]*>)?\s+(\w+))/,
  // Swift / Kotlin
  /^(\s*)((?:public|private|internal|open|fileprivate)\s+)?()()((?:func|fun)\s+(\w+)|class\s+(\w+)|struct\s+(\w+)|enum\s+(\w+)|protocol\s+(\w+)|object\s+(\w+))/,
]
const out = []
lines.forEach((l, i) => {
  for (const p of PATTERNS) {
    const m = p.exec(l)
    if (!m) continue
    const indent = m[1].length
    if (indent > 0 && !(all && indent <= 4)) return
    const name = m.slice(6).find(Boolean)
    if (!name) return
    out.push({ line: i + 1, indent, name, kind: m[5].split(/[\s(]/)[0], exp: !!m[2] })
    return
  }
})
// A declaration runs until the next one at the same or lower indent.
for (let k = 0; k < out.length; k++) {
  const next = out.slice(k + 1).find((o) => o.indent <= out[k].indent)
  out[k].end = (next?.line ?? lines.length + 1) - 1
}
console.log(`${file}: ${lines.length} lines, ${out.length} declarations`)
for (const o of out) {
  const range = `${String(o.line).padStart(5)}-${String(o.end).padEnd(5)}`
  console.log(`${range} ${o.indent ? '  ' : ''}${o.exp ? 'export ' : ''}${o.kind} ${o.name} (${o.end - o.line + 1})`)
}
