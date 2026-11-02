import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('..', import.meta.url))
const installer = join(repo, 'skills/agent-lead/install-codex.mjs')
const viewer = join(repo, 'skills/agent-lead/agent-view.mjs')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const lines = events => events.map(event => JSON.stringify(event)).join('\n') + '\n'

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-lead codex '))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const runtime = join(dir, 'runtime'), skills = join(dir, 'skills')
  const install = () => exec(process.execPath, [installer, '--dest', runtime, '--skills-dir', skills, '--skills'])
  return { dir, runtime, skills, install }
}

test('Codex package resolves its skills, marketplace, and host-specific hooks', async () => {
  const manifest = await readJSON(join(repo, '.codex-plugin/plugin.json'))
  assert.equal(manifest.version, (await readJSON(join(repo, '.claude-plugin/plugin.json'))).version)
  const marketplace = await readJSON(join(repo, '.agents/plugins/marketplace.json'))
  assert.equal(resolve(repo, marketplace.plugins[0].source.path), resolve(repo))
  const hooks = await readJSON(join(repo, manifest.hooks))
  const command = hooks.hooks.SessionStart[0].hooks[0].command
  assert.match(command, /PLUGIN_ROOT.*codex-first-run.sh/)
  assert.ok(!command.includes('setup.sh'))
  for (const name of ['agent-lead', 'lead', 'agent']) {
    await stat(join(repo, manifest.skills, name, 'SKILL.md'))
  }
  await stat(join(repo, manifest.extensions['com.openai'].onboardingSkill))
})

test('standalone setup is repeatable, backs up changed files, and runs outside the repo', async t => {
  const { runtime, skills, install } = await fixture(t)
  await install()
  const rules = join(runtime, 'worker-rules.md')
  const first = await stat(rules)
  await install()
  assert.equal((await stat(rules)).mtimeMs, first.mtimeMs)
  assert.ok(!(await readdir(runtime)).some(name => name.endsWith('.bak-agent-lead')))
  await writeFile(rules, 'user rules\n')
  await install()
  assert.equal(await readFile(rules + '.bak-agent-lead', 'utf8'), 'user rules\n')
  assert.match(await readFile(rules, 'utf8'), /Rules for you, the worker/)
  assert.ok((await stat(join(runtime, 'agent-run'))).mode & 0o100)
  for (const name of ['lead', 'agent', 'agent-lead']) await stat(join(skills, name, 'SKILL.md'))
  // The installed standalone copy can repair its runtime without the original clone.
  const repaired = join(runtime, 'repaired')
  await exec(process.execPath, [join(skills, 'agent-lead/install-codex.mjs'), '--dest', repaired, '--skills-dir', skills, '--skills'])
  await stat(join(repaired, 'agent-run'))
  const missing = join(runtime, 'missing.log')
  for (const script of [join(runtime, 'agent-view.mjs'), join(skills, 'agent-lead/agent-view.mjs')]) {
    const { stdout } = await exec(process.execPath, [script, '--json', '--log', missing])
    const view = JSON.parse(stdout)
    assert.equal(view.status, 'idle')
    assert.equal(view.logPath, missing)
  }
})

test('Codex launcher preserves limits, working directory, resume prompts, logs, and exit codes', async t => {
  const { dir, runtime, install } = await fixture(t)
  await install()
  const bin = join(dir, 'bin'), work = join(dir, 'worker'), brief = join(dir, 'brief.md')
  await mkdir(bin)
  await mkdir(work)
  await writeFile(brief, 'Implement the fixture. Literal $(do-not-execute) and `no-command`.')
  const capture = join(dir, 'args.json')
  await writeFile(join(bin, 'codex'), `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.env.AGENT_LEAD_TEST_ARGS, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }))
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fixture-session' }))
console.log(JSON.stringify({ type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: 'Fixture report' } }))
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 6 } }))
process.exit(Number(process.env.AGENT_LEAD_TEST_EXIT || 0))
`, { mode: 0o755 })
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH, AGENT_LEAD_TEST_ARGS: capture }
  delete env.AGENT_LEAD_LOG
  const launcher = join(runtime, 'agent-run')
  const first = await exec('bash', [launcher, 'codex', brief, '--cd', work, '--model', 'fixture-model'], { env })
  assert.match(first.stdout, /SESSION codex fixture-session/)
  let call = await readJSON(capture)
  assert.equal(call.cwd, await realpath(work))
  assert.deepEqual(call.args.slice(0, 5), ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check'])
  assert.ok(call.args.includes('fixture-model'))
  assert.match(call.args.at(-1), /Rules for you, the worker/)
  assert.match(call.args.at(-1), /Literal \$\(do-not-execute\) and `no-command`/)
  const log = join(runtime, 'live.log')
  assert.match(await readFile(log, 'utf8'), /"lead":"end","code":0/)
  const { stdout } = await exec(process.execPath, [join(runtime, 'agent-view.mjs'), '--log', log, '--json'])
  const view = JSON.parse(stdout)
  assert.equal(view.exitCode, 0)
  assert.equal(view.conversationId, 'fixture-session')
  assert.equal(view.tokens, 16)
  assert.equal(view.reply, 'Fixture report')
  await exec('bash', [launcher, 'codex', brief, '--cd', work, '--resume', 'fixture-session'], { env })
  call = await readJSON(capture)
  assert.deepEqual(call.args.slice(0, 5), ['exec', 'resume', 'fixture-session', '--json', '-c'])
  assert.ok(call.args.includes('sandbox_mode="workspace-write"'))
  assert.equal(call.args.at(-1), await readFile(brief, 'utf8'))
  const customLog = join(dir, 'custom.log')
  await assert.rejects(exec('bash', [launcher, 'codex', brief, '--cd', work], {
    env: { ...env, AGENT_LEAD_LOG: customLog, AGENT_LEAD_TEST_EXIT: '7' },
  }), error => error.code === 7)
  assert.match(await readFile(customLog, 'utf8'), /"lead":"end","code":7/)
  await exec('bash', [join(runtime, 'run-agent.sh'), 'custom', process.execPath, '-e', 'console.log("plain worker report")'], { env })
  assert.match(await readFile(log, 'utf8'), /"lead":"start","agent":"custom"/)
  assert.match(await readFile(log, 'utf8'), /plain worker report/)
  await assert.rejects(exec('bash', [launcher, 'codex', brief, '--cd'], { env }), error => error.code === 2)
})

test('viewer shares the pane parser for every supported worker format', async t => {
  const { dir } = await fixture(t)
  const formats = {
    codex: [
      { type: 'thread.started', thread_id: 'session-codex' },
      { type: 'item.completed', item: { id: '1', type: 'command_execution', command: 'npm test', status: 'declined' } },
      { type: 'item.completed', item: { id: '2', type: 'agent_message', text: 'report-codex' } },
    ],
    claude: [
      { type: 'system', subtype: 'init', claude_code_version: 'test', session_id: 'session-claude' },
      { type: 'assistant', message: { id: '1', content: [{ type: 'text', text: 'report-claude' }] } },
    ],
    agy: [{ event: 'init', conversation_id: 'session-agy' }, { event: 'result', result: { response: 'report-agy' } }],
    cursor: [
      { type: 'system', subtype: 'init', session_id: 'session-cursor' },
      { type: 'assistant', message: { id: '1', content: [{ type: 'text', text: 'report-cursor' }] } },
    ],
    gemini: [{ type: 'init', session_id: 'session-gemini' }, { type: 'message', role: 'assistant', content: 'report-gemini' }],
    qwen: [{ type: 'init', session_id: 'session-qwen' }, { type: 'message', role: 'assistant', content: 'report-qwen' }],
    opencode: [{ sessionID: 'session-opencode', part: { type: 'text', id: '1', text: 'report-opencode' } }],
  }
  for (const [agent, events] of Object.entries(formats)) {
    const log = join(dir, agent + '.log')
    await writeFile(log, lines([{ lead: 'start', agent, cwd: dir, at: Date.now() - 3000 }, ...events, { lead: 'end', code: 0, at: Date.now() }]))
    const { stdout } = await exec(process.execPath, [viewer, '--log', log, '--json'])
    const view = JSON.parse(stdout)
    assert.equal(view.agent, agent)
    assert.equal(view.conversationId, 'session-' + agent)
    assert.equal(view.reply, 'report-' + agent)
    assert.equal(view.status, 'done')
    assert.equal(view.exitCode, 0)
    if (agent === 'codex') assert.equal(view.denied, 1)
  }
})

test('viewer distinguishes live, stale, and idle logs and can close without a worker signal', async t => {
  const { dir } = await fixture(t)
  const log = join(dir, 'live.log')
  await writeFile(log, '')
  assert.equal(JSON.parse((await exec(process.execPath, [viewer, '--log', log, '--json'])).stdout).status, 'idle')
  await writeFile(log, lines([{ lead: 'start', agent: 'codex', at: Date.now() - 5000 }]))
  const live = JSON.parse((await exec(process.execPath, [viewer, '--log', log, '--json'])).stdout)
  assert.equal(live.status, 'running')
  assert.ok(live.seconds >= 5)
  const staleTime = new Date(Date.now() - 130_000)
  await utimes(log, staleTime, staleTime)
  const stale = JSON.parse((await exec(process.execPath, [viewer, '--log', log, '--json'])).stdout)
  assert.equal(stale.stale, true)
  assert.equal(stale.exitCode, null)
  const child = spawn(process.execPath, [viewer, '--log', log, '--watch'], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  let output = ''
  child.stdout.on('data', data => {
    output += data
    if (output.includes('Ctrl-C closes this viewer')) child.kill('SIGINT')
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('viewer did not close')) }, 5000)
    child.once('error', reject)
    child.once('exit', code => { clearTimeout(timer); resolve(code) })
  })
  assert.equal(code, 0)
  assert.match(output, /stale \(completion unconfirmed\)/)
  assert.match(output, /worker keeps running/)
})
