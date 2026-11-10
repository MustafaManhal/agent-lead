#!/usr/bin/env node
// Parallel workers, in any tool: each worker gets its own git worktree, branch, port and run log, so several agents
// (launched by agent-run, or pasted into emdash, a terminal or an IDE) never share files, a dev-server port or a log.
//   node <tools>/worker.mjs add <name> [--from <branch>] [--path <dir>] [--port <n>]
//        creates ../<repo>-<name> on branch agent-lead/<name> (or adopts an existing worktree at --path), gives it
//        the next free port, runs "workerSetup" from the config there (for example "pnpm install")
//   node <tools>/worker.mjs list               name, path, branch, port, uncommitted files, run state (running/stale/done)
//   node <tools>/worker.mjs remove <name>      removes a clean worktree (the branch stays)
//   node <tools>/worker.mjs here               "<name> <port>" for the worktree you are in (agent-run uses it)
// Limits: "maxWorkers" in the config (default 3) and "portBase" (default 4100). The registry is one JSON file in the
// repository's shared .git folder, so every worktree sees the same list.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { config, git, options, root, run, sh } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const [cmd, name] = args
const common = path.resolve(root, git('rev-parse', '--git-common-dir').stdout.trim())
const file = path.join(common, 'agent-lead-workers.json')
const main = path.basename(common) === '.git' ? path.dirname(common) : root
const load = () => { try { return JSON.parse(readFileSync(file, 'utf8')).workers ?? [] } catch { return [] } }
const save = (workers) => writeFileSync(file, JSON.stringify({ workers }, null, 1) + '\n')
const real = (p) => { try { return realpathSync(p) } catch { return path.resolve(p) } }
const workers = load()

function runState(n) {
  const dirs = [process.env.AGENT_LEAD_RUNS, path.join(homedir(), '.claude/agent-runs/runs'), path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'agent-runs/runs')].filter(Boolean)
  const logs = dirs.map((d) => path.join(d, `${n}.log`)).filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!logs.length) return 'no run yet'
  const text = readFileSync(logs[0], 'utf8')
  const end = /\{"lead":"end","code":(\d+)/.exec(text.slice(-400))
  if (end) return `done (exit ${end[1]})`
  const idle = Math.round((Date.now() - statSync(logs[0]).mtimeMs) / 1000)
  return idle > 120 ? `stale (silent for ${Math.round(idle / 60)} min: crashed or out of quota?)` : 'running'
}

if (cmd === 'here') {
  const w = workers.find((x) => real(x.path) === real(root))
  if (!w) process.exit(1)
  console.log(`${w.name} ${w.port}`)
} else if (cmd === 'list') {
  if (!workers.length) console.log('no workers (add one: worker.mjs add <name>)')
  for (const w of workers) {
    if (!existsSync(w.path)) { console.log(`${w.name}  MISSING ${w.path} (remove it: worker.mjs remove ${w.name})`); continue }
    const dirty = run('git', ['-C', w.path, 'status', '--porcelain']).stdout.split('\n').filter(Boolean).length
    console.log(`${w.name}  ${w.path}  ${w.branch}  port ${w.port}  ${dirty ? `${dirty} uncommitted file(s)` : 'clean'}  ${runState(w.name)}`)
  }
} else if (cmd === 'add' && name) {
  if (!/^[\w-]+$/.test(name)) { console.log('a worker name is letters, digits, - and _'); process.exit(2) }
  if (workers.some((w) => w.name === name)) { console.log(`worker ${name} already exists`); process.exit(1) }
  const max = config.maxWorkers ?? 3
  if (workers.length >= max) { console.log(`already ${workers.length} workers (maxWorkers ${max}): more of them means more merge conflicts and quota use; raise "maxWorkers" in .agent-lead/config.json if you mean it`); process.exit(1) }
  const dir = path.resolve(o.opt('--path') ?? path.join(path.dirname(main), `${path.basename(main)}-${name}`))
  let branch = `agent-lead/${name}`
  if (existsSync(dir)) {
    if (real(path.resolve(dir, run('git', ['-C', dir, 'rev-parse', '--git-common-dir']).stdout.trim())) !== real(common)) { console.log(`${dir} exists and is not a worktree of this repository`); process.exit(1) }
    branch = run('git', ['-C', dir, 'branch', '--show-current']).stdout.trim() || branch
  } else {
    const from = o.opt('--from') ?? git('branch', '--show-current').stdout.trim()
    const r = git('worktree', 'add', dir, '-b', branch, ...(from ? [from] : []))
    if (r.status !== 0) { console.log(r.out.trim()); process.exit(1) }
  }
  const taken = new Set(workers.map((w) => w.port))
  let port = Number(o.opt('--port') ?? config.portBase ?? 4100)
  while (taken.has(port)) port++
  save([...workers, { name, path: dir, branch, port }])
  console.log(`worker ${name}: ${dir} on ${branch}, port ${port}`)
  if (config.workerSetup) {
    const s = sh(config.workerSetup, { cwd: dir, env: { ...process.env, AGENT_LEAD_PORT: String(port), PORT: String(port) } })
    console.log(s.status === 0 ? `setup ok: ${config.workerSetup}` : `setup failed (${config.workerSetup}):\n${s.out.trim().split('\n').slice(-6).join('\n')}`)
  }
} else if (cmd === 'remove' && name) {
  const w = workers.find((x) => x.name === name)
  if (!w) { console.log(`no worker ${name}`); process.exit(1) }
  if (existsSync(w.path)) {
    const dirty = run('git', ['-C', w.path, 'status', '--porcelain']).stdout.trim()
    if (dirty) { console.log(`not removed: ${w.path} has uncommitted work:\n${dirty.split('\n').slice(0, 8).join('\n')}`); process.exit(1) }
    const r = git('worktree', 'remove', w.path)
    if (r.status !== 0) { console.log(r.out.trim()); process.exit(1) }
  }
  save(workers.filter((x) => x.name !== name))
  console.log(`removed worker ${name} (branch ${w.branch} kept)`)
} else {
  console.error('usage: worker.mjs add <name> [--from branch] [--path dir] [--port n] | list | remove <name> | here')
  process.exit(2)
}
