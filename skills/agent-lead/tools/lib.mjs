// Shared by the agent-lead tools: the project root, its settings, running commands, and loading a package (such as
// Playwright) from the project rather than from the plugin's folder.
//
// Settings live in <project>/.agent-lead/config.json (all optional; see config.example.json). Anything missing is
// detected from the project: package.json scripts, tsconfig.json, pyproject.toml, Cargo.toml, go.mod.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const toolsDir = path.dirname(fileURLToPath(import.meta.url))
export const skillDir = path.dirname(toolsDir)

/** The git top level of the current directory (or the directory itself outside git). */
export function projectRoot(cwd = process.cwd()) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : cwd
}

export const root = projectRoot()

/** Run a command in the project root and return { status, out } (stdout and stderr together). */
export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' }
}

/** Run a shell command line in the project root. */
export const sh = (line, opts = {}) => run('sh', ['-c', line], opts)

export const git = (...args) => run('git', args)

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The checks to run before every commit, detected from the project when the config names none. */
function detectChecks() {
  const pkg = readJson(path.join(root, 'package.json'))
  const scripts = pkg?.scripts ?? {}
  const npm = existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm run -s'
  const checks = []
  if (pkg) {
    if (scripts.typecheck) checks.push({ name: 'types', run: `${npm} typecheck` })
    else if (existsSync(path.join(root, 'tsconfig.json'))) checks.push({ name: 'types', run: 'npx tsc --noEmit -p .' })
    if (scripts.lint) checks.push({ name: 'lint', run: `${npm} lint` })
    if (scripts.test && !/no test specified/.test(scripts.test)) checks.push({ name: 'tests', run: `${npm} test` })
  }
  if (existsSync(path.join(root, 'pyproject.toml')) || existsSync(path.join(root, 'pytest.ini'))) checks.push({ name: 'tests', run: 'python3 -m pytest -q' })
  if (existsSync(path.join(root, 'Cargo.toml'))) checks.push({ name: 'tests', run: 'cargo test --quiet' })
  if (existsSync(path.join(root, 'go.mod'))) checks.push({ name: 'tests', run: 'go vet ./... && go test ./...' })
  return checks
}

/** The plan file: the config's, else the first of the usual places that exists. */
function detectPlan() {
  const candidates = [
    'docs/06-implementation-plan.md',
    '.agent-lead/plan.md',
    'docs/plan.md',
    '.ai/plan.md',
    'PLAN.md',
    'plan.md',
    'ROADMAP.md',
    'TODO.md',
  ]
  return candidates.find((p) => existsSync(path.join(root, p))) ?? null
}

const raw = readJson(path.join(root, '.agent-lead', 'config.json')) ?? {}
const plan = raw.plan ?? detectPlan()

/** The project's settings, with defaults filled in. Paths are relative to the project root. */
export const config = {
  plan,
  checks: raw.checks ?? detectChecks(),
  page: {
    out: '.agent-lead/checklist.html',
    title: null,
    lede: null,
    sections: null,
    ...(raw.page ?? {}),
  },
  // What `ship` stages: ["."] (everything) unless the project limits it.
  commitPaths: raw.commitPaths ?? ['.'],
  progressLog: raw.progressLog ?? null,
  notes: raw.notes ?? ['docs', 'research', '.agent-lead/research', '.ai/research'],
  sources: raw.sources ?? ['src', 'app', 'lib', 'packages'],
  sourceExts: raw.sourceExts ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.swift', '.kt', '.vue', '.svelte'],
  devUrl: raw.devUrl ?? null,
  reference: raw.reference ?? null,
  locks: raw.locks ?? '/tmp',
}

export const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p))

/** Import a package the way the project would (its node_modules), e.g. load('playwright'). */
export async function load(name) {
  for (const base of [root, toolsDir]) {
    try {
      const resolved = createRequire(path.join(base, 'package.json')).resolve(name)
      const mod = await import(pathToFileURL(resolved).href)
      // A CommonJS package (Playwright is one) arrives with its exports on `default`.
      return mod.default && typeof mod.default === 'object' ? { ...mod.default, ...mod } : mod
    } catch {}
  }
  console.error(`${name} is not installed in this project. Install it there (for example: npm i -D ${name}).`)
  process.exit(2)
}

/** Read --name value flags out of an argument list (mutates it). */
export function options(args) {
  return {
    flag(name) {
      const i = args.indexOf(name)
      if (i < 0) return false
      args.splice(i, 1)
      return true
    },
    opt(name, fallback = undefined) {
      const i = args.indexOf(name)
      if (i < 0) return fallback
      const v = args[i + 1]
      args.splice(i, 2)
      return v
    },
    all(name) {
      const out = []
      for (let i = args.indexOf(name); i >= 0; i = args.indexOf(name)) out.push(args.splice(i, 2)[1])
      return out
    },
  }
}

/** Rebuild the checklist page from the plan; returns the generator's JSON summary, or null without a plan. */
export function buildPage() {
  if (!config.plan) return null
  const args = [path.join(skillDir, 'plan-page.mjs'), abs(config.plan), abs(config.page.out)]
  if (config.page.title) args.push('--title', config.page.title)
  if (config.page.lede) args.push('--lede', config.page.lede)
  if (config.page.sections) args.push('--sections', config.page.sections)
  const r = run('node', args)
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    console.error(r.out.trim())
    return null
  }
}
