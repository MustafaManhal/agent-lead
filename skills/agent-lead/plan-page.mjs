#!/usr/bin/env node
// Turns a markdown checklist (the implementation plan) into one self-contained HTML page: overall progress, the
// next item, and one collapsible card per milestone. Finished milestones and finished items fold away. No
// dependencies.
//
//   node plan-page.mjs <plan.md> [out.html] [--title "Project plan"] [--lede "One sentence."] [--sections "<regex>"]
//
// Markers: "- [x]" done, "- [~]" in progress, "- [ ]" not started. Indented lines continue an item. Inline
// "[x] a. …" markers inside an item are its parts. "## …" headings are milestones (only those that hold items, or
// those matching --sections); "### …" headings, or a short plain line right before items, group items inside one.
// Prints a JSON summary: { out, sections, done, partial, todo, percent, next }.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args.splice(at, 2)[1] : null
}
const titleArg = flag('--title')
const ledeArg = flag('--lede')
const sectionsArg = flag('--sections')
const [src, out = src?.replace(/\.md$/i, '') + '.html'] = args
if (!src) {
  console.error('usage: node plan-page.mjs <plan.md> [out.html] [--title "…"] [--lede "…"] [--sections "<regex>"]')
  process.exit(2)
}
const sectionFilter = sectionsArg ? new RegExp(sectionsArg) : null

const STATUS = { x: 'done', '~': 'partial', ' ': 'todo' }
const LABEL = { done: 'Done', partial: 'In progress', todo: 'Not started' }
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(x|~| )\]/g, (_, m) => `<i class="dot ${STATUS[m]}" title="${LABEL[STATUS[m]]}"></i>`)

// ---- Parse ----------------------------------------------------------------------------------------------------
const lines = readFileSync(src, 'utf8').split('\n')
let docTitle = titleArg
let lede = ledeArg
const sections = []
let section = null
let group = null
let item = null
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].replace(/\s+$/, '')
  const h = /^(#{1,3})\s+(.*)$/.exec(line)
  if (h) {
    item = null
    if (h[1] === '#') {
      docTitle ??= h[2]
      continue
    }
    if (h[1] === '##') {
      section = { title: h[2], groups: [] }
      group = { name: '', items: [] }
      section.groups.push(group)
      sections.push(section)
    } else if (section) {
      group = { name: h[2], items: [] }
      section.groups.push(group)
    }
    continue
  }
  const it = /^(\s*)- \[(x|~| )\]\s+(.*)$/.exec(line)
  if (it && section) {
    item = { status: STATUS[it[2]], text: it[3], depth: Math.floor(it[1].length / 2) }
    group.items.push(item)
    continue
  }
  if (item && /^\s{2,}\S/.test(line)) {
    item.text += ' ' + line.trim()
    continue
  }
  item = null
  if (!line.trim()) continue
  if (!section) {
    // The first plain paragraph under the title is the page's lede, unless one was given.
    if (lede === null && docTitle && !/^[-*|>]/.test(line)) lede = line.trim()
    continue
  }
  const next = lines.slice(i + 1).find((l) => l.trim())
  const isLabel = line.length <= 60 && !/[.:;,]$/.test(line) && !/^[-*|>]/.test(line) && /^\s*- \[/.test(next ?? '')
  if (isLabel) {
    group = { name: line.trim(), items: [] }
    section.groups.push(group)
  }
}

// A milestone is a "##" section, or a "###" group named like one ("### M1. Accounts", "### Phase 2 — …").
const MILESTONE = /^(Phase|Milestone|Stage|Sprint|M|P)\s*(\d+)\s*[.—–:-]\s*(.*)$/i
const units = sections
  .filter((s) => (sectionFilter ? sectionFilter.test(s.title) : true))
  .flatMap((s) => {
    const named = s.groups.filter((g) => MILESTONE.test(g.name))
    if (!named.length) return [s]
    const loose = s.groups.filter((g) => !MILESTONE.test(g.name))
    return [...(loose.some((g) => g.items.length) ? [{ ...s, groups: loose }] : []), ...named.map((g) => ({ title: g.name, groups: [{ ...g, name: '' }] }))]
  })
const milestones = units
  .filter((s) => s.groups.some((g) => g.items.length))
  .map((s, index) => {
    const m = MILESTONE.exec(s.title)
    const numbered = /^(\d+)\.\s+(.*)$/.exec(s.title)
    const tag = m ? `${m[1].length <= 1 ? m[1].toUpperCase() : m[1][0].toUpperCase()}${m[2]}` : numbered ? numbered[1] : String(index + 1)
    return { ...s, tag, name: m ? m[3] : numbered ? numbered[2] : s.title, id: `s-${index}` }
  })

// An item's text splits into its lead and its parts at the inline markers.
function splitParts(text) {
  const pieces = text.split(/\[(x|~| )\]\s*/)
  const lead = pieces[0].replace(/\*\*In order:\*\*\s*$/i, '').trim()
  const parts = []
  for (let i = 1; i < pieces.length; i += 2) parts.push({ status: STATUS[pieces[i]], text: pieces[i + 1].trim() })
  return { lead, parts }
}
// The first sentence (or the first 170 characters) is what a reader scans; the rest folds into "Details".
function headline(text) {
  const m = /^(.{20,170}?[.!?])(\s|$)/.exec(text)
  if (m) return { head: m[1], rest: text.slice(m[1].length).trim() }
  if (text.length <= 190) return { head: text, rest: '' }
  const cut = text.lastIndexOf(' ', 170)
  return { head: text.slice(0, cut) + ' …', rest: text.slice(cut).trim() }
}

const count = (items) => {
  const c = { done: 0, partial: 0, todo: 0 }
  for (const i of items) c[i.status]++
  return c
}
const itemsOf = (s) => s.groups.flatMap((g) => g.items)
const all = milestones.flatMap(itemsOf)
const total = count(all)
const pct = (c) => {
  const n = c.done + c.partial + c.todo
  return n ? Math.round(((c.done + c.partial / 2) / n) * 100) : 0
}
const stateOf = (c) => (c.partial + c.todo === 0 ? 'done' : c.done + c.partial ? 'partial' : 'todo')
// The next item is the first one not done, in plan order (the checklist is worked top to bottom).
const nextItem = all.find((i) => i.status !== 'done') ?? null
const nextSection = nextItem ? milestones.find((s) => itemsOf(s).includes(nextItem)) : null
const inProgress = all.filter((i) => i.status === 'partial' && i !== nextItem)

// ---- Render ---------------------------------------------------------------------------------------------------
const bar = (c, cls = 'bar') => {
  const n = c.done + c.partial + c.todo || 1
  const label = `${c.done} done, ${c.partial} in progress, ${c.todo} not started`
  return `<div class="${cls}" role="img" aria-label="${label}"><span class="done" style="width:${(c.done / n) * 100}%"></span><span class="partial" style="width:${(c.partial / n) * 100}%"></span></div>`
}

function renderItem(i) {
  const { lead, parts } = splitParts(i.text)
  const { head, rest } = headline(lead || (parts[0]?.text ?? ''))
  const openPart = parts.find((p) => p.status !== 'done')
  const partList = parts.length
    ? `<ol class="parts">${parts
        .map((p) => {
          const h = headline(p.text)
          const cls = p === openPart && i === nextItem ? `${p.status} now` : p.status
          return `<li class="${cls}"><i class="dot ${p.status}" title="${LABEL[p.status]}"></i><span>${inline(h.head)}</span></li>`
        })
        .join('')}</ol>`
    : ''
  const fullParts = parts.filter((p) => headline(p.text).rest)
  const details =
    rest || fullParts.length
      ? `<details class="more"><summary>Details</summary>${rest ? `<p>${inline(rest)}</p>` : ''}${fullParts
          .map((p) => `<p><i class="dot ${p.status}"></i>${inline(p.text)}</p>`)
          .join('')}</details>`
      : ''
  const doneParts = parts.filter((p) => p.status === 'done').length
  const tally = parts.length ? `<span class="ptally">${doneParts}/${parts.length} parts</span>` : ''
  const cls = `item ${i.status}${i === nextItem ? ' next' : ''}${i.depth ? ' sub' : ''}`
  return `<li class="${cls}"><span class="chip ${i.status}">${i === nextItem ? 'Next' : LABEL[i.status]}</span><div class="body"><p class="head">${inline(head)}${tally}</p>${partList}${details}</div></li>`
}

function renderGroup(g) {
  if (!g.items.length) return ''
  const done = g.items.filter((i) => i.status === 'done')
  const rest = g.items.filter((i) => i.status !== 'done')
  const doneBlock = done.length
    ? rest.length
      ? `<details class="done-items"><summary>${done.length} done</summary><ul class="items">${done.map(renderItem).join('')}</ul></details>`
      : `<ul class="items">${done.map(renderItem).join('')}</ul>`
    : ''
  return `<div class="group">${g.name ? `<h3>${inline(g.name)}</h3>` : ''}${doneBlock}${rest.length ? `<ul class="items">${rest.map(renderItem).join('')}</ul>` : ''}</div>`
}

const sectionHtml = milestones
  .map((s) => {
    const c = count(itemsOf(s))
    const state = stateOf(c)
    const open = state !== 'done' ? ' open' : ''
    return `<details class="milestone ${state}${s === nextSection ? ' current' : ''}" id="${s.id}"${open}>
<summary><span class="tag">${esc(s.tag)}</span><span class="name">${inline(s.name)}</span><span class="tally">${c.done}<small>/${c.done + c.partial + c.todo}</small></span>${bar(c, 'bar slim')}</summary>
<div class="content">${s.groups.map(renderGroup).join('')}</div>
</details>`
  })
  .join('\n')

const nav = milestones
  .map((s) => {
    const c = count(itemsOf(s))
    return `<a href="#${s.id}" class="${stateOf(c)}${s === nextSection ? ' current' : ''}" title="${esc(s.name)}: ${c.done} of ${c.done + c.partial + c.todo} done"><b>${esc(s.tag)}</b>${bar(c, 'bar tiny')}</a>`
  })
  .join('')

const nextHtml = nextItem
  ? (() => {
      const { lead, parts } = splitParts(nextItem.text)
      const openPart = parts.find((p) => p.status !== 'done')
      const what = openPart ? `${headline(lead).head} — ${headline(openPart.text).head}` : headline(lead).head
      return `<a class="next-card" href="#${nextSection.id}"><span class="eyebrow">Next up · ${esc(nextSection.tag)} ${inline(nextSection.name)}</span><span class="what">${inline(what)}</span>${
        inProgress.length ? `<span class="also">Also in progress: ${inProgress.length} item${inProgress.length > 1 ? 's' : ''}</span>` : ''
      }</a>`
    })()
  : `<div class="next-card all-done"><span class="eyebrow">Next up</span><span class="what">Every item is done.</span></div>`

const name = docTitle ?? basename(src)
const updated = statSync(src).mtime.toISOString().slice(0, 16).replace('T', ' ')
const html = `<title>${esc(name)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column. Summary first (progress, next item), then one folding card per milestone. */
:root {
  --bg: #f3f5f7; --surface: #ffffff; --sunken: #eaeef2; --ink: #131a21; --muted: #5a6672; --line: #dce2e8;
  --accent: #0e6d78; --accent-soft: #e0f0f1;
  --done: #1d8a52; --done-soft: #e3f3ea; --partial: #b26b00; --partial-soft: #fbefd9; --todo: #8994a0; --todo-soft: #edf0f3;
  --font-display: "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif;
  --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0e1216; --surface: #151b21; --sunken: #1b232b; --ink: #e6ebf0; --muted: #98a4b0; --line: #26313b;
    --accent: #55c2cc; --accent-soft: #15333a;
    --done: #4cc487; --done-soft: #14301f; --partial: #e6a74a; --partial-soft: #36280f; --todo: #687582; --todo-soft: #1e262e;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0e1216; --surface: #151b21; --sunken: #1b232b; --ink: #e6ebf0; --muted: #98a4b0; --line: #26313b;
  --accent: #55c2cc; --accent-soft: #15333a;
  --done: #4cc487; --done-soft: #14301f; --partial: #e6a74a; --partial-soft: #36280f; --todo: #687582; --todo-soft: #1e262e;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 var(--font-body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
}
main { max-width: 900px; margin: 0 auto; padding-block: 36px 64px; display: grid; gap: 22px; }
.eyebrow { font: 500 11.5px/1.3 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { font: 700 clamp(28px, 5vw, 40px)/1.08 var(--font-display); letter-spacing: -.015em; margin: 6px 0 0; text-wrap: balance; }
.lede { margin: 8px 0 0; color: var(--muted); max-width: 64ch; }
.overview { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px; }
.progress, .next-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: grid; gap: 10px; align-content: start; }
.progress .pct { font: 700 40px/1 var(--font-display); font-variant-numeric: tabular-nums; }
.progress .pct small { font-size: 16px; color: var(--muted); font-weight: 600; margin-left: 4px; }
.counts { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.counts b { color: var(--ink); font-weight: 600; }
.counts i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
.counts .done i { background: var(--done); } .counts .partial i { background: var(--partial); } .counts .todo i { background: var(--todo-soft); box-shadow: inset 0 0 0 1.5px var(--todo); }
.next-card { text-decoration: none; color: inherit; border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); background: linear-gradient(var(--accent-soft), var(--surface) 70%); }
.next-card:hover, .next-card:focus-visible { border-color: var(--accent); outline: none; }
.next-card .eyebrow { color: var(--accent); }
.next-card .what { font: 600 17px/1.35 var(--font-display); text-wrap: pretty; }
.next-card .also { font-size: 13px; color: var(--muted); }
.bar { height: 8px; border-radius: 4px; background: var(--todo-soft); display: flex; overflow: hidden; }
.bar span { display: block; height: 100%; } .bar .done { background: var(--done); } .bar .partial { background: var(--partial); }
.bar.slim { height: 4px; grid-column: 1 / -1; } .bar.tiny { height: 3px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
nav { display: flex; flex-wrap: wrap; gap: 6px; }
nav a { display: grid; gap: 4px; min-width: 44px; padding: 6px 8px 7px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); text-decoration: none; font: 500 12px/1 var(--font-mono); text-align: center; }
nav a.done { color: var(--muted); } nav a.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
nav a:hover, nav a:focus-visible { border-color: var(--accent); outline: none; }
.actions { display: flex; gap: 6px; }
.actions button { font: 500 12.5px/1 var(--font-body); color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px; cursor: pointer; }
.actions button:hover, .actions button:focus-visible { border-color: var(--accent); outline: none; }
.actions button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
.milestones { display: grid; gap: 10px; }
.milestone { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; scroll-margin-top: 16px; }
.milestone.current { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
.milestone > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px 12px; align-items: center; padding: 14px 18px; border-radius: 12px; }
.milestone > summary::-webkit-details-marker { display: none; }
.milestone > summary::after { content: ""; width: 8px; height: 8px; border-right: 1.5px solid var(--muted); border-bottom: 1.5px solid var(--muted); transform: rotate(-45deg); transition: transform .15s; grid-row: 1; grid-column: 4; }
.milestone[open] > summary::after { transform: rotate(45deg); }
.milestone > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tag { font: 500 12px/1 var(--font-mono); color: var(--accent); background: var(--accent-soft); padding: 5px 7px; border-radius: 6px; }
.milestone.done .tag { color: var(--done); background: var(--done-soft); }
.name { font: 600 17px/1.25 var(--font-display); text-wrap: balance; }
.milestone.done .name { color: var(--muted); }
.tally { font: 500 13px/1 var(--font-mono); font-variant-numeric: tabular-nums; }
.tally small { color: var(--muted); font-size: inherit; }
.content { padding: 0 18px 12px; display: grid; gap: 6px; }
h3 { font: 500 11.5px/1 var(--font-mono); letter-spacing: .07em; text-transform: uppercase; color: var(--muted); margin: 12px 0 2px; }
.items { list-style: none; margin: 0; padding: 0; }
.item { display: grid; grid-template-columns: 94px minmax(0, 1fr); gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
.items > .item:first-child { border-top: 0; }
.item.sub { padding-left: 22px; }
.item.done .head { color: var(--muted); }
.item.next { background: linear-gradient(90deg, var(--accent-soft), transparent 60%); margin-inline: -18px; padding-inline: 18px; border-radius: 8px; }
.chip { font: 600 10.5px/1 var(--font-body); letter-spacing: .05em; text-transform: uppercase; padding: 5px 7px; border-radius: 5px; justify-self: start; align-self: start; margin-top: 2px; white-space: nowrap; }
.chip.done { background: var(--done-soft); color: var(--done); } .chip.partial { background: var(--partial-soft); color: var(--partial); } .chip.todo { background: var(--todo-soft); color: var(--muted); }
.item.next .chip { background: var(--accent); color: var(--surface); }
.body { display: grid; gap: 6px; min-width: 0; }
.head { margin: 0; max-width: 70ch; overflow-wrap: anywhere; }
.ptally { font: 500 11.5px/1 var(--font-mono); color: var(--muted); margin-left: 8px; white-space: nowrap; }
.parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.parts li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px; font-size: 14px; color: var(--muted); }
.parts li.partial, .parts li.todo { color: var(--ink); }
.parts li.now span { font-weight: 600; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin: 0 4px 0 2px; vertical-align: baseline; }
.parts .dot { margin: 6px 0 0; }
.dot.done { background: var(--done); } .dot.partial { background: var(--partial); } .dot.todo { box-shadow: inset 0 0 0 1.5px var(--todo); }
details.more > summary, details.done-items > summary { cursor: pointer; font: 500 12.5px/1.4 var(--font-body); color: var(--accent); width: max-content; }
details.more > summary:focus-visible, details.done-items > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
details.more p { margin: 6px 0 0; font-size: 13.5px; color: var(--muted); max-width: 72ch; overflow-wrap: anywhere; }
details.done-items { padding: 8px 0 4px; }
details.done-items > summary { color: var(--done); }
details.done-items[open] > summary { margin-bottom: 4px; }
code { font: .85em var(--font-mono); background: var(--sunken); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
strong { font-weight: 600; }
body.only-open .item.done, body.only-open details.done-items, body.only-open .milestone.done { display: none; }
footer { color: var(--muted); font-size: 13px; }
@media (max-width: 640px) {
  .overview { grid-template-columns: 1fr; }
  .item { grid-template-columns: 1fr; gap: 6px; }
  .item.next { margin-inline: -12px; padding-inline: 12px; }
  .milestone > summary { padding: 12px 14px; } .content { padding: 0 14px 10px; }
}
@media (prefers-reduced-motion: reduce) { .milestone > summary::after { transition: none; } }
</style>
<main>
<header>
<span class="eyebrow">Implementation plan · updated ${updated} UTC</span>
<h1>${esc(name)}</h1>
${lede ? `<p class="lede">${inline(lede)}</p>` : ''}
</header>
<section class="overview" aria-label="Progress">
<div class="progress"><span class="eyebrow">Progress</span><span class="pct">${pct(total)}%<small>${total.done} of ${all.length} items</small></span>${bar(total)}<div class="counts"><span class="done"><i></i><b>${total.done}</b> done</span><span class="partial"><i></i><b>${total.partial}</b> in progress</span><span class="todo"><i></i><b>${total.todo}</b> not started</span></div></div>
${nextHtml}
</section>
<div class="toolbar"><nav aria-label="Milestones">${nav}</nav><div class="actions"><button type="button" id="expand-all">Expand all</button><button type="button" id="collapse-all">Collapse all</button><button type="button" id="only-open" aria-pressed="false">Hide done</button></div></div>
<div class="milestones">
${sectionHtml}
</div>
<footer>Generated from <code>${esc(basename(src))}</code>. Items fold away when done; open a card to see its finished work.</footer>
</main>
<script>
(() => {
  const cards = [...document.querySelectorAll('details.milestone')]
  const key = 'plan-page:' + document.title
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') } catch {}
  for (const d of cards) if (d.id in saved) d.open = saved[d.id]
  const remember = () => { try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(cards.map((d) => [d.id, d.open])))) } catch {} }
  for (const d of cards) d.addEventListener('toggle', remember)
  const setAll = (open) => { for (const d of document.querySelectorAll('details')) d.open = open; remember() }
  document.getElementById('expand-all').onclick = () => setAll(true)
  document.getElementById('collapse-all').onclick = () => setAll(false)
  const only = document.getElementById('only-open')
  only.onclick = () => {
    const on = only.getAttribute('aria-pressed') !== 'true'
    only.setAttribute('aria-pressed', String(on))
    document.body.classList.toggle('only-open', on)
  }
  for (const a of document.querySelectorAll('nav a, a.next-card')) a.addEventListener('click', () => {
    const d = document.querySelector(a.getAttribute('href'))
    if (d) d.open = true
  })
})()
</script>
`
writeFileSync(out, html)
const summary = { out, sections: milestones.length, done: total.done, partial: total.partial, todo: total.todo, percent: pct(total), next: nextItem ? headline(splitParts(nextItem.text).lead).head : null }
console.log(JSON.stringify(summary))
