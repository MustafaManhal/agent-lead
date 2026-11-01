// Minimal MCP client over stdio: start a server, call one or more tools, stop it. Used by scan.mjs to run REA
// without an agent in between. The server command comes from Claude Code's own config (~/.claude.json
// mcpServers.<name>) unless one is given.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The stdio command of an MCP server configured in Claude Code (user or project scope), or null. */
export function serverFromClaude(name, cwd = process.cwd()) {
  const file = join(homedir(), '.claude.json')
  if (!existsSync(file)) return null
  try {
    const cfg = JSON.parse(readFileSync(file, 'utf8'))
    const s = cfg.projects?.[cwd]?.mcpServers?.[name] ?? cfg.mcpServers?.[name]
    return s?.command ? { command: s.command, args: s.args ?? [], env: s.env ?? {} } : null
  } catch {
    return null
  }
}

/** Start a server; returns { call(tool, args, timeoutMs), close() }. Rejects when it does not initialize. */
export async function connect({ command, args = [], env = {} }, { timeout = 120000 } = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] })
  let buf = ''
  let next = 1
  const waiting = new Map()
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      const w = msg.id != null && waiting.get(msg.id)
      if (w) { waiting.delete(msg.id); msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result) }
    }
  })
  const exited = new Promise((r) => child.on('exit', r))
  const request = (method, params, ms = timeout) =>
    new Promise((resolve, reject) => {
      const id = next++
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method}: no answer in ${ms} ms`)) }, ms)
      waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  const close = async () => { child.stdin.end(); child.kill(); await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]) }
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent-lead-scan', version: '1' } })
  } catch (e) {
    await close()
    throw e
  }
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  return {
    /** Call a tool; returns its structured result (or the parsed JSON of its first text block). */
    async call(tool, args, ms = timeout) {
      const r = await request('tools/call', { name: tool, arguments: args }, ms)
      if (r.isError) throw new Error(r.content?.map((c) => c.text).join(' ') || `${tool} failed`)
      if (r.structuredContent) return r.structuredContent
      const text = r.content?.find((c) => c.type === 'text')?.text ?? ''
      try { return JSON.parse(text) } catch { return text }
    },
    close,
  }
}
