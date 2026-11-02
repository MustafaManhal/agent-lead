import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pressKey, automationBrowser } from '../skills/agent-lead/tools/browser-background.mjs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'
import { startPipeBrowser } from '../skills/agent-lead/tools/browser-pipe.mjs'

const require = createRequire(join(process.env.AGENT_LEAD_PLAYWRIGHT_ROOT || process.cwd(), 'package.json'))
const { chromium } = require('playwright')

test('pipe endpoint preserves multi-client sessions, real input, popups, images, HTTP and page CDP', { timeout: 45000 }, async t => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<input aria-label="Value"><button onclick="window.open('/player','player','width=900,height=700')">Present</button><script>window.framesSeen=0;function tick(){framesSeen++;requestAnimationFrame(tick)}tick()</script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const profile = await mkdtemp(join(tmpdir(), 'pipe-browser-test-'))
  let driver, a, b
  try {
    await writeFile(join(profile, '.agent-lead-protocol.json'), JSON.stringify({ version: { major: '1', minor: '3' }, domains: [] }))
    await writeFile(join(profile, '.agent-lead-ua-override.json'), JSON.stringify({ userAgent: 'Agent Lead background test' }))
    driver = await startPipeBrowser({ executable: process.env.AGENT_LEAD_BROWSER_EXECUTABLE || chromium.executablePath(), profile, port: 0, headless: true })
    const version = await fetch(driver.endpoint + '/json/version/').then(r => r.json())
    assert.equal(version.agentLeadTransport, 'pipe')
    assert.deepEqual(await fetch(driver.endpoint + '/json/protocol').then(r => r.json()), { version: { major: '1', minor: '3' }, domains: [] })
    assert.equal((await fetch(driver.endpoint + '/json/list', { headers: { origin: 'https://example.test' } })).status, 403)
    t.diagnostic('connect first client'); a = await chromium.connectOverCDP(driver.endpoint)
    const first = await a.contexts()[0].newPage()
    await first.goto(url)
    await first.getByRole('textbox').click(); await first.keyboard.type('background input')
    assert.equal(await first.getByRole('textbox').inputValue(), 'background input')
    await first.setViewportSize({ width: 1000, height: 700 })
    assert.equal((await first.screenshot()).readUInt32BE(16), 1000)
    await first.waitForFunction(() => framesSeen > 3); t.diagnostic('first page initialized')
    await first.evaluate(() => {
      const url = URL.createObjectURL(new Blob(['onmessage = event => postMessage(event.data + 1)'], { type: 'text/javascript' }))
      const worker = new Worker(url)
      worker.onmessage = event => { window.workerResult = event.data; worker.terminate(); URL.revokeObjectURL(url) }
      worker.postMessage(41)
    })
    await first.waitForFunction(() => window.workerResult === 42, null, { polling: 100, timeout: 5000 })
    await first.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame) }, url.replace('127.0.0.1', 'localhost'))
    await first.frameLocator('iframe').getByRole('textbox').fill('cross-site frame works')
    assert.equal(await first.frameLocator('iframe').getByRole('textbox').inputValue(), 'cross-site frame works')
    t.diagnostic('worker and cross-site iframe initialized'); b = await chromium.connectOverCDP(driver.endpoint); t.diagnostic('second client connected')
    const second = await b.contexts()[0].newPage(); await second.goto(url)
    const sa = await first.context().newCDPSession(first), sb = await second.context().newCDPSession(second)
    const [ra, rb] = await Promise.all([
      sa.send('Runtime.evaluate', { expression: '"A".repeat(100000)', returnByValue: true }),
      sb.send('Runtime.evaluate', { expression: '"B".repeat(100000)', returnByValue: true }),
    ])
    assert.equal(ra.result.value, 'A'.repeat(100000)); assert.equal(rb.result.value, 'B'.repeat(100000))
    await sa.detach()
    assert.equal((await sb.send('Runtime.evaluate', { expression: '7', returnByValue: true })).result.value, 7)
    await sb.detach()
    t.diagnostic('session isolation verified'); const popupReady = first.context().waitForEvent('page', { timeout: 10000 })
    await first.getByRole('button', { name: 'Present' }).click()
    const popup = await popupReady; await popup.waitForLoadState()
    assert.equal(await popup.evaluate(() => navigator.userAgent), 'Agent Lead background test', 'native popups inherit browser identity')
    assert.equal(await popup.evaluate(() => !!window.opener), true, 'native opener semantics remain available')
    await popup.close()
    const tabs = await fetch(driver.endpoint + '/json/list').then(r => r.json())
    const ws = new WebSocket(tabs.find(t => t.url === url + '/').webSocketDebuggerUrl)
    await new Promise(resolve => ws.onopen = resolve)
    const rawReply = new Promise((resolve, reject) => {
      ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id === 33) message.error ? reject(message.error) : resolve(message.result) }
    })
    ws.send(JSON.stringify({ id: 33, method: 'Runtime.evaluate', params: { expression: '40+2', returnByValue: true } }))
    assert.equal((await rawReply).result.value, 42); ws.close()
    t.diagnostic('popup and raw CDP verified'); await b.close(); b = null
    assert.equal(await first.getByRole('textbox').inputValue(), 'background input', 'another client disconnect does not detach this one')
    await first.reload(); await first.waitForFunction(() => framesSeen > 3); t.diagnostic('first page initialized')
    t.diagnostic('reload verified'); await a.close(); a = null
    assert.equal((await fetch(driver.endpoint + '/json/list').then(r => r.json())).length, 2, 'persistent tabs survive client disconnect')
  } finally {
    t.diagnostic('cleanup'); await a?.close().catch(() => {}); await b?.close().catch(() => {}); await driver?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})


test('windowless macOS copy and paste retain the system clipboard', { skip: platform() !== 'darwin', timeout: 30000 }, async () => {
  const helper = fileURLToPath(new URL('../skills/agent-lead/tools/browser-clipboard.swift', import.meta.url))
  const native = (mode, items) => execFileSync('/usr/bin/swift', [helper, mode], { encoding: 'utf8', ...(items ? { input: JSON.stringify(items) } : {}) })
  const saved = JSON.parse(native('read'))
  const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<input aria-label="Clipboard">') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const profile = await mkdtemp(join(tmpdir(), 'clipboard-browser-test-'))
  let driver, browser
  try {
    native('write', [{ type: 'text/plain', data: Buffer.from('clipboard round trip ✓').toString('base64') }])
    driver = await startPipeBrowser({ executable: automationBrowser(chromium.executablePath()), profile, port: 0 })
    browser = await chromium.connectOverCDP(driver.endpoint)
    const page = await browser.contexts()[0].newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('textbox').click()
    await pressKey(page, 'Meta+V')
    assert.equal(await page.getByRole('textbox').inputValue(), 'clipboard round trip ✓')
    await page.keyboard.press('Meta+A')
    await pressKey(page, 'Meta+C')
    const copied = JSON.parse(native('read')).find(item => item.type === 'text/plain')
    assert.equal(Buffer.from(copied.data, 'base64').toString(), 'clipboard round trip ✓')
  } finally {
    native('write', saved)
    await browser?.close().catch(() => {}); await driver?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
