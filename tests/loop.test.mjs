// The item loop: check, next, done, ship, land, the checklist page, and the worker launcher's limits and usage line.
// Everything runs in temporary git repos with fake worker CLIs; no paid agent, no network, no user config.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('..', import.meta.url))
const skill = join(repo, 'skills/agent-lead')
const tool = (name) => join(skill, 'tools', `${name}.mjs`)
const PLAN = `# Demo plan

A small demo.

## Milestones

### M1. Basics
- [x] Scaffold the app. \`{easy}\`
- [ ] Settings screen with a theme switch. \`{hard}\`
- [ ] Export to CSV. \`{easy}\`

### M2. Later
- [ ] Settings sync across devices. \`{hard}\`
`

async function run(cmd, args, opts = {}) {
  try {
    const r = await exec(cmd, args, opts)
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

async function project(t, { test: testScript = `node -e "console.log('Tests: 3 passed, 3 total')"` } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-lead-loop-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const git = (...a) => exec('git', a, { cwd: dir })
  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'Test')
  await mkdir(join(dir, 'docs'))
  await mkdir(join(dir, 'src'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: testScript } }))
  await writeFile(join(dir, 'docs/06-implementation-plan.md'), PLAN)
  await writeFile(join(dir, 'src/settings.ts'), 'export const settings = { theme: "light" }\n')
  await writeFile(join(dir, '.gitignore'), '.agent-lead/checklist.html\n')
  await git('add', '-A')
  await git('commit', '-q', '-m', 'init')
  return { dir, git, node: (name, ...args) => run(process.execPath, [tool(name), ...args], { cwd: dir }) }
}

test('check prints one OK line, or the failing check with exit 1', async (t) => {
  const ok = await project(t)
  const pass = await ok.node('check')
  assert.equal(pass.code, 0)
  assert.match(pass.out, /^OK tests 3 passed/)
  const bad = await project(t, { test: `node -e "console.error('Error: boom'); process.exit(1)"` })
  const fail = await bad.node('check')
  assert.equal(fail.code, 1)
  assert.match(fail.out, /FAIL tests/)
  assert.match(fail.out, /boom/)
})

test('next picks the first open item in plan order and ranks source files', async (t) => {
  const p = await project(t)
  const r = await p.node('next')
  assert.equal(r.code, 0)
  assert.match(r.out, /M1\. Basics/)
  assert.match(r.out, /\[ \] Settings screen with a theme switch/)
  assert.match(r.out, /Open in this milestone: 2/)
  assert.match(r.out, /src\/settings\.ts/)
})

test('done marks one item, rebuilds the page, and refuses ambiguous text', async (t) => {
  const p = await project(t)
  const vague = await p.node('done', 'Settings')
  assert.equal(vague.code, 1)
  assert.match(vague.out, /matches 2 items/)
  assert.equal(await readFile(join(p.dir, 'docs/06-implementation-plan.md'), 'utf8'), PLAN)
  const exact = await p.node('done', 'Settings screen', '--note', '2026-01-01: shipped')
  assert.equal(exact.code, 0)
  const plan = await readFile(join(p.dir, 'docs/06-implementation-plan.md'), 'utf8')
  assert.match(plan, /- \[x\] Settings screen with a theme switch/)
  assert.match(plan, /- \[ \] Settings sync across devices/)
  assert.match(plan, /2026-01-01: shipped/)
  assert.match(exact.out, /checklist page rebuilt: 2 done · 0 in progress · 2 not started/)
  assert.match(await readFile(join(p.dir, '.agent-lead/checklist.html'), 'utf8'), /<title>Demo plan<\/title>/)
  const missing = await p.node('done', 'No such item')
  assert.equal(missing.code, 1)
})

test('ship runs checks, marks the plan, commits with the worker credit, and blocks secrets', async (t) => {
  const p = await project(t)
  await writeFile(join(p.dir, 'src/export.ts'), 'export const toCsv = () => ""\n')
  await writeFile(join(p.dir, '.env.local'), 'KEY=secret\n')
  const blocked = await p.node('ship', 'Export to CSV', 'feat: export', '--coauthor', 'Worker <w@example.com>')
  assert.equal(blocked.code, 1)
  assert.match(blocked.out, /secret file/)
  assert.equal((await p.git('log', '--oneline')).stdout.trim().split('\n').length, 1)
  await rm(join(p.dir, '.env.local'))
  // The blocked attempt already ticked the plan; ship again with --no-plan would lose that, so re-run as is.
  const shipped = await p.node('ship', 'Export to CSV', 'feat: export', '--coauthor', 'Worker <w@example.com>')
  assert.equal(shipped.code, 0, shipped.out)
  const log = (await p.git('log', '-1', '--format=%B')).stdout
  assert.match(log, /^feat: export/)
  assert.match(log, /Co-Authored-By: Worker <w@example\.com>/)
  const files = (await p.git('show', '--name-only', '--format=', 'HEAD')).stdout
  assert.match(files, /src\/export\.ts/)
  assert.match(files, /docs\/06-implementation-plan\.md/)
  assert.doesNotMatch(files, /checklist\.html/)
  const failing = await project(t, { test: `node -e "process.exit(1)"` })
  const not = await failing.node('ship', 'Export to CSV', 'feat: export')
  assert.equal(not.code, 1)
  assert.match(not.out, /Not shipped: fix the checks first/)
})

test('land merges a clean branch and prints conflicts compactly', async (t) => {
  const p = await project(t)
  await p.git('checkout', '-q', '-b', 'worker')
  await writeFile(join(p.dir, 'src/new.ts'), 'export const a = 1\n')
  await p.git('add', '-A')
  await p.git('commit', '-q', '-m', 'worker: new file')
  await p.git('checkout', '-q', 'main')
  const clean = await p.node('land', 'worker')
  assert.equal(clean.code, 0, clean.out)
  assert.match(clean.out, /worker: 1 new commit/)
  assert.match(clean.out, /OK tests/)
  await p.git('checkout', '-q', '-b', 'worker2')
  await writeFile(join(p.dir, 'src/settings.ts'), 'export const settings = { theme: "dark" }\n')
  await p.git('commit', '-q', '-am', 'worker: dark')
  await p.git('checkout', '-q', 'main')
  await writeFile(join(p.dir, 'src/settings.ts'), 'export const settings = { theme: "auto" }\n')
  await p.git('commit', '-q', '-am', 'lead: auto')
  const conflict = await p.node('land', 'worker2')
  assert.equal(conflict.code, 2)
  assert.match(conflict.out, /=== src\/settings\.ts: 1 conflict/)
  assert.match(conflict.out, /OURS:[\s\S]*auto[\s\S]*THEIRS:[\s\S]*dark/)
  assert.equal((await p.node('land', 'worker2', '--abort')).code, 0)
})

test('plan-page counts items and names the next one', async (t) => {
  const p = await project(t)
  const out = join(p.dir, 'page.html')
  const r = await run(process.execPath, [join(skill, 'plan-page.mjs'), join(p.dir, 'docs/06-implementation-plan.md'), out])
  assert.equal(r.code, 0)
  const s = JSON.parse(r.out.trim().split('\n').pop())
  assert.deepEqual({ sections: s.sections, done: s.done, partial: s.partial, todo: s.todo, percent: s.percent }, { sections: 2, done: 1, partial: 0, todo: 3, percent: 25 })
  assert.match(s.next, /Settings screen/)
  assert.match(await readFile(out, 'utf8'), /M1/)
})

test('agent-run adds the project package manager and tools to the limits and reports usage', async (t) => {
  const p = await project(t)
  const runtime = await mkdtemp(join(tmpdir(), 'agent-lead-rt-'))
  t.after(() => rm(runtime, { recursive: true, force: true }))
  for (const f of ['agent-run', 'run-agent.sh', 'worker-rules.md', 'agent-view.mjs']) await copyFile(join(skill, f), join(runtime, f))
  await copyFile(join(repo, 'hooks/parse.ts'), join(runtime, 'parse.ts'))
  await writeFile(join(runtime, 'tools-path'), join(skill, 'tools') + '\n')
  const bin = join(runtime, 'bin')
  await mkdir(bin)
  const args = join(runtime, 'claude-args.txt')
  await writeFile(join(bin, 'claude'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${args}"\necho '{"type":"system","subtype":"init","session_id":"s-1","claude_code_version":"x","cwd":"'"$PWD"'"}'\necho '{"type":"result","duration_ms":4000,"session_id":"s-1","usage":{"input_tokens":100,"output_tokens":20}}'\n`)
  await chmod(join(bin, 'claude'), 0o755)
  await writeFile(join(p.dir, 'pnpm-lock.yaml'), '')
  const brief = join(p.dir, 'brief.md')
  await writeFile(brief, '# Task 01: demo\n')
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_LEAD_LOG: join(runtime, 'live.log') }
  const r = await run('bash', [join(runtime, 'agent-run'), 'claude', brief, '--cd', p.dir, '--model', 'small'], { env })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /SESSION claude s-1/)
  assert.match(r.out, /USAGE claude small tokens=120 seconds=4 denied=0/)
  const passed = await readFile(args, 'utf8')
  assert.match(passed, /Bash\(pnpm test:\*\)/)
  assert.match(passed, /Bash\(npm test:\*\)/)
  assert.ok(passed.includes(`Bash(node ${join(skill, 'tools')}/check.mjs:*)`))
  assert.doesNotMatch(passed, /ship\.mjs|done\.mjs|land\.mjs/)
  assert.match(await readFile(join(runtime, 'usage.log'), 'utf8'), /claude\tsmall\ttokens=120 seconds=4 denied=0\texit=0/)
})
