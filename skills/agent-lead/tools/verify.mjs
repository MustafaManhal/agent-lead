#!/usr/bin/env node
// The mechanical half of a review, with no model in it: is the report there, did the worker stay inside the brief's
// files, are dependencies, the plan, .agent-lead/ and secrets untouched, do approved tests still stand, do the checks
// pass. Run it in the worker's checkout before reading anything; read the diff only when it prints PASS lines.
//   node <tools>/verify.mjs <brief.md> [--report <path>] [--no-check]
//   node <tools>/verify.mjs <brief.md> --tests-only      tests-first round: only test files may change; their
//                                                        hashes are saved next to the brief and later runs FAIL
//                                                        when the build round edits them
// The brief may list what the worker may touch under "## Files" (backticked paths, folders ending in /, globs
// with *). Without that section the scope check is skipped. Exit 0 when nothing failed, 1 otherwise.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, git, options, root, run, toolsDir } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const testsOnly = o.flag('--tests-only')
const noCheck = o.flag('--no-check')
const reportArg = o.opt('--report')
const brief = args[0] ? path.resolve(args[0]) : null
if (!brief || !existsSync(brief)) {
  console.error('usage: verify.mjs <brief.md> [--report path] [--tests-only] [--no-check]')
  process.exit(2)
}
const base = brief.replace(/(-\d+)?\.md$/, '')
const report = reportArg ? path.resolve(reportArg) : `${base}.report.md`
const testsFile = `${base}.tests.json`
const out = []
let failed = 0
const pass = (m) => out.push(`PASS ${m}`)
const warn = (m) => out.push(`WARN ${m}`)
const fail = (m) => { failed++; out.push(`FAIL ${m}`) }
const list = (a, n = 6) => a.slice(0, n).join(', ') + (a.length > n ? `, … ${a.length - n} more` : '')

// 1. The report.
if (!existsSync(report)) fail(`no report at ${report}`)
else {
  const text = readFileSync(report, 'utf8')
  const missing = (testsOnly ? ['Left or unsure'] : ['Built', 'Check output', 'Left or unsure']).filter((h) => !new RegExp(`^##+ ${h}`, 'mi').test(text))
  if (missing.length) fail(`report lacks section(s): ${missing.join(', ')}`)
  else pass('report has its sections')
}

// 2. What changed (tracked and untracked), without the build outputs.
const changed = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean)
  .map((l) => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''))
  .filter((f) => f !== config.page.out && f !== '.agent-lead/handoff.md')
if (!changed.length) fail('nothing changed in this checkout')

// 3. Scope: the brief's "## Files" section.
const section = /^## Files[^\n]*\n([\s\S]*?)(?=^## )/m.exec(readFileSync(brief, 'utf8') + '\n## ')
const allowed = section ? [...section[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]) : []
const matches = (file, pat) => pat.includes('*') ? new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(file) : pat.endsWith('/') ? file.startsWith(pat) : file === pat
const isTest = (f) => /(^|\/)(tests?|__tests__|e2e|fixtures)\/|\.(test|spec)\.[a-z]+$/.test(f)
if (allowed.length) {
  const outside = changed.filter((f) => !allowed.some((p) => matches(f, p)) && !isTest(f))
  if (outside.length) fail(`outside the brief's files: ${list(outside)}`)
  else pass(`${changed.length} changed file(s), all inside the brief's files`)
} else out.push(`SKIP scope (the brief has no "## Files" section): ${changed.length} changed file(s)`)

// 4. Things a worker never touches.
const guarded = changed.filter((f) => f.startsWith('.agent-lead/') || f === config.plan || (/(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f)))
if (guarded.length) fail(`worker touched protected files: ${list(guarded)}`)
const locks = changed.filter((f) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock)$/.test(f))
const deps = (text) => { try { const j = JSON.parse(text); return JSON.stringify([j.dependencies ?? {}, j.devDependencies ?? {}, j.peerDependencies ?? {}]) } catch { return '' } }
const pkgChanged = changed.filter((f) => path.basename(f) === 'package.json').filter((f) => deps(git('show', `HEAD:${f}`).stdout) !== deps(existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), 'utf8') : ''))
if (locks.length || pkgChanged.length) fail(`dependencies changed: ${list([...pkgChanged, ...locks])}`)
else if (!guarded.length) pass('no dependency, plan, .agent-lead or .env changes')

// 5. Secrets and risky code in what was added.
const added = git('diff', 'HEAD', '--unified=0').stdout.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n') + '\n' +
  git('ls-files', '--others', '--exclude-standard').stdout.split('\n').filter(Boolean).map((f) => path.join(root, f)).filter((f) => existsSync(f) && statSync(f).size < 400_000).map((f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
const SECRET = [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /(api[_-]?key|secret|token|passw(or)?d)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+]{20,}["']/i]
const RISKY = [[/dangerouslySetInnerHTML|\.innerHTML\s*=/, 'raw HTML injection'], [/\beval\(|new Function\(/, 'eval'], [/(SELECT|INSERT|UPDATE|DELETE)\b[^\n;]*(\$\{|["']\s*\+)/i, 'SQL built from strings'], [/child_process[^\n]*\bexec\(|\bexecSync\(`/, 'shell command built from strings']]
if (SECRET.some((r) => r.test(added))) fail('something that looks like a secret was added (key, token or private key)')
else pass('no secrets in the added lines')
for (const [r, name] of RISKY) if (r.test(added)) warn(`added code uses ${name}: read that part`)

// 6. Tests-first: only tests in the first round, and those tests stay as approved afterwards.
const sha = (f) => createHash('sha1').update(readFileSync(path.join(root, f))).digest('hex')
if (testsOnly) {
  const notTests = changed.filter((f) => !isTest(f))
  if (notTests.length) fail(`tests-first round changed non-test files: ${list(notTests)}`)
  else if (changed.length) {
    writeFileSync(testsFile, JSON.stringify(Object.fromEntries(changed.filter((f) => existsSync(path.join(root, f))).map((f) => [f, sha(f)])), null, 1) + '\n')
    pass(`${changed.length} test file(s) recorded in ${path.basename(testsFile)}; approve them, then send the build round`)
  }
} else if (existsSync(testsFile)) {
  const want = JSON.parse(readFileSync(testsFile, 'utf8'))
  const edited = Object.entries(want).filter(([f, h]) => !existsSync(path.join(root, f)) || sha(f) !== h).map(([f]) => f)
  if (edited.length) fail(`approved tests were changed or removed: ${list(edited)}`)
  else pass(`${Object.keys(want).length} approved test file(s) unchanged`)
}

// 7. The checks (in a tests-first round they are expected to fail: the code is not there yet).
if (!noCheck && !testsOnly) {
  const c = run('node', [path.join(toolsDir, 'check.mjs')])
  if (c.status === 0) pass(c.out.trim().split('\n')[0])
  else if (c.status === 2) out.push('SKIP checks (none configured)')
  else fail(`checks:\n${c.out.trim().split('\n').slice(0, 12).map((l) => '  ' + l).join('\n')}`)
}
console.log(out.join('\n'))
console.log(failed ? `\n${failed} failed: send a review round with these points before reading the diff.` : '\nMechanical checks pass: now read the diff and the risky parts (review.md).')
process.exit(failed ? 1 : 0)
