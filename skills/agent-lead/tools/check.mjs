#!/usr/bin/env node
// Run the project's checks (typecheck, lint, tests) and print only what matters: one "OK" line when everything
// passes ("OK types · lint · tests 412 passed"), else the first errors of each failing check.
//   node <tools>/check.mjs [--only name,name]
// The checks come from .agent-lead/config.json ("checks": [{ "name", "run" }]) or are detected from the project.
import { config, options, sh } from './lib.mjs'

const args = process.argv.slice(2)
const only = options(args).opt('--only')?.split(',')
const checks = config.checks.filter((c) => !only || only.includes(c.name))
if (!checks.length) {
  console.log('No checks found. Add "checks" to .agent-lead/config.json (see tools/config.example.json).')
  process.exit(2)
}

/** A short result for a passing check: the test summary when the output has one. */
function passLine(name, out) {
  const vitest = /Tests\s+(\d+ passed[^\n]*)/.exec(out)?.[1]
  const jest = /Tests:\s+([^\n]*)/.exec(out)?.[1]
  const pytest = /=+ ([^=\n]*passed[^=\n]*) =+/.exec(out)?.[1] ?? /^(\d+ passed[^\n]*)/m.exec(out)?.[1]
  const summary = (vitest ?? jest ?? pytest)?.trim()
  return summary ? `${name} ${summary.replace(/\s*\(\d+\)$/, '')}` : name
}

/** The lines worth reading from a failing check, capped. */
function failLines(out) {
  const lines = out.split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean)
  const interesting = lines.filter((l) => /error|fail|✗|×|assert|expected|exception|panic|cannot|not found/i.test(l))
  const picked = (interesting.length ? interesting : lines.slice(-12)).slice(0, 14)
  return [...new Set(picked)].map((l) => '  ' + (l.length > 220 ? l.slice(0, 217) + '…' : l))
}

const passed = []
const failed = []
for (const c of checks) {
  const r = sh(c.run)
  if (r.status === 0) passed.push(passLine(c.name, r.out))
  else failed.push({ name: c.name, lines: failLines(r.out) })
}
if (!failed.length) {
  console.log(`OK ${passed.join(' · ')}`)
  process.exit(0)
}
for (const f of failed) console.log(`FAIL ${f.name}\n${f.lines.join('\n')}`)
if (passed.length) console.log(`passed: ${passed.join(' · ')}`)
process.exit(1)
