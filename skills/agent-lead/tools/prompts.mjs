#!/usr/bin/env node
// Every paste-ready worker prompt of the project, built from the briefs: one per brief, grouped by worker, in brief
// order. The checklist page shows them at each task with a Copy button, and a "Prompts" panel at the top shows what
// each worker does now. done.mjs and ship.mjs rebuild it, so a finished task drops out and the next prompt moves up.
//   node <tools>/prompts.mjs                     each worker's current prompt and what is queued behind it
//   node <tools>/prompts.mjs --all [--worker w]  every open prompt
//   node <tools>/prompts.mjs --missing           open plan items that have no brief yet
//   node <tools>/prompts.mjs --json <file>       the data the checklist page reads (written only when briefs exist)
// A brief names its plan item and its worker near the top:  "Item: <the plan item's first words>"  and
// "Worker: worker-1". Review rounds are <brief>-2.md, -3.md; the worker's report is <brief>.report.md.
// State of a brief: ready (paste the prompt) → report (the worker reported: review it) → round (paste the review
// round's prompt) → done (its plan item is ticked). Paths under the home folder are written with "~".
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { abs, config, git, options, root } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const jsonOut = o.opt('--json')
const only = o.opt('--worker')
const all = o.flag('--all')
const missing = o.flag('--missing')
const dir = abs('.agent-lead/briefs')
const tilde = (p) => (p.startsWith(homedir() + path.sep) ? '~' + p.slice(homedir().length) : p)
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && !f.endsWith('.report.md')).sort() : []
const names = new Set(files)

// Review rounds belong to their first brief: 03-export-2.md is round 2 of 03-export.md.
const groups = new Map()
for (const f of files) {
  const stem = f.slice(0, -3)
  const m = /^(.*)-(\d+)$/.exec(stem)
  const isRound = m && names.has(m[1] + '.md')
  const base = isRound ? m[1] : stem
  const g = groups.get(base) ?? { base, round: 1 }
  if (isRound) g.round = Math.max(g.round, Number(m[2]))
  groups.set(base, g)
}

let checkouts = {}
try {
  const common = path.resolve(root, git('rev-parse', '--git-common-dir').stdout.trim())
  for (const w of JSON.parse(readFileSync(path.join(common, 'agent-lead-workers.json'), 'utf8')).workers ?? []) checkouts[w.name] = w.path
} catch {}
const plan = config.plan && existsSync(abs(config.plan)) ? readFileSync(abs(config.plan), 'utf8') : ''
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const lead = tilde(root)

const entries = [...groups.values()].map((g) => {
  const text = readFileSync(path.join(dir, g.base + '.md'), 'utf8')
  const head = text.split('\n').slice(0, 20).join('\n')
  const named = /^Item:\s*(.+?)\s*$/m.exec(head)?.[1]
  const title = /^#\s*Task[^:]*:\s*(.+?)(?:\s*\([^)]*\))?\s*$/m.exec(head)?.[1]
  const item = (named && !named.startsWith('<') ? named : title ?? g.base).replace(/^["'`]|["'`]$/g, '')
  const worker = /^Worker:\s*([\w-]+)/m.exec(head)?.[1] ?? 'worker-1'
  const size = /^Size:\s*(easy|hard)\b/m.exec(head)?.[1] ?? null
  const reportFile = path.join(dir, g.base + '.report.md')
  const report = existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : null
  const reported = report == null ? 0 : Math.max(1, ...[...report.matchAll(/^##+ Round (\d+)/gm)].map((m) => Number(m[1])))
  const done = new RegExp(`\\[x\\]( \\*\\*In order:\\*\\*)? ?${esc(item)}`).test(plan)
  const state = done ? 'done' : reported >= g.round ? 'report' : g.round > 1 ? 'round' : 'ready'
  const briefPath = `${lead}/.agent-lead/briefs/${g.base}${g.round > 1 ? `-${g.round}` : ''}.md`
  const reportPath = `${lead}/.agent-lead/briefs/${g.base}.report.md`
  const where = checkouts[worker] ? `Work only in ${tilde(checkouts[worker])}.` : `Work only in your own checkout (${worker}).`
  const prompt =
    g.round > 1
      ? `You are ${worker}. Read ${briefPath} (review notes) and fix those points. Follow ${lead}/.agent-lead/WORKER.md. ${where} Never commit. Add a "Round ${g.round}" section to ${reportPath} when done, or if you run out of quota, then stop.`
      : `You are the worker (${worker}). Read ${lead}/.agent-lead/WORKER.md, then do the task in ${briefPath}. ${where} Never commit. When done, or if you run out of quota, write ${reportPath} as WORKER.md says, then stop.`
  return { brief: g.base + '.md', item, worker, size, round: g.round, state, prompt }
})

if (jsonOut) {
  const file = path.resolve(jsonOut)
  if (entries.length) writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), entries }, null, 1) + '\n')
  else rmSync(file, { force: true })
  console.log(`${entries.length} brief(s): ${entries.filter((e) => e.state !== 'done').length} open`)
  process.exit(0)
}
if (missing) {
  const open = plan.split('\n').map((l) => /^\s*- \[( |~)\]\s+(.*)$/.exec(l)?.[2]).filter(Boolean)
  const norm = (s) => s.toLowerCase().replace(/[`*]/g, '').replace(/\s+/g, ' ')
  const none = open.filter((t) => !entries.some((e) => norm(t).includes(norm(e.item))))
  console.log(none.length ? `${none.length} open item(s) without a brief:\n${none.map((t) => `  - ${t.slice(0, 110)}`).join('\n')}` : `every open item has a brief (${open.length} open)`)
  process.exit(none.length ? 1 : 0)
}
const LABEL = { ready: 'paste this prompt', round: 'paste this review round', report: 'reported: the lead reviews it', done: 'done' }
const workers = [...new Set(entries.map((e) => e.worker))].sort().filter((w) => !only || w === only)
if (!workers.length) console.log('no briefs yet in .agent-lead/briefs/ (write them for the whole phase: SKILL.md section 2b)')
for (const w of workers) {
  const mine = entries.filter((e) => e.worker === w && e.state !== 'done')
  console.log(`${w}: ${mine.length} open, ${entries.filter((e) => e.worker === w && e.state === 'done').length} done`)
  mine.forEach((e, i) => {
    if (!all && i > 0) return
    console.log(`  ${i === 0 ? 'now' : 'then'}: ${e.brief}${e.round > 1 ? ` (round ${e.round})` : ''} — ${LABEL[e.state]}`)
    if (e.state !== 'report') console.log(`\n${e.prompt}\n`)
  })
  if (!all && mine.length > 1) console.log(`  queued: ${mine.slice(1).map((e) => e.brief).join(', ')}`)
}
