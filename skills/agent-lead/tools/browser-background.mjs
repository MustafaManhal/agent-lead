// Browser automation must not activate the user's desktop window. Keep rendering and DOM focus through CDP.
import { spawn } from 'node:child_process'
import { platform } from 'node:os'

export const backgroundArgs = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']

/** Launch a visible browser behind the user's app, including its first launch on macOS. */
export function launchBackgroundBrowser(executable, args) {
  const app = executable.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/)?.[1]
  const command = platform() === 'darwin' && app ? '/usr/bin/open' : executable
  const argv = command === '/usr/bin/open' ? ['-g', '-n', '-a', app, '--args', ...backgroundArgs, ...args] : [...backgroundArgs, ...args]
  const child = spawn(command, argv, { detached: true, stdio: 'ignore' })
  child.unref()
  return child
}

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

/** A headed test browser with the same background launch policy as the persistent observer. */
export async function launchBackgroundSession(chromium, { executablePath = chromium.executablePath(), profile, contextOptions = {} } = {}) {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const ownedProfile = !profile
  profile ??= await mkdtemp(join(tmpdir(), 'agent-lead-browser-'))
  const started = Date.now()
  const child = launchBackgroundBrowser(executablePath, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--no-startup-window'])
  let browser
  const close = async () => {
    if (browser) {
      const session = await browser.newBrowserCDPSession().catch(() => null)
      await session?.send('Browser.close').catch(() => {})
      await browser.close().catch(() => {})
    }
    if (ownedProfile) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  try {
    let endpoint
    for (let i = 0; i < 150 && !endpoint; i++) {
      const portFile = join(profile, 'DevToolsActivePort')
      const { stat } = await import('node:fs/promises')
      const recent = await stat(portFile).then(s => s.mtimeMs >= started - 1000, () => false)
      if (recent) {
        const port = await readFile(portFile, 'utf8').then(s => Number(s.split('\n')[0]), () => 0)
        if (port) endpoint = `http://127.0.0.1:${port}`
      }
      if (!endpoint) await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!endpoint) throw new Error('background browser did not publish its debugging port (is this profile already in use?)')
    await createBackgroundTarget(endpoint, 'about:blank')
    browser = await chromium.connectOverCDP(endpoint)
    const context = browser.contexts()[0]
    const page = context.pages()[0]
    if (contextOptions.viewport) await page.setViewportSize(contextOptions.viewport)
    if (contextOptions.colorScheme) await page.emulateMedia({ colorScheme: contextOptions.colorScheme })
    await keepPageActive(page)
    return { browser, context, page, close }
  } catch (error) {
    // The macOS launcher is short-lived; never signal an unrelated browser sharing this application bundle.
    if (platform() !== 'darwin') child.kill('SIGTERM')
    await close()
    throw error
  }
}
