#!/usr/bin/env node
// What to work on next, in plan order: the first item that is not done (and its first open part), the milestone it
// belongs to, and the notes and source files that mention its key words, ranked. Use it before writing a brief.
//   node <tools>/next.mjs [--all]          --all also lists every open item of that milestone
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { abs, config, root } from './lib.mjs'

if (!config.plan) {
  console.error('No plan file found. Set "plan" in .agent-lead/config.json.')
  process.exit(2)
}
const plan = readFileSync(abs(config.plan), 'utf8').split('\n')
const sectionFilter = config.page.sections ? new RegExp(config.page.sections) : null

// Items: "- [s] text" plus indented continuation lines, under the nearest "##" (and "###") heading.
const items = []
let section = null
let sub = ''
for (let i = 0; i < plan.length; i++) {
  const line = plan[i]
  const h = /^(#{2,3})\s+(.*)$/.exec(line)
  if (h) {
    if (h[1] === '##') {
      section = sectionFilter && !sectionFilter.test(h[2]) ? null : h[2]
      sub = ''
    } else sub = h[2]
    continue
  }
  if (!section) continue
  const m = /^(\s*)- \[(x|~| )\]\s+(.*)$/.exec(line)
  if (m) items.push({ section, sub, status: m[2], line: i + 1, text: m[3] })
  else if (/^\s{2,}\S/.test(line) && items.at(-1)?.line) items.at(-1).text += ' ' + line.trim()
}
// Items marked as waiting on the user are listed but not picked.
const waiting = (it) => /waiting (for|on) the user/i.test(it.text)
const open = items.filter((it) => it.status !== 'x' && !waiting(it))
if (!open.length) {
  console.log('Every plan item is done.')
  process.exit(0)
}
const it = open[0]
const where = [it.section, it.sub].filter(Boolean).join(' · ')
const inSection = open.filter((o) => o.section === it.section)
const part = /\[( |~)\]\s*([^[]{8,200})/.exec(it.text)

console.log(`${where} · ${config.plan}:${it.line}`)
console.log(`[${it.status}] ${it.text.slice(0, 600)}${it.text.length > 600 ? '…' : ''}`)
if (part) console.log(`\nFirst open part: [${part[1]}] ${part[2].trim()}`)
const blocked = items.filter((o) => o.status !== 'x' && waiting(o))
console.log(`\nOpen in this milestone: ${inSection.length}${blocked.length ? ` · waiting on the user: ${blocked.map((b) => `${config.plan}:${b.line}`).join(', ')}` : ''}`)
if (process.argv.includes('--all')) for (const o of inSection) console.log(`  ${config.plan}:${o.line} [${o.status}] ${o.text.slice(0, 110)}`)

const STOP = new Set(
  'about above added adding after again along also another before below between built could does doing done each every first found from have lead user worker into item items like made make more most much only other same second should show shows still such than that their them then there these they third this those through under until using what when where which while will with within without would'.split(' '),
)
const words = [...new Set(((part?.[2] ?? it.text).match(/[A-Za-z][A-Za-z-]{4,}/g) ?? []).map((w) => w.toLowerCase()))]
  .filter((w) => !STOP.has(w))
  .slice(0, 6)
if (!words.length) process.exit(0)

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', 'target'])
function rank(dirs, exts) {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (exts.some((x) => e.name.endsWith(x)) && statSync(p).size < 2_000_000) {
        const t = readFileSync(p, 'utf8').toLowerCase()
        const hits = words.filter((w) => t.includes(w)).length
        if (hits) out.push([path.relative(root, p), hits])
      }
    }
  }
  for (const d of dirs) if (existsSync(abs(d))) walk(abs(d))
  return out.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, h]) => `${p} (${h})`)
}
console.log(`\nKey words: ${words.join(', ')}`)
console.log('Notes: ' + (rank(config.notes, ['.md']).join(', ') || '(none)'))
console.log('Source files: ' + (rank(config.sources, config.sourceExts).join(', ') || '(none yet)'))
