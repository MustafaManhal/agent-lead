#!/usr/bin/env node
// Mark a checklist item (or one of its inline parts) done, optionally add a note and a progress-log line, and
// rebuild the checklist page, in one step.
//   node <tools>/done.mjs "<text the item or part starts with>" [--status x|~| ] [--note "line"] [--log "line"]
// Finds the first "[ ]" / "[~]" / "[x]" marker followed by that text in the plan and sets it (default x). --note
// adds an indented line after the item. --log appends to the progress log under today's date (when the config
// names one). Prints the changed line and the new totals; then republish the page (checklist-page.md).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { abs, buildPage, config, options } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const status = o.opt('--status', 'x')
const note = o.opt('--note')
const log = o.opt('--log')
const text = args[0]
if (!text) {
  console.error('usage: done.mjs "<item text>" [--status x|~| ] [--note "…"] [--log "…"]')
  process.exit(2)
}
if (!config.plan) {
  console.error('No plan file found. Set "plan" in .agent-lead/config.json.')
  process.exit(2)
}

const planPath = abs(config.plan)
const lines = readFileSync(planPath, 'utf8').split('\n')
const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const re = new RegExp(`\\[( |~|x)\\]( \\*\\*In order:\\*\\*)? ?(${esc})`)
const at = lines.findIndex((l) => re.test(l))
if (at < 0) {
  console.log(`Not found in ${config.plan}: "${text}"`)
  process.exit(1)
}
lines[at] = lines[at].replace(re, (_, _s, order, t) => `[${status}]${order ?? ''} ${t}`)
if (note) {
  const indent = /^(\s+)\S/.exec(lines[at + 1] ?? '')?.[1] ?? '      '
  lines.splice(at + 1, 0, ...note.split('\n').map((l) => indent + l))
}
writeFileSync(planPath, lines.join('\n'))
console.log(`${config.plan}:${at + 1}: ${lines[at].trim().slice(0, 150)}`)

if (log && config.progressLog) {
  const logPath = abs(config.progressLog)
  const day = new Date().toISOString().slice(0, 10)
  let body = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '# Progress log\n'
  if (!body.includes(`## ${day}`)) body = body.replace(/\s*$/, `\n\n## ${day}\n`)
  writeFileSync(logPath, body.replace(/\s*$/, `\n- ${log}\n`))
  console.log(`${config.progressLog}: + ${log.slice(0, 120)}`)
}
const t = buildPage()
if (t) console.log(`checklist page rebuilt: ${t.done} done · ${t.partial} in progress · ${t.todo} not started · next: ${t.next ?? 'none'}`)
