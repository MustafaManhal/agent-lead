// A local CDP endpoint backed by Chromium's debugging pipe. The browser never receives WebSocket CDP traffic.
// Each client has its own browser session, so discovery, page sessions and detach are independent.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'

function webSockets() {
  for (const root of [process.env.AGENT_LEAD_PLAYWRIGHT_ROOT, join(homedir(), '.config/agent-lead/browser-runtime'), process.cwd()].filter(Boolean)) {
    const require = createRequire(join(root, 'package.json'))
    try { return require('ws') } catch {}
    try {
      const bundle = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'))
      return { WebSocketServer: bundle.wsServer }
    } catch {}
  }
  throw new Error('Install Playwright in the agent-lead browser runtime or project before starting the pipe browser')
}

export async function startPipeBrowser({ executable, profile, port = 9343, headless = true }) {
  const { WebSocketServer } = webSockets()
  const shell = /headless[-_]shell/.test(executable)
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const userAgent = await readFile(join(profile, '.agent-lead-user-agent'), 'utf8').catch(() => null)
  const browser = spawn(executable, [
    `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--no-startup-window', '--no-first-run',
    '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', ...(headless ? ['--headless=new'] : []), ...(headless && userAgent ? [`--user-agent=${userAgent}`] : []),
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  let nextId = 0, buffer = Buffer.alloc(0), closed = false
  let server, wss
  const pending = new Map(), owners = new Map(), clients = new Set()
  const write = message => browser.stdio[3].write(JSON.stringify(message) + '\0')
  const request = (method, params = {}, sessionId, client = null) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('pipe browser is closed'))
    const id = ++nextId
    pending.set(id, { resolve, reject, method, client })
    write({ id, method, params, ...(sessionId ? { sessionId } : {}) })
  })
  const reply = (client, message) => { if (client.readyState === 1) client.send(JSON.stringify(message)) }
  browser.stdio[4].on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    let end
    while ((end = buffer.indexOf(0)) !== -1) {
      const data = buffer.subarray(0, end); buffer = buffer.subarray(end + 1)
      if (!data.length) continue
      const message = JSON.parse(data.toString())
      if (message.id !== undefined) {
        const entry = pending.get(message.id)
        if (!entry) continue
        pending.delete(message.id)
        message.error ? entry.reject(Object.assign(new Error(message.error.message), { code: message.error.code })) : entry.resolve(message.result)
        continue
      }
      if (message.method === 'Target.targetDestroyed') identitySessions.delete(message.params.targetId)
      if (identity && message.method === 'Target.targetCreated' && !message.sessionId && message.params.targetInfo.type === 'page') {
        const { targetId } = message.params.targetInfo
        const entry = { sessionId: null, initialized: null }
        entry.initialized = request('Target.attachToTarget', { targetId, flatten: true }).then(async ({ sessionId }) => {
          entry.sessionId = sessionId
          await request('Emulation.setUserAgentOverride', identity, sessionId)
        })
        identitySessions.set(targetId, entry)
        const initialized = entry.initialized
        void initialized.catch(() => {})
        continue
      }
      const owner = owners.get(message.sessionId)
      if (!owner) continue
      if (message.method === 'Target.attachedToTarget') owners.set(message.params.sessionId, owner)
      if (message.method === 'Target.detachedFromTarget') owners.delete(message.params.sessionId)
      const outgoing = { ...message }
      if (message.sessionId === owner.root) delete outgoing.sessionId
      reply(owner.ws, outgoing)
    }
  })
  const fail = error => {
    closed = true
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    for (const client of clients) client.ws.terminate()
    server?.close()
  }
  browser.on('error', fail)
  browser.on('exit', () => fail(new Error('pipe browser exited')))
  browser.stdio[3].on('error', () => {})
  browser.stdio[4].on('error', fail)
  const version = await request('Browser.getVersion').catch(error => { browser.kill('SIGTERM'); throw error })
  const protocol = await readFile(join(profile, '.agent-lead-protocol.json'), 'utf8').then(JSON.parse, () => null)
  const identity = headless ? await readFile(join(profile, '.agent-lead-ua-override.json'), 'utf8').then(JSON.parse, () => null) : null
  const identitySessions = new Map()
  if (identity) await request('Target.setDiscoverTargets', { discover: true, filter: [{ type: 'page' }, { exclude: true }] })
  async function prepareTarget(targetId, url) {
    if (!identity) return
    let entry = identitySessions.get(targetId)
    if (!entry) {
      const { sessionId } = await request('Target.attachToTarget', { targetId, flatten: true })
      entry = { sessionId, initialized: request('Emulation.setUserAgentOverride', identity, sessionId) }
      identitySessions.set(targetId, entry)
    }
    await entry.initialized
    const { sessionId } = entry
    if (url && url !== 'about:blank') await request('Page.navigate', { url }, sessionId)
  }
  let actualPort
  const address = () => `127.0.0.1:${actualPort}`
  const targetList = async () => (await request('Target.getTargets')).targetInfos
  const create = async params => {
    const targets = await targetList()
    const hasPage = targets.some(t => t.type === 'page' && (!params.browserContextId || t.browserContextId === params.browserContextId))
    const creation = { ...params, background: !headless, newWindow: params.newWindow ?? !hasPage }
    if (shell) { delete creation.newWindow; delete creation.background }
    if (headless) delete creation.focus
    else creation.focus = false
    const url = creation.url
    if (identity) creation.url = 'about:blank'
    const result = await request('Target.createTarget', creation)
    await prepareTarget(result.targetId, url)
    return result
  }
  const info = target => ({ ...target, id: target.targetId, webSocketDebuggerUrl: `ws://${address()}/devtools/page/${target.targetId}` })
  server = createServer(async (req, res) => {
    try {
      if (req.headers.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname)) { res.writeHead(403); res.end(); return }
      const url = new URL(req.url, `http://${address()}`)
      url.pathname = url.pathname.replace(/\/$/, '')
      if (url.pathname === '/blank') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Automation initialization</title>'); return }
      let value
      if (url.pathname === '/proxy/status') value = { pid: browser.pid, clients: clients.size, sessions: owners.size, pending: [...pending.values()].map(p => p.method), transport: 'pipe' }
      else if (url.pathname === '/json/version') value = { Browser: version.product, 'Protocol-Version': version.protocolVersion, 'User-Agent': version.userAgent, webSocketDebuggerUrl: `ws://${address()}/devtools/browser/agent-lead`, agentLeadTransport: 'pipe', headless, driverPid: process.pid, browserPid: browser.pid }
      else if (['/json', '/json/list'].includes(url.pathname)) value = (await targetList()).filter(t => t.type === 'page').map(info)
      else if (url.pathname === '/json/new') {
        if (req.method !== 'PUT') { res.writeHead(405); res.end('Use PUT for new targets'); return }
        const { targetId } = await create({ url: decodeURIComponent(url.search.slice(1)) || 'about:blank' })
        value = info((await targetList()).find(t => t.targetId === targetId))
      } else if (url.pathname.startsWith('/json/close/')) value = await request('Target.closeTarget', { targetId: url.pathname.split('/').pop() })
      else if (url.pathname.startsWith('/json/activate/')) value = { success: true }
      else if (url.pathname === '/json/protocol' && protocol) value = protocol
      else { res.writeHead(404); res.end(); return }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value))
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.message })) }
  })
  wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin
    if (origin && !/^devtools:\/\//.test(origin)) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  })
  wss.on('connection', async (ws, req) => {
    const client = { ws, root: null, pageRoot: false, discovery: false, autoAttach: false, contexts: new Set(), explicitRoots: new Set() }
    clients.add(client)
    const waiting = []
    let ready = false
    const handle = async message => {
      const { id, method } = message
      if (id === undefined) return
      try {
        if (['Page.bringToFront', 'Target.activateTarget'].includes(method)) { reply(ws, { id, result: {}, ...(message.sessionId ? { sessionId: message.sessionId } : {}) }); return }
        const sessionId = message.sessionId ?? client.root
        if (message.sessionId && owners.get(message.sessionId) !== client) throw new Error('CDP session belongs to another client')
        let params = message.params ?? {}
        if (method === 'Target.setAutoAttach' && sessionId === client.root && !params.filter) params = { ...params, filter: [{ type: 'page' }, { type: 'service_worker' }, { exclude: true }] }
        if (method === 'Target.createTarget') {
          const hasPage = (await targetList()).some(t => t.type === 'page' && (!params.browserContextId || t.browserContextId === params.browserContextId))
          params = { ...params, background: !headless, newWindow: params.newWindow ?? !hasPage }
          if (shell) { delete params.newWindow; delete params.background }
          if (headless) delete params.focus
          else params.focus = false
        }
        const destination = method === 'Target.createTarget' ? params.url : null
        if (destination && identity) params = { ...params, url: 'about:blank' }
        const result = await request(method, params, sessionId, client)
        if (method === 'Target.createTarget') await prepareTarget(result.targetId, destination)
        if (result?.sessionId && ['Target.attachToTarget', 'Target.attachToBrowserTarget'].includes(method)) {
          owners.set(result.sessionId, client)
          if (!message.sessionId) client.explicitRoots.add(result.sessionId)
        }
        if (method === 'Target.createBrowserContext') client.contexts.add(result.browserContextId)
        if (method === 'Target.disposeBrowserContext') client.contexts.delete(params.browserContextId)
        reply(ws, { id, result, ...(message.sessionId ? { sessionId: message.sessionId } : {}) })
      } catch (error) { reply(ws, { id, error: { code: error.code ?? -32000, message: error.message }, ...(message.sessionId ? { sessionId: message.sessionId } : {}) }) }
    }
    ws.on('message', data => {
      try { const message = JSON.parse(data.toString()); if (ready) void handle(message); else waiting.push(message) }
      catch { ws.close(1003, 'Invalid CDP JSON') }
    })
    ws.on('close', () => {
      clients.delete(client)
      for (const [id, entry] of pending) if (entry.client === client) { pending.delete(id); entry.reject(new Error('CDP client disconnected')) }
      for (const [session, owner] of owners) if (owner === client) owners.delete(session)
      if (!closed) {
        if (client.root) void request('Target.detachFromTarget', { sessionId: client.root }).catch(() => {})
        for (const sessionId of client.explicitRoots) void request('Target.detachFromTarget', { sessionId }).catch(() => {})
        for (const browserContextId of client.contexts) void request('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
      }
    })
    try {
      const pageId = req.url.startsWith('/devtools/page/') ? req.url.split('/').pop() : null
      const attached = await request(pageId ? 'Target.attachToTarget' : 'Target.attachToBrowserTarget', pageId ? { targetId: pageId, flatten: true } : {})
      client.root = attached.sessionId; owners.set(client.root, client)
      if (ws.readyState !== 1) { await request('Target.detachFromTarget', { sessionId: client.root }); return }
      ready = true
      for (const message of waiting) void handle(message)
    } catch { ws.close(1011, 'Could not attach pipe browser session') }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) }).catch(error => { browser.kill('SIGTERM'); throw error })
  actualPort = server.address().port
  return {
    endpoint: `http://${address()}`, pid: browser.pid,
    async close() {
      if (!closed) await request('Browser.close').catch(() => {})
      for (const client of clients) client.ws.terminate()
      await new Promise(resolve => wss.close(resolve))
      await new Promise(resolve => server.close(resolve))
      if (!closed) browser.kill('SIGTERM')
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  const driver = await startPipeBrowser({ executable: option('--browser'), profile: option('--profile'), port: Number(option('--port') || 9343), headless: !args.includes('--headed') })
  console.log(`agent-lead pipe browser ready at ${driver.endpoint}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await driver.close(); process.exit(0) })
}
