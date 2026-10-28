#!/usr/bin/env node
// Observe a reference product (the app you are matching, a competitor, a design tool) in a real browser that stays
// open between calls, so each step costs one short line instead of a screenshot. The browser runs with its own
// profile (never the user's everyday one) and a loopback debugging port, so a sign-in done once by the user is kept.
//
//   node <tools>/observe.mjs start                       open the browser on the reference page (signs in: the user)
//   node <tools>/observe.mjs step...                     run steps in the reference tab (stops at a failing step)
//   node <tools>/observe.mjs --file steps.txt            steps from a file, one per line (# comments)
//   node <tools>/observe.mjs endpoint                    the CDP endpoint and tab id, for other tools (REA, Playwright)
//   options: --url <reference page> --profile <dir> --port <n> --max <chars per result> --keep-going
// Defaults come from "reference" in .agent-lead/config.json: { url, profile, port, browser }.
//
// Steps:
//   js:<expression>  js@file.js      evaluate in the page (await allowed), print compact JSON
//   ui[:text]                        named controls (role "name"), optionally only those containing text
//   aria[:text]                      the accessibility outline, lines containing text
//   measure:<label>[,depth]          box tree around a visible label: sizes, colors, radii, fonts (measure.js)
//   tap:<role>:<name>                click a control by role and accessible name        text:<visible text>
//   hover:<role>:<name>              hover a control and print the tooltip that appears
//   menu:<role>:<name>               open a dropdown, print its items, close it          pick:<item text>
//   fill:<role>:<name>=<value>       type into a field and press Enter
//   click:x,y[,mods]  drag:x1,y1,x2,y2[,mods]  move:x,y  key:Meta+C  type:text  wait:ms
//   shot:file.png[,x,y,w,h]          screenshot        shotui:<role>:<name>:file.png[,pad]   around one control
//
// Safety: steps run only while the tab is still on the reference site (same origin and path prefix). Never type
// passwords or other credentials: when a sign-in is needed, the user does it in the window. Use a scratch
// document or test account in the reference product, never the user's real work, unless the user says so.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { config, load, options, toolsDir } from './lib.mjs'

let args = process.argv.slice(2)
const o = options(args)
const ref = config.reference ?? {}
const URL_ = o.opt('--url') ?? ref.url
const PROFILE = (o.opt('--profile') ?? ref.profile ?? '~/.config/agent-lead/browser-profile').replace(/^~/, homedir())
const PORT = Number(o.opt('--port') ?? ref.port ?? 9333)
const MAX = Number(o.opt('--max') ?? 1500)
const keepGoing = o.flag('--keep-going')
const file = o.opt('--file')
if (file) args = [...args, ...readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))]
if (!URL_) {
  console.error('usage: observe.mjs --url <reference page> step...   (or set "reference.url" in .agent-lead/config.json)')
  process.exit(2)
}
const ENDPOINT = `http://127.0.0.1:${PORT}`
const scope = (() => {
  const u = new URL(URL_)
  return u.origin + u.pathname.replace(/\/[^/]*$/, '/')
})()

const BROWSERS =
  platform() === 'darwin'
    ? [
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : ['/usr/bin/brave-browser', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
const BROWSER = ref.browser ?? BROWSERS.find((p) => existsSync(p))

const cap = (s) => (s.length > MAX ? `${s.slice(0, MAX)}… (+${s.length - MAX} chars)` : s)
const say = (v) => console.log(cap(typeof v === 'string' ? v : JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x))))

async function targets() {
  try {
    return (await (await fetch(`${ENDPOINT}/json/list`)).json()).filter((t) => t.type === 'page')
  } catch {
    return null
  }
}
const inScope = (u) => u.startsWith(scope)
async function ensureBrowser() {
  if (!(await targets())) {
    if (!BROWSER) throw new Error('no Chrome, Chromium or Brave found; set "reference.browser" in the config')
    mkdirSync(PROFILE, { recursive: true })
    spawn(BROWSER, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', URL_], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    for (let i = 0; i < 40 && !(await targets()); i++) await new Promise((r) => setTimeout(r, 500))
  }
  if (!(await targets())?.some((t) => inScope(t.url))) await fetch(`${ENDPOINT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' }).catch(() => {})
}

if (args[0] === 'endpoint') {
  const t = (await targets())?.find((x) => inScope(x.url))
  console.log(t ? `cdp_endpoint ${ENDPOINT}  target_id ${t.id}  (${t.title})` : 'not running: node observe.mjs start')
  process.exit(0)
}

await ensureBrowser()
const { chromium } = await load('playwright')
const browser = await chromium.connectOverCDP(ENDPOINT, { timeout: 20000 }).catch((e) => {
  console.log(`✗ cannot attach to the browser on port ${PORT}: ${String(e.message).split('\n')[0]} (quit it and run again)`)
  process.exit(1)
})
// A tab still loading can be missing from the first view: retry for a while.
let page = null
for (let i = 0; i < 40 && !page; i++) {
  page = browser.contexts().flatMap((c) => c.pages()).find((p) => inScope(p.url())) ?? null
  if (!page) await new Promise((r) => setTimeout(r, 500))
}
if (!page) {
  console.log(`✗ no tab on ${scope} (open ${URL_} in the observer window)`)
  process.exit(1)
}
if (args[0] === 'start') {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  console.log(`ready: ${await page.title()}  ·  ${ENDPOINT}  ·  profile ${PROFILE}`)
  console.log('If the page asks for a sign-in, the user signs in once in that window; the session is kept.')
  process.exit(0)
}

const MEASURE = readFileSync(join(toolsDir, 'measure.js'), 'utf8')
const MEASURE_VERSION = createHash('sha1').update(MEASURE).digest('hex').slice(0, 12)
const helpers = async () => {
  if ((await page.evaluate(() => window.__measureVersion)) !== MEASURE_VERSION)
    await page.evaluate(`(() => {\n${MEASURE}\nwindow.__measureVersion = ${JSON.stringify(MEASURE_VERSION)}\n})()`)
}
const nums = (s) => s.split(',').slice(0, 4).map(Number)
const mods = (s) => (s ? s.split('+') : [])
const withMods = async (list, fn) => {
  for (const m of list) await page.keyboard.down(m)
  await fn()
  for (const m of [...list].reverse()) await page.keyboard.up(m)
}
const byRole = (spec) => {
  const j = spec.indexOf(':')
  return page.getByRole(spec.slice(0, j), { name: spec.slice(j + 1), exact: true }).first()
}
/** Click like a person: normally, and if an overlay intercepts the pointer, at the element's center. */
const clickCenter = async (loc) => {
  try {
    await loc.click({ timeout: 2500 })
  } catch {
    const box = await loc.boundingBox({ timeout: 4000 })
    if (!box) throw new Error('not visible')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
}
const MENU = '[role=option],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]'
const menuItems = () =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width).map((e) => e.textContent.trim()).filter(Boolean), MENU)
const shotBox = async (path, box, pad) => {
  const vp = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  const clip = { x, y, width: Math.min(vp.width - x, box.width + 2 * pad), height: Math.min(vp.height - y, box.height + 2 * pad) }
  await page.screenshot({ path, clip })
  say(`shot ${path} ${Math.round(clip.width)}x${Math.round(clip.height)}`)
}

const steps = {
  async js(rest) {
    say(await page.evaluate(`(async () => (${rest}))()`))
  },
  async ui(rest) {
    const snap = await page.locator('body').ariaSnapshot()
    const lines = snap
      .split('\n')
      .map((l) => l.trim().replace(/^- /, '').replace(/:$/, ''))
      .filter((l) => /^(button|radio|tab|checkbox|textbox|spinbutton|combobox|slider|menuitem|option|switch|link) "/.test(l))
    say([...new Set(lines)].filter((l) => !rest || l.toLowerCase().includes(rest.toLowerCase())).join('\n') || '(none)')
  },
  async aria(rest) {
    const snap = await page.locator('body').ariaSnapshot()
    say(snap.split('\n').filter((l) => !/^\s*- (generic|none)\s*$/.test(l) && (!rest || l.toLowerCase().includes(rest.toLowerCase()))).join('\n'))
  },
  async measure(rest) {
    await helpers()
    const [label, depth] = rest.split(',')
    say(await page.evaluate(([l, d]) => window.measureUI(l, { depth: Number(d || 5) }), [label, depth]))
  },
  async tap(rest) {
    await clickCenter(byRole(rest))
  },
  async text(rest) {
    await clickCenter(page.getByText(rest, { exact: true }).first())
  },
  async hover(rest) {
    await page.evaluate(() => (window.__shown = new Set([...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().width))))
    await byRole(rest).hover({ timeout: 8000, force: true })
    await page.waitForTimeout(1000)
    say(
      await page.evaluate(() => {
        const fresh = [...document.querySelectorAll('body *')].filter((e) => !window.__shown.has(e) && e.getBoundingClientRect().width && e.textContent.trim())
        const tops = fresh.filter((e) => !fresh.includes(e.parentElement))
        return [...new Set(tops.map((e) => e.textContent.trim().replace(/\s+/g, ' ')))].join(' | ') || '(no tooltip)'
      }),
    )
  },
  async menu(rest) {
    await byRole(rest).click({ timeout: 8000 })
    await page.waitForTimeout(400)
    say((await menuItems()).join(' | ') || '(no items)')
    await page.keyboard.press('Escape')
  },
  async pick(rest) {
    await page.locator(MENU).filter({ hasText: rest }).first().click({ timeout: 8000 })
  },
  async fill(rest) {
    const eq = rest.lastIndexOf('=')
    const el = byRole(rest.slice(0, eq))
    await el.click({ timeout: 8000 })
    await el.fill(rest.slice(eq + 1))
    await page.keyboard.press('Enter')
  },
  async click(rest) {
    const [x, y] = nums(rest)
    await withMods(mods(rest.split(',')[2]), () => page.mouse.click(x, y))
  },
  async move(rest) {
    const [x, y] = nums(rest)
    await page.mouse.move(x, y)
  },
  async drag(rest) {
    const [x1, y1, x2, y2] = nums(rest)
    await withMods(mods(rest.split(',')[4]), async () => {
      await page.mouse.move(x1, y1)
      await page.mouse.down()
      await page.mouse.move(x2, y2, { steps: 12 })
      await page.mouse.up()
    })
  },
  async key(rest) {
    await page.keyboard.press(rest)
  },
  async type(rest) {
    await page.keyboard.type(rest)
  },
  async wait(rest) {
    await page.waitForTimeout(Number(rest))
  },
  async shot(rest) {
    const [path, ...box] = rest.split(',')
    const [x, y, w, h] = box.map(Number)
    await page.screenshot({ path, ...(box.length === 4 ? { clip: { x, y, width: w, height: h } } : {}) })
    say(`shot ${path}`)
  },
  async shotui(rest) {
    const k = rest.lastIndexOf(':')
    const [path, pad] = rest.slice(k + 1).split(',')
    const box = await byRole(rest.slice(0, k)).boundingBox()
    if (!box) throw new Error('control not visible')
    await shotBox(path, box, Number(pad ?? 120))
  },
}

for (const step of args) {
  const i = step.search(/[:@]/)
  const kind = i < 0 ? step : step.slice(0, i)
  const rest = step.startsWith('js@') ? readFileSync(step.slice(3), 'utf8') : i < 0 ? '' : step.slice(i + 1)
  const fn = steps[kind]
  if (!fn) {
    console.log(`✗ unknown step: ${step}`)
    if (!keepGoing) break
    continue
  }
  if (!inScope(page.url())) {
    console.log(`✗ the tab left ${scope}; stopping`)
    break
  }
  try {
    await fn(rest)
  } catch (e) {
    console.log(`✗ ${step.slice(0, 80)}: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`)
    if (!keepGoing) break
  }
}
// Leave the browser running for the next call: exiting drops only this connection.
process.exit(0)
