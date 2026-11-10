#!/usr/bin/env node
// Install Codex's worker tools; --skills also installs the standalone skill entry points.
import { chmod, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
let dest = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'agent-runs')
let skillsDir = join(homedir(), '.agents/skills')
let installSkills = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skills') installSkills = true
  else if (['--dest', '--skills-dir'].includes(args[i]) && args[i + 1]) {
    const value = resolve(args[++i])
    if (args[i - 1] === '--dest') dest = value
    else skillsDir = value
  } else {
    console.error('usage: install-codex.mjs [--skills] [--dest <runtime-dir>] [--skills-dir <skills-dir>]')
    process.exit(2)
  }
}

async function read(path) {
  try { return await readFile(path) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function put(path, content, executable = false) {
  const previous = await read(path)
  if (!previous?.equals(content)) {
    await mkdir(dirname(path), { recursive: true })
    if (previous && await read(path + '.bak-agent-lead') === null) {
      await writeFile(path + '.bak-agent-lead', previous, { flag: 'wx' })
    }
    await writeFile(path, content)
  }
  if (executable) await chmod(path, 0o755)
}

async function copySkill(source, target) {
  if (await realpath(source) === await realpath(target).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })) return
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name)
    if (entry.isDirectory()) await copySkill(from, to)
    else if (entry.isFile()) await put(to, await readFile(from))
  }
}

try {
  const manifest = JSON.parse(await read(join(root, '.codex-plugin/plugin.json')) || await readFile(join(here, 'codex-install.json')))
  for (const [source, name] of [
    ['agent-run', 'agent-run.core'],
    ['run-agent.sh', 'run-agent.core.sh'],
    ['worker-rules.md', 'worker-rules.md'],
    ['agent-view.mjs', 'agent-view.mjs'],
  ]) await put(join(dest, name), await readFile(join(here, source)), name.endsWith('.sh') || name === 'agent-run.core')
  const parser = await read(join(root, 'hooks/parse.ts')) || await readFile(join(here, 'parse.ts'))
  await put(join(dest, 'parse.ts'), parser)
  await put(join(dest, 'tools-path'), Buffer.from(join(here, 'tools') + '\n'))

  // Keep the shared launcher's Claude default intact; this entry point selects the Codex log.
  for (const [name, target] of [['agent-run', 'agent-run.core'], ['run-agent.sh', 'run-agent.core.sh']]) {
    const wrapper = `#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export AGENT_LEAD_LOG="\${AGENT_LEAD_LOG:-$here/live.log}"
exec bash "$here/${target}" "$@"
`
    await put(join(dest, name), Buffer.from(wrapper), true)
  }
  if (installSkills) {
    for (const name of ['agent-lead', 'lead', 'agent']) {
      await copySkill(join(here, '..', name), join(skillsDir, name))
    }
    // The standalone status viewer resolves the shared parser relative to agent-lead.
    await put(join(skillsDir, 'agent-lead/parse.ts'), parser)
    await put(join(skillsDir, 'agent-lead/codex-install.json'), Buffer.from(JSON.stringify({ version: manifest.version }) + '\n'))
  }
  await put(join(dest, 'installed-version'), Buffer.from(manifest.version + '\n'))
  console.log(`Agent Lead ${manifest.version}: worker tools ready in ${dest}`)
  if (installSkills) console.log(`Skills ready in ${skillsDir}. Desktop app: type /lead and select Lead; CLI/IDE: $lead. Start a new session if needed.`)
} catch (error) {
  console.error(`agent-lead setup: ${error.message}`)
  process.exitCode = 1
}
