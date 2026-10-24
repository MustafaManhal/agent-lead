export type AgentStep = {
  key: string
  tool: string
  target: string
  state: 'ACTIVE' | 'DONE' | 'ERROR'
  note: string
}

export type AgentView = {
  mtimeMs: number
  agent: string
  conversationId: string
  cwd: string
  status: 'idle' | 'running' | 'done'
  exitCode: number | null
  steps: AgentStep[]
  reply: string
  log: string[]
  denied: number
  seconds: number
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-lead': { view: Shaped<AgentView> }
  }
}
