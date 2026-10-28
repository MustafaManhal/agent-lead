#!/usr/bin/env node
// Token saver for edits: replace lines A-B of a file with stdin (no need to repeat the old text), or insert after
// line A. Line numbers come from outline.mjs / show.mjs. Prints a 2-line confirmation with the new range.
//   node <tools>/rep.mjs <file> <A>-<B> < new.txt        replace lines A..B (inclusive)
//   node <tools>/rep.mjs <file> <A>+ < new.txt           insert after line A (0 = top of file)
//   node <tools>/rep.mjs <file> <A>-<B> --delete         remove lines A..B
//        add --expect "<text>" to refuse when line A does not contain that text (guards stale line numbers)
import fs from 'node:fs'

const args = process.argv.slice(2)
const [file, range] = args
const ei = args.indexOf('--expect')
const expect = ei >= 0 ? args[ei + 1] : null
if (!file || !range) throw new Error('usage: rep.mjs <file> <A>-<B>|<A>+ [--delete] [--expect text] < new')
const lines = fs.readFileSync(file, 'utf8').split('\n')
const m = /^(\d+)(?:-(\d+)|(\+))$/.exec(range)
if (!m) throw new Error(`bad range ${range}`)
const a = Number(m[1])
if (expect && !(lines[a - 1] ?? '').includes(expect)) {
  console.log(`refused: ${file}:${a} is "${(lines[a - 1] ?? '').trim().slice(0, 100)}", expected it to contain "${expect}"`)
  process.exit(1)
}
const input = args.includes('--delete') ? [] : fs.readFileSync(0, 'utf8').replace(/\n$/, '').split('\n')
if (m[3]) lines.splice(a, 0, ...input)
else lines.splice(a - 1, Number(m[2]) - a + 1, ...input)
fs.writeFileSync(file, lines.join('\n'))
const from = m[3] ? a + 1 : a
console.log(`${file}: ${m[3] ? 'inserted' : 'replaced'} → lines ${from}-${from + input.length - 1} (${input.length} lines), file now ${lines.length} lines`)
