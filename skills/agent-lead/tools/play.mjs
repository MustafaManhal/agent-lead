#!/usr/bin/env node
// Drive the app with real pointer and keyboard input through Playwright and print only what the steps return, so
// an agent can test clicks, drags and shortcuts without a browser extension. A fresh browser each run.
//   node <tools>/play.mjs [--url <url>] [--ready "<js expression>"] [--size WxH] [--headed] [--dark] step...
//   node <tools>/play.mjs --file steps.txt          steps from a file, one per line (# comments)
// --url defaults to "devUrl" in .agent-lead/config.json. --ready waits until the expression is true (for example
// "window.app?.ready") before the steps run.
// Steps, in order:
//   js:<expression>        evaluate in the page (await allowed), print the result
//   click:x,y[,mods]       mods like Shift+Alt          drag:x1,y1,x2,y2[,mods]          move:x,y
//   key:<keys>             e.g. key:Meta+K, key:Escape    type:<text>     wait:<ms>
//   tap:<role>:<name>      click a control by role and accessible name     text:<visible text>   click by text
//   ui[:text]              named controls as text (cheaper than a screenshot), optionally filtered
//   shot:<file.png>[,x,y,w,h]
// Page errors are printed at the end. Playwright must be installed in the project (npm i -D playwright).
import { readFileSync } from 'node:fs'
import { config, load, options } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const url = o.opt('--url') ?? config.devUrl
const ready = o.opt('--ready')
const [w, h] = (o.opt('--size') ?? '1440x900').split('x').map(Number)
const headed = o.flag('--headed')
const dark = o.flag('--dark')
const file = o.opt('--file')
const steps = [...args, ...(file ? readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [])]
if (!url) {
  console.error('usage: play.mjs --url <url> step...   (or set "devUrl" in .agent-lead/config.json)')
  process.exit(2)
}

const { chromium } = await load('playwright')
const browser = await chromium.launch({ headless: !headed })
const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
} catch (e) {
  console.log(`✗ cannot open ${url}: ${String(e.message).split('\n')[0]} (is the dev server running?)`)
  process.exit(1)
}
if (ready) await page.waitForFunction(ready, null, { timeout: 30000 }).catch(() => console.log(`✗ not ready: ${ready}`))

const nums = (s) => s.split(',').slice(0, 4).map(Number)
const mods = (s) => (s ? s.split('+') : [])
async function withMods(list, fn) {
  for (const m of list) await page.keyboard.down(m)
  await fn()
  for (const m of [...list].reverse()) await page.keyboard.up(m)
}
const byRole = (spec) => {
  const j = spec.indexOf(':')
  return page.getByRole(spec.slice(0, j), { name: spec.slice(j + 1), exact: true }).first()
}

for (const step of steps) {
  const i = step.indexOf(':')
  const kind = i < 0 ? step : step.slice(0, i)
  const rest = i < 0 ? '' : step.slice(i + 1)
  try {
    if (kind === 'js') {
      const out = await page.evaluate(`(async () => (${rest}))()`)
      console.log(typeof out === 'string' ? out : JSON.stringify(out))
    } else if (kind === 'click') {
      const [x, y] = nums(rest)
      await withMods(mods(rest.split(',')[2]), () => page.mouse.click(x, y))
    } else if (kind === 'move') {
      const [x, y] = nums(rest)
      await page.mouse.move(x, y)
    } else if (kind === 'drag') {
      const [x1, y1, x2, y2] = nums(rest)
      await withMods(mods(rest.split(',')[4]), async () => {
        await page.mouse.move(x1, y1)
        await page.mouse.down()
        await page.mouse.move(x2, y2, { steps: 12 })
        await page.mouse.up()
      })
    } else if (kind === 'key') await page.keyboard.press(rest)
    else if (kind === 'type') await page.keyboard.type(rest)
    else if (kind === 'wait') await page.waitForTimeout(Number(rest))
    else if (kind === 'tap') await byRole(rest).click({ timeout: 8000 })
    else if (kind === 'text') await page.getByText(rest, { exact: true }).first().click({ timeout: 8000 })
    else if (kind === 'ui') {
      const snap = await page.locator('body').ariaSnapshot()
      const named = snap
        .split('\n')
        .map((l) => l.trim().replace(/^- /, '').replace(/:$/, ''))
        .filter((l) => /^(button|radio|tab|checkbox|textbox|spinbutton|combobox|slider|menuitem|option|switch|link) "/.test(l))
      console.log([...new Set(named)].filter((l) => !rest || l.toLowerCase().includes(rest.toLowerCase())).join('\n') || '(none)')
    } else if (kind === 'shot') {
      const [path, ...box] = rest.split(',')
      const [x, y, cw, ch] = box.map(Number)
      await page.screenshot({ path, ...(box.length === 4 ? { clip: { x, y, width: cw, height: ch } } : {}) })
      console.log(`shot ${path}`)
    } else console.log(`✗ unknown step: ${step}`)
  } catch (e) {
    console.log(`✗ ${step.slice(0, 80)}: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`)
  }
}
if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`)
await browser.close()
