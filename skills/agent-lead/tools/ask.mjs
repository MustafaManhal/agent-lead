#!/usr/bin/env node
// Token saver: hand a small job to a cheaper model and print only its answer. Good for summarizing a long page into
// the few facts you need, drafting boilerplate or test data, quick lookups. Not for decisions that need this
// project's judgment. Never send secrets or the user's private files.
//   node <tools>/ask.mjs "<question>" [--url <page>]... [--file <path>]... [--model <name>] [--max <words>]
// The model endpoint, keys and default model come from the environment or ~/.config/agent-lead/llm.env:
//   AGENT_LEAD_LLM_API    "ollama" (default) or "openai" (any OpenAI-compatible /chat/completions endpoint)
//   AGENT_LEAD_LLM_URL    default https://ollama.com/api/chat (Ollama cloud); http://localhost:11434/api/chat for a
//                         local Ollama; e.g. https://api.openai.com/v1/chat/completions for "openai"
//   AGENT_LEAD_LLM_KEY    API key (AGENT_LEAD_LLM_KEY_2, _3: more keys, tried in turn when one is rate limited)
//   AGENT_LEAD_LLM_MODEL  default model
// OLLAMA_API_KEY is read too, for an existing Ollama setup. A local Ollama needs no key.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { options } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const urls = o.all('--url')
const files = o.all('--file')
const modelArg = o.opt('--model')
const max = Number(o.opt('--max', 250))
const question = args.join(' ')
if (!question) {
  console.error('usage: ask.mjs "<question>" [--url page] [--file path] [--model m] [--max words]')
  process.exit(2)
}

const envFile = join(homedir(), '.config', 'agent-lead', 'llm.env')
const fileText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
const setting = (name) => process.env[name] ?? new RegExp(`^${name}=(\\S+)`, 'm').exec(fileText)?.[1]
const api = setting('AGENT_LEAD_LLM_API') ?? 'ollama'
const endpoint = setting('AGENT_LEAD_LLM_URL') ?? (api === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://ollama.com/api/chat')
const model = modelArg ?? setting('AGENT_LEAD_LLM_MODEL') ?? (api === 'openai' ? 'gpt-4o-mini' : 'gemma3:27b')
const keys = [...new Set(['AGENT_LEAD_LLM_KEY', 'AGENT_LEAD_LLM_KEY_2', 'AGENT_LEAD_LLM_KEY_3', 'OLLAMA_API_KEY'].map(setting).filter(Boolean))]
const local = /localhost|127\.0\.0\.1/.test(endpoint)
if (!keys.length && !local) {
  console.error(`No API key. Set AGENT_LEAD_LLM_KEY in the environment or in ${envFile} (never in the repo).`)
  process.exit(2)
}

const strip = (html) =>
  html
    .replace(/<(script|style|nav|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()

const context = []
for (const u of urls) {
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (agent-lead research)' } })
  context.push(`PAGE ${u}:\n${strip(await r.text()).slice(0, 60000)}`)
}
for (const f of files) context.push(`FILE ${f}:\n${readFileSync(f, 'utf8').slice(0, 60000)}`)
const messages = [
  { role: 'system', content: `Answer tersely and precisely, at most ${max} words. Facts only, no preamble. If the material does not say, answer "not stated".` },
  { role: 'user', content: [...context, `QUESTION: ${question}`].join('\n\n') },
]
const body = JSON.stringify(api === 'openai' ? { model, messages } : { model, messages, stream: false })

let r = null
for (const [i, key] of (keys.length ? keys : [null]).entries()) {
  r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body })
  if (r.ok || ![401, 402, 403, 429].includes(r.status) || i === keys.length - 1) break
  console.error(`[key ${i + 1}: ${r.status}, trying the next key]`)
}
if (!r.ok) {
  console.log(`model error ${r.status}: ${(await r.text()).slice(0, 300)}`)
  process.exit(1)
}
const j = await r.json()
const text = api === 'openai' ? j.choices?.[0]?.message?.content : j.message?.content
console.log((text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim())
