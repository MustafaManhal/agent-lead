#!/usr/bin/env node
// Token saver: print just one declaration (function, component, const, interface...) by name, with line numbers,
// found by brace matching from its first line. Several names may be given.
//   node <tools>/show.mjs <file> <name> [<name> ...] [--head N]   (--head: only the first N lines of each)
import fs from 'node:fs'

const args = process.argv.slice(2)
const hi = args.indexOf('--head')
const head = hi >= 0 ? Number(args.splice(hi, 2)[1]) : Infinity
const [file, ...names] = args
if (!file || !names.length) throw new Error('usage: show.mjs <file> <name> [...] [--head N]')
const lines = fs.readFileSync(file, 'utf8').split('\n')
for (const name of names) {
  const re = new RegExp(`^\\s*(export\\s+)?(default\\s+)?(async\\s+)?(function\\*?\\s+${name}\\b|(const|let|var)\\s+${name}\\b|class\\s+${name}\\b|interface\\s+${name}\\b|type\\s+${name}\\b|enum\\s+${name}\\b|${name}\\s*[:(])`)
  const start = lines.findIndex((l) => re.test(l))
  if (start < 0) {
    console.log(`--- ${name}: not found`)
    continue
  }
  // Walk forward balancing braces/brackets/parens (strings and comments are rare enough to ignore here).
  let depth = 0
  let seen = false
  let end = start
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if ('{[('.includes(ch)) (depth++, (seen = true))
      else if ('}])'.includes(ch)) depth--
    }
    end = i
    if (seen && depth <= 0) break
    if (!seen && /;\s*$|^\s*$/.test(lines[i]) && i > start) break
  }
  const body = lines.slice(start, end + 1)
  console.log(`--- ${name} ${file}:${start + 1}-${end + 1}`)
  body.slice(0, head).forEach((l, i) => console.log(`${start + i + 1}: ${l}`))
  if (body.length > head) console.log(`… ${body.length - head} more lines`)
}
