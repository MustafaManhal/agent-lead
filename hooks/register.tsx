import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgyStep, AgyView } from '../types'

// agy writes its stream-json events here (the run is piped through `tee`).
const LOG = '.claude/agy-runs/live.ndjson'
const PANE = 'agy-lead'
const TITLE = 'agy live'
// A run with no `result` line after this long is treated as ended.
const STALE_MS = 120_000

const EMPTY: AgyView = {
  mtimeMs: 0,
  conversationId: '',
  cwd: '',
  status: 'idle',
  steps: [],
  reply: '',
  denied: 0,
  seconds: 0,
  tokens: 0,
}

const view = atom({ plugin: 'agy-lead', key: 'view' } as const, EMPTY, {
  shape: 'view-1',
})

const TARGET_KEYS = [
  'CommandLine',
  'TargetFile',
  'AbsolutePath',
  'Path',
  'DirectoryPath',
  'SearchPath',
  'Query',
  'Url',
]

function targetOf(parameters: Record<string, unknown> | undefined, cwd: string): string {
  if (!parameters) return ''
  const key = TARGET_KEYS.find(name => typeof parameters[name] === 'string')
  const value = key
    ? String(parameters[key])
    : String(Object.values(parameters).find(one => typeof one === 'string') ?? '')

  return cwd && value.startsWith(cwd + '/') ? value.slice(cwd.length + 1) : value
}

function firstLine(text: string): string {
  return text.split('\n').find(line => line.trim() !== '')?.trim() ?? ''
}

function noteOf(info: any, state: AgyStep['state']): string {
  if (state === 'ERROR') {
    const message = String(info?.error?.message ?? 'error')

    return message.includes('denied permission') ? 'DENIED' : firstLine(message)
  }
  const exit = /exited with code (\d+)/.exec(String(info?.output ?? ''))

  return exit ? `exit ${exit[1]}` : ''
}

function parse(text: string, mtimeMs: number, now: number): AgyView {
  const next: AgyView = { ...EMPTY, mtimeMs, status: 'running' }
  const steps = new Map<number, AgyStep>()
  const replies = new Map<number, string>()

  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue
    let event: any
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.event === 'init') {
      next.conversationId = String(event.conversation_id ?? '')
      next.cwd = String(event.init?.cwd ?? '')
    } else if (event.event === 'step_update') {
      const step = event.step_update ?? {}
      const index = Number(step.step_index)
      if (step.step_type === 'tool') {
        const state = step.state === 'ERROR' ? 'ERROR' : step.state === 'DONE' ? 'DONE' : 'ACTIVE'
        steps.set(index, {
          index,
          tool: String(step.tool_name ?? 'tool'),
          target: targetOf(step.tool_info?.parameters, next.cwd),
          state,
          note: noteOf(step.tool_info, state),
        })
        if (state === 'ERROR' && steps.get(index)?.note === 'DENIED') next.denied += 1
      } else if (step.step_type === 'agent_response' && step.text_delta) {
        replies.set(index, (replies.get(index) ?? '') + String(step.text_delta))
      }
    } else if (event.event === 'result') {
      const result = event.result ?? {}
      next.status = 'done'
      next.seconds = Math.round(Number(result.duration_seconds ?? 0))
      next.tokens = Number(result.usage?.total_tokens ?? 0)
      next.denied = Math.max(next.denied, (result.denied_actions ?? []).length)
      if (result.response) replies.set(Number.MAX_SAFE_INTEGER, String(result.response))
    }
  }

  next.steps = [...steps.values()].sort((a, b) => a.index - b.index)
  const lastReply = [...replies.entries()].sort((a, b) => b[0] - a[0])[0]
  next.reply = lastReply ? lastReply[1] : ''
  if (next.status === 'running' && now - mtimeMs > STALE_MS) next.status = 'done'

  return next
}

export const register: Register = on => {
  let home = ''
  let isPolling = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'agy',
      description: 'Show what the Antigravity CLI (agy) is doing, live',
    })
    const env = await $.process.run(['printenv', 'HOME'])
    home = env.stdout.trim()

    $.clock.every(1000, async () => {
      if (!home || isPolling) return
      isPolling = true
      try {
        const path = `${home}/${LOG}`
        if (!(await $.fs.exists(path))) return
        const { mtimeMs } = await $.fs.stat(path)
        const now = await $.clock.now()
        const current = await read($, view)
        const isStaleCheckDue = current.status === 'running' && now - mtimeMs > STALE_MS
        if (mtimeMs === current.mtimeMs && !isStaleCheckDue) return
        const parsed = parse(await $.fs.read(path), mtimeMs, now)
        await update($, view, () => parsed)
        // Open the pane when a run starts, follow-up rounds of one conversation included.
        if (parsed.status === 'running' && current.status !== 'running') {
          void $.ui.open({ id: PANE, title: TITLE })
        }
      } catch {
        // The file is mid-write or gone; the next tick tries again.
      } finally {
        isPolling = false
      }
    })

    return started
  })

  on('command.run', { command: 'agy' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'agy live pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const state = await read($, view)
    const rows = Math.max(6, (e.viewport?.rows ?? 30) - 4)

    if (state.status === 'idle') {
      return (
        <Box flexDirection="column">
          <Text dimColor>No agy run yet.</Text>
          <Text dimColor>Runs piped to ~/{LOG} show here.</Text>
        </Box>
      )
    }

    const folder = state.cwd.split('/').filter(Boolean).pop() ?? ''
    const header =
      state.status === 'running'
        ? `● running  ${folder}`
        : `■ done  ${folder}  ${state.seconds}s  ${state.tokens} tokens`
    const replyLines = state.reply.split('\n').filter(line => line.trim() !== '')
    const stepRoom = Math.max(3, Math.floor(rows * 0.55))
    const replyRoom = Math.max(2, rows - Math.min(stepRoom, state.steps.length) - 4)

    return (
      <Box flexDirection="column">
        <Text color={state.status === 'running' ? 'warning' : 'success'} weight="bold">
          {header}
        </Text>
        <Text dimColor wrap="truncate-end">
          conversation {state.conversationId.slice(0, 8)}
          {state.denied > 0 ? `  ·  ${state.denied} denied` : ''}
        </Text>
        <Text> </Text>
        {state.steps.length === 0 && <Text dimColor>Thinking…</Text>}
        {state.steps.slice(-stepRoom).map(step => (
          <Text
            wrap="truncate-end"
            color={step.state === 'ERROR' ? 'error' : step.state === 'ACTIVE' ? 'warning' : undefined}
          >
            {step.state === 'ERROR' ? '✖' : step.state === 'ACTIVE' ? '…' : '✔'} {step.tool}{' '}
            {step.target}
            {step.note ? `  (${step.note})` : ''}
          </Text>
        ))}
        {replyLines.length > 0 && <Text> </Text>}
        {replyLines.length > 0 && <Text weight="bold">agy says:</Text>}
        {replyLines.slice(-replyRoom).map(line => (
          <Text wrap="truncate-end" dimColor>
            {line}
          </Text>
        ))}
      </Box>
    )
  })
}
