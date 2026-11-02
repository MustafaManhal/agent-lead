import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { keepPageActive, newBackgroundPage, automationBrowser } from '../skills/agent-lead/tools/browser-background.mjs'

const require = createRequire(join(process.env.AGENT_LEAD_PLAYWRIGHT_ROOT || process.cwd(), 'package.json'))
const { chromium } = require('playwright')

test('background pages retain context, keyboard, pointer, animation, screenshots and navigation', async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Background fixture</title><input aria-label="Value"><button onclick="document.querySelector('output').textContent='clicked'">Run</button><output></output><script>window.framesSeen=0;function tick(){framesSeen++;requestAnimationFrame(tick)}tick()</script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ executablePath: automationBrowser(chromium.executablePath()) })
  const dir = await mkdtemp(join(tmpdir(), 'background-browser-'))
  try {
    const context = await browser.newContext()
    const anchor = await context.newPage()
    await context.addCookies([{ name: 'fixture', value: 'kept', url }])
    const first = await newBackgroundPage(context, { url })
    const second = await newBackgroundPage(context, { url })
    assert.notEqual(first, second)
    assert.equal(first.context(), context)
    assert.equal(await first.evaluate(() => document.cookie), 'fixture=kept')
    await first.getByRole('textbox').click()
    await first.keyboard.type('typed in background')
    assert.equal(await first.getByRole('textbox').inputValue(), 'typed in background')
    await first.getByRole('button', { name: 'Run' }).click()
    assert.equal(await first.locator('output').textContent(), 'clicked')
    await first.waitForFunction(() => framesSeen > 3)
    assert.equal(await first.evaluate(() => document.hasFocus()), true)
    const png = join(dir, 'screen.png')
    await first.screenshot({ path: png })
    assert.ok((await readFile(png)).length > 100)
    await first.goto(url + '/another-route')
    await keepPageActive(first)
    assert.equal(await first.evaluate(() => document.hasFocus()), true)
    await first.waitForFunction(() => framesSeen > 3)
    assert.equal(context.pages().length, 3)
    await first.close(); await second.close()
    assert.deepEqual(context.pages(), [anchor])
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('failed background navigation closes only its owned tab', async () => {
  const browser = await chromium.launch({ executablePath: automationBrowser(chromium.executablePath()) })
  try {
    const context = await browser.newContext()
    const anchor = await context.newPage()
    await context.route('**/fail', route => route.abort())
    await assert.rejects(newBackgroundPage(context, { url: 'https://example.test/fail' }))
    assert.deepEqual(context.pages(), [anchor])
  } finally { await browser.close() }
})
