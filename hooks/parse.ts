// Turns the live run log of any coding agent CLI into one view for the pane.
// The log holds one record per line: JSON events from a CLI's streaming mode, the
// lead's own start/end markers, or plain text from CLIs without a JSON mode.

import type { AgentStep, AgentView } from '../types'

export type { AgentStep, AgentView }
type StepState = AgentStep['state']

export const EMPTY: AgentView = {
  mtimeMs: 0,
  agent: '',
  conversationId: '',
  cwd: '',
  status: 'idle',
  exitCode: null,
  steps: [],
  reply: '',
  log: [],
  denied: 0,
  seconds: 0,
  tokens: 0,
}

// A run with no end marker and no final event after this long is treated as ended.
export const STALE_MS = 120_000
const LOG_LINES = 200

const TARGET_KEYS = [
  'command',
  'CommandLine',
  'cmd',
  'file_path',
  'filePath',
  'TargetFile',
  'AbsolutePath',
  'path',
  'Path',
  'DirectoryPath',
  'SearchPath',
  'pattern',
  'query',
  'Query',
  'url',
  'Url',
  'description',
]

type Run = {
  view: AgentView
  steps: Map<string, AgentStep>
  order: string[]
  replies: Map<string, string>
  replyOrder: string[]
  startedAt: number
  // Gemini-style streams send an assistant message as many deltas; this is the one being built.
  streamKey: string | null
}

function short(value: string, cwd: string): string {
  let text = value.replace(/\s+/g, ' ').trim()
  // Codex wraps commands as `/bin/zsh -lc "…"`.
  const wrapped = /^\/bin\/(?:ba|z)?sh -lc (?:"(.*)"|'(.*)'|(.*))$/.exec(text)
  const inner = wrapped?.[1] ?? wrapped?.[2] ?? wrapped?.[3]
  if (inner) text = inner
  if (cwd && text.startsWith(cwd + '/')) text = text.slice(cwd.length + 1)

  return text.length > 160 ? text.slice(0, 157) + '…' : text
}

function targetOf(input: unknown, cwd: string): string {
  if (typeof input === 'string') {
    try {
      return targetOf(JSON.parse(input), cwd)
    } catch {
      return short(input, cwd)
    }
  }
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  const key = TARGET_KEYS.find(name => typeof record[name] === 'string' && record[name] !== '')
  const value = key
    ? String(record[key])
    : String(Object.values(record).find(one => typeof one === 'string') ?? '')

  return short(value, cwd)
}

function firstLine(text: unknown): string {
  return (
    String(text ?? '')
      .split('\n')
      .find(line => line.trim() !== '')
      ?.trim()
      .slice(0, 120) ?? ''
  )
}

function isDenial(text: unknown): boolean {
  return /denied|not allowed|permission|rejected|declined|blocked by/i.test(String(text ?? ''))
}

function setStep(run: Run, key: string, patch: Partial<AgentStep> & { tool?: string }) {
  const known = run.steps.get(key)
  if (!known) run.order.push(key)
  const next: AgentStep = {
    key,
    tool: patch.tool ?? known?.tool ?? 'tool',
    target: patch.target || known?.target || '',
    state: patch.state ?? known?.state ?? 'ACTIVE',
    note: patch.note ?? known?.note ?? '',
  }
  if (next.state === 'ERROR' && next.note === 'DENIED' && known?.note !== 'DENIED') run.view.denied += 1
  run.steps.set(key, next)
}

function addReply(run: Run, key: string, text: string, append: boolean) {
  if (!text) return
  if (!run.replies.has(key)) run.replyOrder.push(key)
  run.replies.set(key, append ? (run.replies.get(key) ?? '') + text : text)
}

function addLog(run: Run, line: string) {
  const clean = line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').trimEnd()
  if (clean.trim() === '') return
  run.view.log.push(clean.length > 300 ? clean.slice(0, 297) + '…' : clean)
  if (run.view.log.length > LOG_LINES) run.view.log.shift()
}

function guessAgent(run: Run, name: string) {
  if (!run.view.agent) run.view.agent = name
}

// ---- one reader per streaming format ------------------------------------------

function readMarker(run: Run, e: any): boolean {
  if (e.lead === 'start') {
    run.view.agent = String(e.agent ?? run.view.agent)
    run.view.cwd = String(e.cwd ?? run.view.cwd)
    run.startedAt = Number(e.at ?? 0)
    return true
  }
  if (e.lead === 'end') {
    run.view.status = 'done'
    run.view.exitCode = typeof e.code === 'number' ? e.code : Number(e.code ?? 0)
    if (!run.view.seconds && run.startedAt && e.at) run.view.seconds = Math.round((Number(e.at) - run.startedAt) / 1000)
    return true
  }

  return false
}

// agy (Antigravity CLI): --output-format stream-json
function readAgy(run: Run, e: any): boolean {
  if (e.event === 'init') {
    guessAgent(run, 'agy')
    run.view.conversationId = String(e.conversation_id ?? '')
    run.view.cwd ||= String(e.init?.cwd ?? '')
    return true
  }
  if (e.event === 'step_update') {
    guessAgent(run, 'agy')
    const step = e.step_update ?? {}
    const key = 'agy:' + String(step.step_index)
    if (step.step_type === 'tool') {
      const state: StepState = step.state === 'ERROR' ? 'ERROR' : step.state === 'DONE' ? 'DONE' : 'ACTIVE'
      const info = step.tool_info ?? {}
      const exit = /exited with code (\d+)/.exec(String(info.output ?? ''))
      const message = String(info.error?.message ?? 'error')
      setStep(run, key, {
        tool: String(step.tool_name ?? 'tool'),
        target: targetOf(info.parameters, run.view.cwd),
        state,
        note: state === 'ERROR' ? (message.includes('denied permission') ? 'DENIED' : firstLine(message)) : exit ? `exit ${exit[1]}` : '',
      })
    } else if (step.step_type === 'agent_response' && step.text_delta) {
      addReply(run, key, String(step.text_delta), true)
    }
    return true
  }
  if (e.event === 'result') {
    const result = e.result ?? {}
    run.view.status = 'done'
    run.view.seconds = Math.round(Number(result.duration_seconds ?? 0))
    run.view.tokens = Number(result.usage?.total_tokens ?? 0)
    run.view.denied = Math.max(run.view.denied, (result.denied_actions ?? []).length)
    if (result.response) addReply(run, 'agy:result', String(result.response), false)
    return true
  }

  return false
}

// Claude Code (--output-format stream-json --verbose) and CLIs that copy its shape.
function readClaude(run: Run, e: any): boolean {
  if (e.type === 'system') {
    if (e.subtype === 'init') {
      // Claude Code's init names its version; Cursor Agent copies the shape without it.
      guessAgent(run, 'claude_code_version' in e ? 'claude' : 'cursor')
      run.view.conversationId = String(e.session_id ?? '')
      run.view.cwd ||= String(e.cwd ?? '')
    }
    return true
  }
  if ((e.type === 'assistant' || e.type === 'user') && e.message) {
    const content = Array.isArray(e.message.content) ? e.message.content : []
    for (const part of content) {
      if (part.type === 'tool_use') {
        setStep(run, 'c:' + part.id, { tool: String(part.name ?? 'tool'), target: targetOf(part.input, run.view.cwd), state: 'ACTIVE' })
      } else if (part.type === 'tool_result') {
        const text = Array.isArray(part.content) ? part.content.map((one: any) => one.text ?? '').join(' ') : part.content
        setStep(run, 'c:' + part.tool_use_id, {
          state: part.is_error ? 'ERROR' : 'DONE',
          note: part.is_error ? (isDenial(text) ? 'DENIED' : firstLine(text)) : '',
        })
      } else if (part.type === 'text' && e.type === 'assistant') {
        addReply(run, 'c:' + (e.message.id ?? run.replyOrder.length), String(part.text ?? ''), false)
      }
    }
    return true
  }
  if (e.type === 'result' && ('duration_ms' in e || 'session_id' in e)) {
    run.view.status = 'done'
    run.view.seconds = Math.round(Number(e.duration_ms ?? 0) / 1000)
    const usage = e.usage ?? {}
    run.view.tokens = Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0)
    run.view.denied = Math.max(run.view.denied, (e.permission_denials ?? []).length)
    if (e.result) addReply(run, 'c:result', String(e.result), false)
    return true
  }
  if (e.type === 'rate_limit_event' || e.type === 'stream_event') return true

  return false
}

// Cursor Agent: -p --output-format stream-json (Claude-like, plus tool_call events).
function readCursor(run: Run, e: any): boolean {
  if (e.type !== 'tool_call' || !e.tool_call) return false
  guessAgent(run, 'cursor')
  const [name, body] = Object.entries(e.tool_call as Record<string, any>)[0] ?? ['tool', {}]
  const tool = name === 'function' ? String(body?.name ?? 'tool') : name.replace(/ToolCall$/, '')
  const args = name === 'function' ? body?.arguments : body?.args
  const result = body?.result
  const failed = result && !result.success && (result.error || result.rejected || result.failure)
  const failure = result?.error ?? result?.rejected ?? result?.failure
  setStep(run, 'cu:' + e.call_id, {
    tool,
    target: targetOf(args, run.view.cwd),
    state: e.subtype === 'completed' ? (failed ? 'ERROR' : 'DONE') : 'ACTIVE',
    note: failed ? (result.rejected || isDenial(JSON.stringify(failure)) ? 'DENIED' : firstLine(failure?.message ?? JSON.stringify(failure))) : typeof result?.success?.exitCode === 'number' ? `exit ${result.success.exitCode}` : '',
  })

  return true
}

// OpenAI Codex: codex exec --json
function readCodex(run: Run, e: any): boolean {
  const type = String(e.type ?? '')
  if (!/^(thread|turn|item)\./.test(type) && type !== 'error') return false
  if (type === 'error' && (!('message' in e) || 'severity' in e)) return false
  guessAgent(run, 'codex')
  if (type === 'thread.started') run.view.conversationId = String(e.thread_id ?? '')
  if (type === 'turn.completed') {
    const usage = e.usage ?? {}
    run.view.tokens += Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0)
    run.view.status = 'done'
  }
  if (type === 'turn.failed' || type === 'error') {
    addLog(run, 'error: ' + firstLine(e.error?.message ?? e.message))
    if (type === 'turn.failed') run.view.status = 'done'
  }
  const item = e.item
  if (item && (type === 'item.started' || type === 'item.updated' || type === 'item.completed')) {
    const done = type === 'item.completed'
    const key = 'cx:' + item.id
    if (item.type === 'agent_message') addReply(run, key, String(item.text ?? ''), false)
    else if (item.type === 'command_execution') {
      const failed = item.status === 'failed' || item.status === 'declined' || (done && typeof item.exit_code === 'number' && item.exit_code !== 0)
      setStep(run, key, {
        tool: 'shell',
        target: short(String(item.command ?? ''), run.view.cwd),
        state: done || item.status === 'declined' ? (failed ? 'ERROR' : 'DONE') : 'ACTIVE',
        note: item.status === 'declined' ? 'DENIED' : typeof item.exit_code === 'number' ? `exit ${item.exit_code}` : '',
      })
    } else if (item.type === 'file_change') {
      const paths = (item.changes ?? []).map((one: any) => short(String(one.path ?? ''), run.view.cwd)).join(', ')
      setStep(run, key, { tool: 'edit', target: paths, state: item.status === 'failed' ? 'ERROR' : done ? 'DONE' : 'ACTIVE', note: '' })
    } else if (item.type === 'mcp_tool_call') {
      setStep(run, key, { tool: `${item.server ?? 'mcp'}.${item.tool ?? 'tool'}`, target: targetOf(item.arguments, run.view.cwd), state: item.status === 'failed' ? 'ERROR' : done ? 'DONE' : 'ACTIVE', note: '' })
    } else if (item.type === 'web_search') {
      setStep(run, key, { tool: 'web_search', target: short(String(item.query ?? ''), run.view.cwd), state: done ? 'DONE' : 'ACTIVE', note: '' })
    } else if (item.type === 'error') {
      addLog(run, 'error: ' + firstLine(item.message))
    }
  }

  return true
}

// Gemini CLI and its forks (Qwen Code): -p --output-format stream-json
function readGemini(run: Run, e: any): boolean {
  const type = String(e.type ?? '')
  if (type === 'init' && 'session_id' in e) {
    guessAgent(run, 'gemini')
    run.view.conversationId = String(e.session_id ?? '')
    return true
  }
  if (type === 'message' && 'role' in e) {
    if (e.role !== 'assistant') {
      run.streamKey = null
      return true
    }
    if (!run.streamKey || !e.delta) run.streamKey = 'g:' + run.replyOrder.length
    addReply(run, run.streamKey, String(e.content ?? ''), true)
    return true
  }
  if (type === 'tool_use' && 'tool_name' in e) {
    run.streamKey = null
    setStep(run, 'g:' + e.tool_id, { tool: String(e.tool_name), target: targetOf(e.parameters, run.view.cwd), state: 'ACTIVE' })
    return true
  }
  if (type === 'tool_result' && 'tool_id' in e) {
    const failed = e.status === 'error'
    setStep(run, 'g:' + e.tool_id, { state: failed ? 'ERROR' : 'DONE', note: failed ? (isDenial(e.error?.message) ? 'DENIED' : firstLine(e.error?.message)) : '' })
    return true
  }
  if (type === 'error' && 'severity' in e) {
    addLog(run, `${e.severity}: ${firstLine(e.message)}`)
    return true
  }
  if (type === 'result' && ('stats' in e || 'status' in e) && !('duration_ms' in e)) {
    run.view.status = 'done'
    run.view.tokens = Number(e.stats?.total_tokens ?? 0)
    run.view.seconds = Math.round(Number(e.stats?.duration_ms ?? 0) / 1000)
    if (e.error?.message) addLog(run, 'error: ' + firstLine(e.error.message))
    return true
  }

  return false
}

// OpenCode: opencode run --format json
function readOpenCode(run: Run, e: any): boolean {
  if (!e.part && !(e.type === 'error' && e.sessionID)) return false
  guessAgent(run, 'opencode')
  if (e.sessionID) run.view.conversationId = String(e.sessionID)
  if (e.type === 'error') {
    addLog(run, 'error: ' + firstLine(e.error?.message ?? JSON.stringify(e.error)))
    return true
  }
  const part = e.part
  if (part.type === 'tool') {
    const state = part.state ?? {}
    const exit = state.metadata?.metadata?.exit ?? state.metadata?.exit
    const failed = state.status === 'error'
    setStep(run, 'oc:' + (part.callID ?? part.id), {
      tool: String(part.tool ?? 'tool'),
      target: targetOf(state.input, run.view.cwd),
      state: failed ? 'ERROR' : state.status === 'completed' ? 'DONE' : 'ACTIVE',
      note: failed ? (isDenial(state.error) ? 'DENIED' : firstLine(state.error)) : exit !== undefined && exit !== null ? `exit ${exit}` : '',
    })
  } else if (part.type === 'text') {
    addReply(run, 'oc:' + part.id, String(part.text ?? ''), false)
  } else if (part.type === 'step-finish') {
    const tokens = part.tokens ?? {}
    run.view.tokens += Number(tokens.input ?? 0) + Number(tokens.output ?? 0)
  }

  return true
}

const READERS = [readMarker, readAgy, readCodex, readCursor, readClaude, readGemini, readOpenCode]

export function parseRun(text: string, mtimeMs: number, now: number): AgentView {
  const run: Run = {
    view: { ...EMPTY, mtimeMs, status: 'running', steps: [], log: [] },
    steps: new Map(),
    order: [],
    replies: new Map(),
    replyOrder: [],
    startedAt: 0,
    streamKey: null,
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('{')) {
      let event: unknown
      try {
        event = JSON.parse(trimmed)
      } catch {
        addLog(run, line)
        continue
      }
      if (!READERS.some(read => read(run, event))) addLog(run, trimmed)
    } else {
      addLog(run, line)
    }
  }

  run.view.steps = run.order.map(key => run.steps.get(key)!).filter(Boolean)
  const lastReply = [...run.replyOrder].reverse().map(key => run.replies.get(key) ?? '').find(text => text.trim() !== '')
  run.view.reply = lastReply ?? ''
  if (run.view.status === 'running' && now - mtimeMs > STALE_MS) run.view.status = 'done'

  return run.view
}
