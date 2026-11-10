// verify, map, worker, intake, handoff and the launcher's retry: temporary git repos and a fake worker CLI only.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('..', import.meta.url))
const skill = join(repo, 'skills/agent-lead')
const tool = (name) => join(skill, 'tools', `${name}.mjs`)
const PLAN = `# Demo plan\n\n## Milestones\n\n### M1. Basics\n- [x] Scaffold. \`{easy}\`\n- [ ] Settings screen (#3). \`{hard}\`\n`

async function run(cmd, args, opts = {}) {
  try {
    const r = await exec(cmd, args, opts)
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

async function project(t, testScript = `node -e "console.log('Tests: 2 passed, 2 total')"`) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'agent-lead-tools-')))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const git = (...a) => exec('git', a, { cwd: dir })
  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'Test')
  for (const d of ['docs', 'src', 'tests', '.agent-lead/briefs']) await mkdir(join(dir, d), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: testScript, dev: 'vite' }, dependencies: { a: '1.0.0' } }))
  await writeFile(join(dir, 'docs/06-implementation-plan.md'), PLAN)
  await writeFile(join(dir, 'src/settings.ts'), 'export const settings = { theme: "light" }\nexport function applyTheme() {}\n')
  await writeFile(join(dir, '.agent-lead/status.md'), '# Status log\n- 2026-01-01: set up. Next: settings.\n')
  await writeFile(join(dir, '.gitignore'), '.agent-lead/briefs/\n.agent-lead/checklist.html\n.agent-lead/handoff.md\n')
  await git('add', '-A')
  await git('commit', '-q', '-m', 'init')
  const brief = join(dir, '.agent-lead/briefs/01-settings.md')
  await writeFile(brief, '# Task 01\n\n## Goal\nSettings.\n\n## Files\n- `src/settings/`\n- `src/settings.ts`\n\n## Report\nWrite it.\n')
  const report = (extra = '') => writeFile(join(dir, '.agent-lead/briefs/01-settings.report.md'), `# Report\n## Built\nx\n## Check output\nOK\n## Left or unsure\nnothing${extra}\n`)
  return { dir, git, brief, report, node: (name, ...args) => run(process.execPath, [tool(name), ...args], { cwd: dir }) }
}

test('verify passes clean work and fails scope, dependency, secret and missing-report problems', async (t) => {
  const p = await project(t)
  await writeFile(join(p.dir, 'src/settings.ts'), 'export const settings = { theme: "dark" }\n')
  const noReport = await p.node('verify', p.brief)
  assert.equal(noReport.code, 1)
  assert.match(noReport.out, /FAIL no report/)
  await p.report()
  const ok = await p.node('verify', p.brief)
  assert.equal(ok.code, 0, ok.out)
  assert.match(ok.out, /PASS 1 changed file\(s\), all inside the brief's files/)
  assert.match(ok.out, /PASS OK tests 2 passed/)
  await writeFile(join(p.dir, 'src/other.ts'), 'export const key = "sk_live_abcdefghijklmnop1234"\ndocument.body.innerHTML = key\n')
  await writeFile(join(p.dir, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node -e "0"' }, dependencies: { a: '1.0.0', b: '2.0.0' } }))
  await writeFile(join(p.dir, 'docs/06-implementation-plan.md'), PLAN + '- [x] sneaky\n')
  const bad = await p.node('verify', p.brief, '--no-check')
  assert.equal(bad.code, 1)
  assert.match(bad.out, /FAIL outside the brief's files: .*src\/other\.ts/)
  assert.match(bad.out, /FAIL dependencies changed: package\.json/)
  assert.match(bad.out, /FAIL worker touched protected files: docs\/06-implementation-plan\.md/)
  assert.match(bad.out, /FAIL something that looks like a secret/)
  assert.match(bad.out, /WARN added code uses raw HTML injection/)
})

test('verify --tests-only records tests and later fails when the build round edits them', async (t) => {
  const p = await project(t)
  await p.report()
  await writeFile(join(p.dir, 'tests/settings.test.ts'), 'test("theme", () => {})\n')
  await writeFile(join(p.dir, 'src/settings.ts'), 'export const settings = 1\n')
  const mixed = await p.node('verify', p.brief, '--tests-only')
  assert.equal(mixed.code, 1)
  assert.match(mixed.out, /tests-first round changed non-test files: src\/settings\.ts/)
  await p.git('checkout', '--', 'src/settings.ts')
  const first = await p.node('verify', p.brief, '--tests-only')
  assert.equal(first.code, 0, first.out)
  assert.ok(existsSync(join(p.dir, '.agent-lead/briefs/01-settings.tests.json')))
  await writeFile(join(p.dir, 'src/settings.ts'), 'export const settings = { theme: "dark" }\n')
  const built = await p.node('verify', join(p.dir, '.agent-lead/briefs/01-settings-2.md').replace('-2.md', '.md'))
  assert.equal(built.code, 0, built.out)
  assert.match(built.out, /PASS 1 approved test file\(s\) unchanged/)
  await writeFile(join(p.dir, 'tests/settings.test.ts'), 'test("theme", () => { /* weakened */ })\n')
  const cheated = await p.node('verify', p.brief)
  assert.equal(cheated.code, 1)
  assert.match(cheated.out, /FAIL approved tests were changed or removed: tests\/settings\.test\.ts/)
})

test('map lists source files with their exports, and ship keeps it and the handoff current', async (t) => {
  const p = await project(t)
  const m = await p.node('map')
  assert.equal(m.code, 0, m.out)
  const map = await readFile(join(p.dir, '.agent-lead/repo-map.md'), 'utf8')
  assert.match(map, /`settings\.ts` \(3\): settings, applyTheme/)
  assert.match(map, /check `tests`/)
  await writeFile(join(p.dir, 'src/export.ts'), 'export const toCsv = () => ""\n')
  const s = await p.node('ship', 'Settings screen', 'feat: settings')
  assert.equal(s.code, 0, s.out)
  const files = (await p.git('show', '--name-only', '--format=', 'HEAD')).stdout
  assert.match(files, /\.agent-lead\/repo-map\.md/)
  assert.doesNotMatch(files, /handoff\.md/)
  assert.match(await readFile(join(p.dir, '.agent-lead/repo-map.md'), 'utf8'), /`export\.ts` \(2\): toCsv/)
  const h = await readFile(join(p.dir, '.agent-lead/handoff.md'), 'utf8')
  assert.match(h, /feat: settings/)
  assert.match(h, /Every plan item is done/)
  assert.match(h, /2026-01-01: set up/)
  assert.match(h, /`01-settings\.md`: no report yet/)
})

test('worker add gives each worker a worktree, branch and port; list, here, limit and remove work', async (t) => {
  const p = await project(t)
  await writeFile(join(p.dir, '.agent-lead/config.json'), JSON.stringify({ maxWorkers: 2, workerSetup: 'echo port=$AGENT_LEAD_PORT > .port' }))
  const a = await p.node('worker', 'add', 'alpha')
  assert.equal(a.code, 0, a.out)
  assert.match(a.out, /worker alpha: .*-alpha on agent-lead\/alpha, port 4100/)
  const b = await p.node('worker', 'add', 'beta')
  assert.match(b.out, /port 4101\n.*setup ok/, b.out)
  t.after(() => rm(`${p.dir}-alpha`, { recursive: true, force: true }))
  t.after(() => rm(`${p.dir}-beta`, { recursive: true, force: true }))
  assert.equal((await readFile(`${p.dir}-beta/.port`, 'utf8')).trim(), 'port=4101')
  const third = await p.node('worker', 'add', 'gamma')
  assert.equal(third.code, 1)
  assert.match(third.out, /maxWorkers 2/)
  const here = await run(process.execPath, [tool('worker'), 'here'], { cwd: `${p.dir}-beta` })
  assert.equal(here.out.trim(), 'beta 4101')
  assert.equal((await p.node('worker', 'here')).code, 1)
  const list = await p.node('worker', 'list')
  assert.match(list.out, /alpha .*port 4100  1 uncommitted file\(s\)  no run yet/)
  assert.match(list.out, /beta .*1 uncommitted file\(s\)/)
  const kept = await p.node('worker', 'remove', 'beta')
  assert.equal(kept.code, 1)
  assert.match(kept.out, /uncommitted work/)
  await rm(`${p.dir}-alpha/.port`)
  const gone = await p.node('worker', 'remove', 'alpha')
  assert.equal(gone.code, 0, gone.out)
  assert.ok(!existsSync(`${p.dir}-alpha`))
})

test('intake appends new issues once, with size tags', async (t) => {
  const p = await project(t)
  const issues = join(p.dir, 'issues.json')
  await writeFile(issues, JSON.stringify([{ number: 3, title: 'Settings screen', labels: [] }, { number: 7, title: 'Fix   typo in footer', labels: [{ name: 'easy' }] }, { number: 9, title: 'Offline sync', labels: [] }]))
  const dry = await p.node('intake', '--from', issues, '--dry')
  assert.match(dry.out, /- \[ \] Fix typo in footer \(#7\) `\{easy\}`/)
  assert.doesNotMatch(dry.out, /#3/)
  const r = await p.node('intake', '--from', issues)
  assert.equal(r.code, 0, r.out)
  const plan = await readFile(join(p.dir, 'docs/06-implementation-plan.md'), 'utf8')
  assert.match(plan, /### Inbox\n- \[ \] Fix typo in footer \(#7\) `\{easy\}`\n- \[ \] Offline sync \(#9\) `\{hard\}`\n$/)
  assert.match((await p.node('intake', '--from', issues)).out, /no new issues/)
})

test('agent-run sends failing checks back to the same session and uses a per-worker log and port', async (t) => {
  const p = await project(t, `node -e "process.exit(require('fs').existsSync('fixed') ? 0 : (console.error('Error: theme test failed'), 1))"`)
  const runtime = await mkdtemp(join(tmpdir(), 'agent-lead-rt-'))
  t.after(() => rm(runtime, { recursive: true, force: true }))
  for (const f of ['agent-run', 'run-agent.sh', 'worker-rules.md', 'agent-view.mjs']) await copyFile(join(skill, f), join(runtime, f))
  await copyFile(join(repo, 'hooks/parse.ts'), join(runtime, 'parse.ts'))
  await writeFile(join(runtime, 'tools-path'), join(skill, 'tools') + '\n')
  const add = await p.node('worker', 'add', 'w1')
  assert.equal(add.code, 0, add.out)
  const wt = `${p.dir}-w1`
  t.after(() => rm(wt, { recursive: true, force: true }))
  const bin = join(runtime, 'bin')
  await mkdir(bin)
  const calls = join(runtime, 'calls.txt')
  // The fake worker "fixes" the project only when it is resumed with the failing output.
  await writeFile(join(bin, 'claude'), `#!/usr/bin/env bash\necho "port=$AGENT_LEAD_PORT resume=$([[ "$*" == *--resume* ]] && echo yes || echo no) fail=$([[ "$*" == *"theme test failed"* ]] && echo seen || echo none)" >> "${calls}"\n[[ "$*" == *--resume* ]] && touch fixed\necho '{"type":"system","subtype":"init","session_id":"s-9","claude_code_version":"x"}'\necho '{"type":"result","duration_ms":1000,"session_id":"s-9","usage":{"input_tokens":10,"output_tokens":5}}'\n`)
  await chmod(join(bin, 'claude'), 0o755)
  const brief = join(runtime, 'brief.md')
  await writeFile(brief, '# Task 01\n')
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_LEAD_LOG: join(runtime, 'live.log') }
  const r = await run('bash', [join(runtime, 'agent-run'), 'claude', brief, '--cd', wt], { env })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /RETRY checks failing; sent back to the same session \(2 left\)/)
  assert.match(r.out, /CHECKS OK tests/)
  assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n'), ['port=4100 resume=no fail=none', 'port=4100 resume=yes fail=seen'])
  assert.ok(existsSync(join(runtime, 'runs/w1.log')))
  assert.ok(!existsSync(join(runtime, 'live.log')))
  const all = await run(process.execPath, [join(runtime, 'agent-view.mjs'), '--log', join(runtime, 'live.log'), '--all'])
  assert.match(all.out, /^w1 {2}claude {2}done exit 0/m)
  const off = await run('bash', [join(runtime, 'agent-run'), 'claude', brief, '--cd', p.dir], { env: { ...env, AGENT_LEAD_RETRIES: '0' } })
  assert.match(off.out, /CHECKS FAIL \(no retries left\)/)
})
