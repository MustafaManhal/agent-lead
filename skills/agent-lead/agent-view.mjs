#!/usr/bin/env node
// The Codex terminal/status view uses the same event parser as Claude Code's pane.
import { open, stat, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

let log = process.env.AGENT_LEAD_LOG || join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'agent-runs/live.log')
let watch = false, json = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--watch') watch = true
  else if (args[i] === '--json') json = true
  else if (args[i] === '--log' && args[i + 1]) log = args[++i]
  else {
    console.error('usage: agent-view.mjs [--log <path>] [--json | --watch]')
    process.exit(2)
  }
}
if (watch && json) {
  console.error('agent-view: choose --json or --watch')
  process.exit(2)
}

try {
  let parser = new URL('./parse.ts', import.meta.url)
  try { await access(parser) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    parser = new URL('../../hooks/parse.ts', import.meta.url)
  }
  const { parseRun, EMPTY } = await import(parser.href)
  const clean = text => String(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
  let timer
  async function render() {
    let view = { ...EMPTY, steps: [], log: [] }
    try {
      const info = await stat(log)
      const file = await open(log, 'r')
      let text
      try {
        const size = Math.min(info.size, 4 * 1024 * 1024)
        const buffer = Buffer.alloc(size)
        const { bytesRead } = await file.read(buffer, 0, size, info.size - size)
        text = buffer.subarray(0, bytesRead).toString('utf8')
        if (info.size > size) text = text.slice(text.indexOf('\n') + 1)
      } finally { await file.close() }
      if (text.trim()) view = parseRun(text, info.mtimeMs, Date.now())
      // A stale stream alone does not confirm completion.
      view.stale = view.status === 'done' && view.exitCode === null && Date.now() - info.mtimeMs > 120_000
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (json) console.log(JSON.stringify({ ...view, logPath: log }))
    else {
      if (watch && process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
      console.log(clean(`${view.agent || 'worker'} · ${view.stale ? 'stale (completion unconfirmed)' : view.status} · ${view.seconds}s · ${view.tokens} tokens · ${view.denied} denied · exit ${view.exitCode ?? 'unknown'}`))
      if (view.conversationId) console.log(clean(`SESSION ${view.agent} ${view.conversationId}`))
      if (view.cwd) console.log(clean(view.cwd))
      for (const step of view.steps.slice(-30)) console.log(clean(`${step.state} ${step.tool} ${step.target}${step.note ? ' · ' + step.note : ''}`))
      for (const line of view.log.slice(-10)) console.log(clean(line))
      if (view.reply) console.log(clean('\n' + view.reply))
      if (view.status === 'idle') console.log('No worker log yet: ' + clean(log))
      if (watch) console.log('\nCtrl-C closes this viewer; the worker keeps running.')
    }
    if (watch) timer = setTimeout(() => render().catch(fail), 1000)
  }
  function fail(error) {
    console.error(`agent-view: ${error.message}`)
    process.exitCode = 1
  }
  process.once('SIGINT', () => { clearTimeout(timer); process.exit(0) })
  process.once('SIGTERM', () => { clearTimeout(timer); process.exit(0) })
  await render()
} catch (error) {
  console.error(`agent-view: ${error.message}. The viewer requires Node.js 22.18 or newer.`)
  process.exitCode = 1
}
