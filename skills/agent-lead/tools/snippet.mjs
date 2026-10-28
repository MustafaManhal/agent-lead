#!/usr/bin/env node
// Token saver for experiments in a Vitest project: run a TypeScript snippet against the source (through Vitest, so
// imports, path aliases and the TS setup work) and print only what it logs or returns. No test file to write, no
// runner noise.
//   node <tools>/snippet.mjs '<code>'      e.g. 'const { slugify } = await import("../src/text"); return slugify("A b")'
//   node <tools>/snippet.mjs --file snippet.ts [--dir tests]
// Imports are relative to --dir (default: tests/ when it exists, else the project root). The temporary test file is
// removed afterwards.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { options, root, run } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const file = o.opt('--file')
const dir = o.opt('--dir') ?? (existsSync(path.join(root, 'tests')) ? 'tests' : '.')
const code = file ? readFileSync(file, 'utf8') : args.join(' ')
if (!code) {
  console.error("usage: snippet.mjs '<code>' | --file f.ts [--dir tests]")
  process.exit(2)
}
const test = path.join(root, dir, `zz-snippet-${process.pid}.test.ts`)
writeFileSync(
  test,
  `import { it } from 'vitest'
it('snippet', async () => {
  const __log = (...a: unknown[]) => process.stdout.write('»' + a.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ') + '\\n')
  const console = { log: __log, info: __log, warn: __log, error: __log }
  const __r = await (async () => { ${code}\n })()
  if (__r !== undefined) __log('=', __r)
  void console
}, 60000)
`,
)
try {
  const r = run('npx', ['vitest', 'run', test, '--silent=false', '--reporter=dot'])
  const out = r.out.split('\n')
  console.log(out.filter((l) => l.startsWith('»')).map((l) => l.slice(1)).join('\n') || '(no output)')
  if (r.status !== 0) {
    const err = out.findIndex((l) => /Error|FAIL/.test(l))
    console.log(out.slice(Math.max(0, err), err + 12).join('\n'))
  }
} finally {
  rmSync(test, { force: true })
}
