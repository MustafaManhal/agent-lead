#!/usr/bin/env node
// Turns a markdown checklist (the implementation plan) into one self-contained HTML page with progress per
// milestone. No dependencies.
//   node plan-page.mjs <plan.md> [out.html] [--title "Project"]
// Markers: "- [x]" done, "- [~]" partial, "- [ ]" open. Inline "[x] a. …" markers inside an item count as parts.
// Headings "## …" / "### …" become sections. Prints a JSON summary with the totals.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
const titleAt = args.indexOf('--title')
const title = titleAt >= 0 ? args.splice(titleAt, 2)[1] : null
const [src, out = src.replace(/\.md$/i, '') + '.html'] = args
if (!src) {
  console.error('usage: node plan-page.mjs <plan.md> [out.html] [--title "Project"]')
  process.exit(2)
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(x|~| )\]/g, (_, m) => `<span class="chip ${m === 'x' ? 'done' : m === '~' ? 'part' : 'open'}">${m === 'x' ? '✓' : m === '~' ? '~' : '○'}</span>`)

const lines = readFileSync(src, 'utf8').split('\n')
const sections = []
let section = { title: 'Plan', level: 2, items: [] }
let item = null
let docTitle = title
for (const raw of lines) {
  const line = raw.replace(/\s+$/, '')
  const h = line.match(/^(#{1,3})\s+(.*)$/)
  if (h) {
    if (h[1].length === 1) {
      docTitle ??= h[2]
      continue
    }
    if (section.items.length || section.title !== 'Plan') sections.push(section)
    section = { title: h[2], level: h[1].length, items: [] }
    item = null
    continue
  }
  const m = line.match(/^(\s*)- \[(x|~| )\]\s+(.*)$/)
  if (m) {
    item = { status: m[2], text: m[3], indent: m[1].length, notes: [] }
    section.items.push(item)
    continue
  }
  if (item && /^\s{2,}\S/.test(line)) item.notes.push(line.trim())
  else if (!line.trim()) item = null
}
sections.push(section)

const count = (items) => {
  const c = { done: 0, part: 0, open: 0 }
  for (const i of items) c[i.status === 'x' ? 'done' : i.status === '~' ? 'part' : 'open']++
  return c
}
const all = sections.flatMap((s) => s.items)
const total = count(all)
const pct = (c) => {
  const n = c.done + c.part + c.open
  return n ? Math.round(((c.done + c.part / 2) / n) * 100) : 0
}

const body = sections
  .filter((s) => s.items.length)
  .map((s) => {
    const c = count(s.items)
    const rows = s.items
      .map((i) => `<li class="${i.status === 'x' ? 'done' : i.status === '~' ? 'part' : 'open'}" style="margin-left:${Math.min(i.indent, 8) * 6}px">${inline(`[${i.status}] `)}<span>${inline(i.text)}${i.notes.length ? `<small>${i.notes.map(inline).join(' ')}</small>` : ''}</span></li>`)
      .join('\n')
    return `<section><h2>${inline(s.title)}<span class="count">${c.done}/${s.items.length}</span></h2><div class="bar"><i style="width:${pct(c)}%"></i></div><ul>${rows}</ul></section>`
  })
  .join('\n')

const name = docTitle ?? basename(src)
const html = `<title>${esc(name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#fafaf9;--card:#fff;--ink:#1c1917;--muted:#78716c;--line:#e7e5e4;--done:#15803d;--part:#b45309;--open:#a8a29e;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0c0a09;--card:#1c1917;--ink:#f5f5f4;--muted:#a8a29e;--line:#292524;--done:#4ade80;--part:#fbbf24;--open:#57534e;--accent:#60a5fa;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0c0a09;--card:#1c1917;--ink:#f5f5f4;--muted:#a8a29e;--line:#292524;--done:#4ade80;--part:#fbbf24;--open:#57534e;--accent:#60a5fa;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px 16px}
main{max-width:860px;margin:0 auto}
header h1{font-size:22px;margin:0 0 4px}
header p{color:var(--muted);margin:0 0 16px}
.totals{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.totals div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:110px}
.totals b{display:block;font-size:20px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
h2{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;gap:12px}
.count{color:var(--muted);font-weight:500}
.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-bottom:10px}
.bar i{display:block;height:100%;background:var(--done)}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)}
li:first-child{border-top:0}
li.done>span{color:var(--muted)}
small{display:block;color:var(--muted);margin-top:2px}
.chip{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;font-weight:700;color:var(--card)}
.chip.done{background:var(--done)}.chip.part{background:var(--part)}.chip.open{background:transparent;color:var(--open);border:1.5px solid var(--open);width:15px;height:15px}
span .chip{width:14px;height:14px;font-size:9px;vertical-align:-2px}
code{font-size:12px;background:var(--line);padding:1px 4px;border-radius:4px}
</style>
<main>
<header><h1>${esc(name)}</h1><p>${pct(total)}% complete · updated ${new Date().toISOString().slice(0, 10)}</p></header>
<div class="totals"><div><b>${total.done}</b>done</div><div><b>${total.part}</b>in progress</div><div><b>${total.open}</b>not started</div></div>
${body}
</main>
`
writeFileSync(out, html)
console.log(JSON.stringify({ out, done: total.done, partial: total.part, todo: total.open, percent: pct(total) }))
