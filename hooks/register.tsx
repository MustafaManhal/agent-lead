import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { EMPTY, STALE_MS, parseRun } from './parse'

// The lead pipes every run here (see the agent-lead skill). The old agy-only path is still read.
const LOGS = ['.claude/agent-runs/live.log', '.claude/agy-runs/live.ndjson']
const PANE = 'agent-lead'
const TITLE = 'agent live'

const view = atom({ plugin: 'agent-lead', key: 'view' } as const, EMPTY, {
  shape: 'view-2',
})

export const register: Register = on => {
  let home = ''
  let isPolling = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'agent',
      description: 'Show what your coding agent CLI is doing, live',
    })
    await $.command.register({
      name: 'agy',
      description: 'Same as /agent: the live pane of the delegated agent run',
    })
    const env = await $.process.run(['printenv', 'HOME'])
    home = env.stdout.trim()

    $.clock.every(1000, async () => {
      if (!home || isPolling) return
      isPolling = true
      try {
        // The newest of the log files is the current run.
        let path = ''
        let mtimeMs = 0
        for (const log of LOGS) {
          const candidate = `${home}/${log}`
          if (!(await $.fs.exists(candidate))) continue
          const stat = await $.fs.stat(candidate)
          if (stat.mtimeMs > mtimeMs) {
            path = candidate
            mtimeMs = stat.mtimeMs
          }
        }
        if (!path) return
        const now = await $.clock.now()
        const current = await read($, view)
        const isStaleCheckDue = current.status === 'running' && now - mtimeMs > STALE_MS
        if (mtimeMs === current.mtimeMs && !isStaleCheckDue) return
        const parsed = parseRun(await $.fs.read(path), mtimeMs, now)
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

  for (const command of ['agent', 'agy']) {
    on('command.run', { command }, async $ => {
      await $.ui.open({ id: PANE, title: TITLE })

      return { text: 'Agent live pane opened.' }
    })
  }

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const state = await read($, view)
    const rows = Math.max(6, (e.viewport?.rows ?? 30) - 4)

    if (state.status === 'idle') {
      return (
        <Box flexDirection="column">
          <Text dimColor>No agent run yet.</Text>
          <Text dimColor>Runs piped to ~/{LOGS[0]} show here.</Text>
        </Box>
      )
    }

    const folder = state.cwd.split('/').filter(Boolean).pop() ?? ''
    const agent = state.agent || 'agent'
    const failed = state.exitCode !== null && state.exitCode !== 0
    const stats = [
      state.seconds ? `${state.seconds}s` : '',
      state.tokens ? `${state.tokens.toLocaleString('en-US')} tokens` : '',
      state.exitCode !== null ? `exit ${state.exitCode}` : '',
    ].filter(Boolean)
    const header =
      state.status === 'running' ? `● ${agent} running  ${folder}` : `■ ${agent} done  ${folder}  ${stats.join(' · ')}`
    const replyLines = state.reply.split('\n').filter(line => line.trim() !== '')
    // Plain-text CLIs have no steps: their output is the log.
    const logOnly = state.steps.length === 0 && state.log.length > 0
    const stepRoom = Math.max(3, Math.floor(rows * 0.55))
    const used = Math.min(stepRoom, logOnly ? state.log.length : state.steps.length)
    const replyRoom = Math.max(2, rows - used - 4)

    return (
      <Box flexDirection="column">
        <Text
          color={state.status === 'running' ? 'warning' : failed ? 'error' : 'success'}
          weight="bold"
          wrap="truncate-end"
        >
          {header}
        </Text>
        <Text dimColor wrap="truncate-end">
          {state.conversationId ? `session ${state.conversationId.slice(0, 8)}` : 'no session id'}
          {state.denied > 0 ? `  ·  ${state.denied} denied` : ''}
        </Text>
        <Text> </Text>
        {state.steps.length === 0 && state.log.length === 0 && <Text dimColor>Thinking…</Text>}
        {state.steps.slice(-stepRoom).map(step => (
          <Text
            wrap="truncate-end"
            color={step.state === 'ERROR' ? 'error' : step.state === 'ACTIVE' ? 'warning' : undefined}
          >
            {step.state === 'ERROR' ? '✖' : step.state === 'ACTIVE' ? '…' : '✔'} {step.tool} {step.target}
            {step.note ? `  (${step.note})` : ''}
          </Text>
        ))}
        {logOnly &&
          state.log.slice(-stepRoom).map(line => (
            <Text wrap="truncate-end" dimColor>
              {line}
            </Text>
          ))}
        {!logOnly && state.log.length > 0 && (
          <Text wrap="truncate-end" color="warning">
            {state.log[state.log.length - 1]}
          </Text>
        )}
        {replyLines.length > 0 && <Text> </Text>}
        {replyLines.length > 0 && <Text weight="bold">{agent} says:</Text>}
        {replyLines.slice(-replyRoom).map(line => (
          <Text wrap="truncate-end" dimColor>
            {line}
          </Text>
        ))}
      </Box>
    )
  })
}
