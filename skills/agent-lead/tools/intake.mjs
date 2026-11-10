#!/usr/bin/env node
// Turn open GitHub issues into plan items, so work that arrives as issues joins the same checklist. Read only: it
// never closes, edits or comments on an issue.
//   node <tools>/intake.mjs [--label <name>] [--to "<heading text>"] [--dry] [--from <issues.json>]
// Reads `gh issue list` (the gh CLI, signed in by the user) or a JSON file of [{ number, title, labels }]. Issues
// already in the plan (by "#number") are skipped. New ones are appended under the heading that contains --to
// (default "Inbox", created at the end of the plan when missing) as "- [ ] <title> (#12) `{hard}`". An issue
// labelled "easy" or "good first issue" gets `{easy}`. Then order them: the user's priorities decide.
import { readFileSync, writeFileSync } from 'node:fs'
import { abs, buildPage, config, options, run } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const label = o.opt('--label')
const to = o.opt('--to', 'Inbox')
const dry = o.flag('--dry')
const from = o.opt('--from')
if (!config.plan) { console.error('No plan file found. Set "plan" in .agent-lead/config.json.'); process.exit(2) }
let issues
if (from) issues = JSON.parse(readFileSync(abs(from), 'utf8'))
else {
  const r = run('gh', ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels', ...(label ? ['--label', label] : [])])
  if (r.status !== 0) { console.log(`gh failed (is the GitHub CLI installed and signed in?): ${r.out.trim().split('\n')[0]}`); process.exit(1) }
  issues = JSON.parse(r.stdout)
}
const planPath = abs(config.plan)
const lines = readFileSync(planPath, 'utf8').replace(/\n+$/, '').split('\n')
const known = new Set([...lines.join('\n').matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])))
const fresh = issues.filter((i) => !known.has(i.number)).sort((a, b) => a.number - b.number)
const item = (i) => `- [ ] ${String(i.title).replace(/\s+/g, ' ').trim()} (#${i.number}) \`{${(i.labels ?? []).some((l) => /^(easy|good first issue)$/i.test(l.name ?? l)) ? 'easy' : 'hard'}}\``
if (!fresh.length) { console.log(`no new issues (${issues.length} open, all in ${config.plan})`); process.exit(0) }
if (dry) { console.log(fresh.map(item).join('\n')); process.exit(0) }
let at = lines.findIndex((l) => /^#{2,3}\s/.test(l) && l.toLowerCase().includes(to.toLowerCase()))
if (at < 0) { lines.push('', `### ${to}`); at = lines.length - 1 }
let end = at + 1
while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++
while (end > at + 1 && !lines[end - 1].trim()) end--
lines.splice(end, 0, ...fresh.map(item))
writeFileSync(planPath, lines.join('\n') + '\n')
console.log(`${config.plan}: + ${fresh.length} item(s) under "${lines[at].replace(/^#+\s*/, '')}": ${fresh.map((i) => `#${i.number}`).join(', ')}`)
const t = buildPage()
if (t) console.log(`checklist page rebuilt: ${t.done} done · ${t.partial} in progress · ${t.todo} not started`)
