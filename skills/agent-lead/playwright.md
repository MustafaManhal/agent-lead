# Playwright for the lead and the worker

Playwright drives a real browser with real input. Use it to check your own app (every UI item), to research other
products, and to give the user screenshots instead of descriptions. Electron apps work too (`_electron.launch`).

## Setup (the lead does it, once per project, with the user's OK)

- Node projects: `npm i -D @playwright/test` and `npx playwright install chromium`. Other stacks: the same in a small
  `tools/` folder, or Playwright for Python (`pip install playwright && playwright install chromium`).
- Add a screenshot helper in M0 so later items reuse it (below). Add `@axe-core/playwright` if accessibility matters.
- Workers never install; the brief says which helper to run.

## A screenshot helper every project should have (`tools/shot.mjs`)

```js
// node tools/shot.mjs <url> <out-prefix> [--dark] [--wait <ms>] [--js "<expression>"]
import { chromium, devices } from 'playwright'
const [url, out = 'shot', ...rest] = process.argv.slice(2)
const flag = (f) => rest.includes(f)
const opt = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : undefined)
const browser = await chromium.launch()
for (const [name, ctx] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const context = await browser.newContext({ ...ctx, colorScheme: flag('--dark') ? 'dark' : 'light' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(url, { waitUntil: 'networkidle' })
  if (opt('--js')) console.log(name, await page.evaluate(opt('--js')))
  await page.waitForTimeout(Number(opt('--wait') ?? 300))
  await page.screenshot({ path: `${out}-${name}.png`, fullPage: true })
  console.log(name, `${out}-${name}.png`, errors.length ? `errors: ${errors.join(' | ')}` : 'no errors')
  await context.close()
}
await browser.close()
```

Run it against the dev server; Read the PNGs to look at them.

## Real input, not shortcuts

- Clicks, drags, typing: `page.mouse.click(x, y)`, `page.mouse.move` + `down` + `up`, `page.keyboard.press('Meta+C')`,
  `page.getByRole('button', { name: 'Save' }).click()`. Prefer role and label locators: they also check accessibility.
- Phones: a `devices[...]` context (`isMobile`, `hasTouch`). Touch drags need CDP:
  `const cdp = await context.newCDPSession(page)` then `Input.dispatchTouchEvent` with `touchStart`, several
  `touchMove`, `touchEnd`.
- Native `<select>` menus do not open headless: set the value (`locator.selectOption(value)`).
- Wait for state, not time: `await expect(locator).toBeVisible()`, `page.waitForResponse`, `waitUntil: 'networkidle'`.

## Read the UI as text (cheap)

- `await page.locator('body').ariaSnapshot()` prints the accessibility tree: roles, names, states. Use it to find
  controls and check labels before taking screenshots.
- Measure spacing, sizes, fonts and colors: `page.evaluate(() => { const r = el.getBoundingClientRect(); const s =
  getComputedStyle(el); return { x: r.x, w: r.width, font: s.font, color: s.color } })`.
- Crop screenshots to the part you need (`clip: { x, y, width, height }`) and keep the viewport small.

## What every UI check covers

Phone and desktop width; light and dark if the project has both; keyboard only (Tab order, visible focus, Escape
closes dialogs); empty, loading and error states; long text and big numbers; no console errors; an axe scan with no
serious issues when the project targets accessibility.

## Research on other sites

- `chromium.launch()` with a fresh context, no stored logins. Never type the user's passwords.
- To inspect a browser the user already signed into (only when they ask): start it with a remote debugging port and
  `chromium.connectOverCDP('http://127.0.0.1:<port>')`, read only, and do not change their data.
- Save screenshots to `research/shots/`, note URL and date, and describe what matters in words.

## Electron apps

`const app = await _electron.launch({ args: ['.'] }); const win = await app.firstWindow();` then the same page API.
Point it at the dev server with an env var the app reads.
