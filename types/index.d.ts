export type AgyStep = {
  index: number
  tool: string
  target: string
  state: 'ACTIVE' | 'DONE' | 'ERROR'
  note: string
}

export type AgyView = {
  mtimeMs: number
  conversationId: string
  cwd: string
  status: 'idle' | 'running' | 'done'
  steps: AgyStep[]
  reply: string
  denied: number
  seconds: number
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'agy-lead': { view: Shaped<AgyView> }
  }
}
