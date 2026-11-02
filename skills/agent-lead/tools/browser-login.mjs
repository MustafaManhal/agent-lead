// Explicit manual sign-in is the only workflow that opens a macOS browser application.
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { platform } from 'node:os'
import { loadPlaywright } from './browser-background.mjs'

export async function openBrowserLogin({ executable, profile, url, port }) {
  if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) throw new Error(`Login port ${port} is already in use; finish or close the existing login window`)
  profile += '-login'
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const args = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', url]
  const app = executable.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/)?.[1]
  const child = platform() === 'darwin' && app
    ? spawn('/usr/bin/open', ['-n', '-a', app, '--args', ...args], { detached: true, stdio: 'ignore' })
    : spawn(executable, args, { detached: true, stdio: 'ignore' })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}

export async function finishBrowserLogin({ endpoint, url, port }) {
  const { chromium } = loadPlaywright()
  let source, destination
  try {
    source = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const state = await source.contexts()[0].storageState()
    const host = new URL(url).hostname
    const matches = domain => domain.replace(/^\./, '') === host || host.endsWith('.' + domain.replace(/^\./, ''))
    const cookies = state.cookies.filter(cookie => matches(cookie.domain))
    if (!cookies.length) throw new Error('No session cookies for the reference site were found; finish signing in first')
    destination = await chromium.connectOverCDP(endpoint)
    const context = destination.contexts()[0]
    await context.addCookies(cookies)
    const origin = state.origins.find(entry => entry.origin === new URL(url).origin)
    for (const page of context.pages()) if (new URL(page.url()).origin === new URL(url).origin) {
      if (origin) await page.evaluate(entries => { for (const { name, value } of entries) localStorage.setItem(name, value) }, origin.localStorage)
      await page.reload({ waitUntil: 'commit' })
    }
    const session = await source.newBrowserCDPSession()
    await session.send('Browser.close').catch(() => {})
  } finally {
    await source?.close().catch(() => {})
    await destination?.close().catch(() => {})
  }
}
