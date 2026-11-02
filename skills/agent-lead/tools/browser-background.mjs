// Browser automation must not activate the user's desktop window. Keep rendering and DOM focus through CDP.
import { spawn, execFileSync } from 'node:child_process'
import { platform, homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Browser clients and binaries must match; keep this runtime separate from an application's dependencies. */
export function loadPlaywright() {
  const roots = [process.env.AGENT_LEAD_PLAYWRIGHT_ROOT, join(homedir(), '.config/agent-lead/browser-runtime'), process.cwd()].filter(Boolean)
  for (const root of roots) {
    try { return createRequire(join(root, 'package.json'))('playwright') } catch {}
  }
  throw new Error('Playwright is missing; install it in the project or the agent-lead browser runtime')
}

/** A UI-less executable avoids macOS application/menu activation as well as window activation. */
export function automationBrowser(fallback) {
  if (platform() !== 'darwin') return fallback
  const file = join(homedir(), '.config/agent-lead/browser.json')
  try {
    const executable = JSON.parse(readFileSync(file, 'utf8')).executable
    if (existsSync(executable) && /headless[-_]shell/.test(executable)) return executable
  } catch {}
  const path = loadPlaywright().chromium.executablePath()
  const match = path.match(/^(.*)\/chromium-(\d+)\//)
  if (match) {
    const base = join(match[1], `chromium_headless_shell-${match[2]}`)
    for (const relative of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-mac/headless_shell']) {
      const executable = join(base, relative)
      if (existsSync(executable)) return executable
    }
  }
  throw new Error('Install the UI-less browser with: npx playwright install chromium --only-shell')
}

export const backgroundArgs = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']

/** Create a tab/window without activating it. Also works before Playwright attaches during observer recovery. */
export async function createBackgroundTarget(endpoint, url, options = {}) {
  const { webSocketDebuggerUrl } = await fetch(`${endpoint}/json/version`).then(r => r.json())
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl)
    const finish = (error, result) => { clearTimeout(timer); ws.close(); error ? reject(error) : resolve(result) }
    const timer = setTimeout(() => finish(new Error('background tab creation timed out')), 15000)
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { ...options, url, background: true, focus: false } }))
    ws.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.id === 1) finish(message.error ? new Error(message.error.message) : null, message.result)
    }
    ws.onerror = () => finish(new Error('cannot connect to browser for background tab creation'))
  })
}

const sessions = new WeakMap()
/** Emulate page focus, not macOS focus: keyboard, clipboard, animation and screenshots still work. */
export async function keepPageActive(page) {
  let session = sessions.get(page)
  if (!session) {
    session = await page.context().newCDPSession(page)
    sessions.set(page, session)
    page.on('close', () => { sessions.delete(page); session.detach().catch(() => {}) })
  }
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await session.send('Page.setWebLifecycleState', { state: 'active' })
}

const virtualClipboards = new WeakMap()
/** Preserve macOS copy/cut/paste when the browser has an internal, windowless clipboard. */
export async function pressKey(page, key, options) {
  if (platform() !== 'darwin' || !/^(Meta|ControlOrMeta)\+[cxv]$/i.test(key)) return page.keyboard.press(key, options)
  const browser = page.context().browser()
  if (!virtualClipboards.has(browser)) {
    const session = await browser.newBrowserCDPSession()
    try { virtualClipboards.set(browser, (await session.send('Browser.getVersion')).product.startsWith('HeadlessChrome/')) }
    finally { await session.detach() }
  }
  if (!virtualClipboards.get(browser)) return page.keyboard.press(key, options)
  const origin = new URL(page.url()).origin
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  const helper = fileURLToPath(new URL('./browser-clipboard.swift', import.meta.url))
  const items = JSON.parse(execFileSync('/usr/bin/swift', [helper, 'read'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))
  await page.evaluate(async items => {
    const data = Object.fromEntries(items.map(({ type, data }) => [type, new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type })]))
    if (items.length) await navigator.clipboard.write([new ClipboardItem(data)])
    else await navigator.clipboard.writeText('')
  }, items)
  await page.keyboard.press(key, options)
  if (!/\+v$/i.test(key)) {
    await page.waitForTimeout(400)
    const copied = await page.evaluate(async () => {
      const items = await navigator.clipboard.read({ unsanitized: ['text/html'] })
      const result = []
      for (const item of items) for (const type of item.types) {
        if (!['text/plain', 'text/html', 'image/png'].includes(type)) continue
        const bytes = new Uint8Array(await (await item.getType(type)).arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
        result.push({ type, data: btoa(binary) })
      }
      return result
    })
    execFileSync('/usr/bin/swift', [helper, 'write'], { input: JSON.stringify(copied), maxBuffer: 256 * 1024 * 1024 })
  }
}

/** Use the caller's authenticated context, matching the exact target rather than another simultaneous tab. */
export async function newBackgroundPage(context, { url = 'about:blank', newWindow = false } = {}) {
  const browser = context.browser()
  if (!browser) throw new Error('background tabs require a connected Chromium browser')
  const session = await browser.newBrowserCDPSession()
  let targetId
  try {
    const anchor = context.pages().find(p => !p.isClosed())
    let browserContextId
    if (anchor) {
      const pageSession = await context.newCDPSession(anchor)
      try { browserContextId = (await pageSession.send('Target.getTargetInfo')).targetInfo.browserContextId }
      finally { await pageSession.detach() }
    } else if ((await session.send('Target.getBrowserContexts')).browserContextIds.length) {
      throw new Error('background tab creation needs an existing page in this isolated context')
    }
    ;({ targetId } = await session.send('Target.createTarget', { url: 'about:blank', background: true, focus: false, newWindow, ...(browserContextId ? { browserContextId } : {}) }))
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      for (const page of context.pages()) {
        const probe = await context.newCDPSession(page).catch(() => null)
        if (!probe) continue
        let info
        try { info = await probe.send('Target.getTargetInfo') }
        finally { await probe.detach().catch(() => {}) }
        if (info.targetInfo.targetId !== targetId) continue
        await keepPageActive(page)
        if (url !== 'about:blank') await page.goto(url, { waitUntil: 'domcontentloaded' })
        return page
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('created background tab did not attach')
  } catch (error) {
    if (targetId) await session.send('Target.closeTarget', { targetId }).catch(() => {})
    throw error
  } finally { await session.detach() }
}

/** Start/reuse a pipe-backed browser. Never attach tools to Chromium's native WebSocket endpoint on macOS. */
export async function ensurePipeBrowser({ executable, profile, port = 9343 }) {
  executable = automationBrowser(executable)
  let endpoint = `http://127.0.0.1:${port}`
  let version = await fetch(endpoint + '/json/version').then(r => r.json()).catch(() => null)
  if (version && version.agentLeadTransport !== 'pipe') {
    port += 10
    endpoint = `http://127.0.0.1:${port}`
    version = await fetch(endpoint + '/json/version').then(r => r.json()).catch(() => null)
  }
  if (version?.agentLeadTransport === 'pipe') {
    if (platform() === 'darwin' && (!version.headless || !version.Browser.startsWith('HeadlessChrome/'))) throw new Error('This endpoint uses a macOS browser application. Use a separate port for the windowless browser.')
    return endpoint
  }
  if (version) throw new Error(`Port ${port} is occupied by a non-pipe browser; choose another port`)
  const { fileURLToPath } = await import('node:url')
  const daemon = fileURLToPath(new URL('./browser-pipe.mjs', import.meta.url))
  const child = spawn(process.execPath, [daemon, '--browser', executable, '--profile', profile, '--port', String(port)], { cwd: process.cwd(), detached: true, stdio: 'ignore' })
  child.unref()
  for (let i = 0; i < 150; i++) {
    version = await fetch(endpoint + '/json/version').then(r => r.json()).catch(() => null)
    if (version?.agentLeadTransport === 'pipe') return endpoint
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Pipe browser did not start on ${port}; its profile may already be in use`)
}

export async function requirePipeEndpoint(endpoint) {
  const version = await fetch(endpoint + '/json/version').then(r => r.json())
  if (platform() === 'darwin' && !(version.agentLeadTransport === 'pipe' && version.headless && version.Browser.startsWith('HeadlessChrome/'))) {
    const next = new URL(endpoint); next.port = String(Number(next.port) + 10)
    const alternative = await fetch(next.origin + '/json/version').then(r => r.json()).catch(() => null)
    if (alternative?.agentLeadTransport === 'pipe' && alternative.headless && alternative.Browser.startsWith('HeadlessChrome/')) return next.origin
    throw new Error('Browser applications can steal macOS focus. Start observe.mjs and use its windowless pipe endpoint.')
  }
  return endpoint
}

/** Keep legacy headed test commands functional without launching a macOS application. */
export async function launchBackgroundSession(chromium, { executablePath = chromium.executablePath(), profile, contextOptions = {} } = {}) {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { startPipeBrowser } = await import('./browser-pipe.mjs')
  const ownedProfile = !profile
  profile ??= await mkdtemp(join(tmpdir(), 'agent-lead-browser-'))
  const driver = await startPipeBrowser({ executable: automationBrowser(executablePath), profile, port: 0, headless: platform() === 'darwin' })
  let browser
  const close = async () => {
    await browser?.close().catch(() => {})
    await driver.close()
    if (ownedProfile) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  try {
    await createBackgroundTarget(driver.endpoint, 'about:blank')
    browser = await chromium.connectOverCDP(driver.endpoint)
    const context = browser.contexts()[0], page = context.pages()[0]
    if (contextOptions.viewport) await page.setViewportSize(contextOptions.viewport)
    if (contextOptions.colorScheme) await page.emulateMedia({ colorScheme: contextOptions.colorScheme })
    await keepPageActive(page)
    return { browser, context, page, close }
  } catch (error) { await close(); throw error }
}
