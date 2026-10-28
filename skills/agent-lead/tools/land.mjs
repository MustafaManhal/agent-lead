#!/usr/bin/env node
// Merge a worker's branch into the current (lead) branch. On a clean merge, run the checks. On conflicts, print each
// conflict compactly (file, line, ours vs theirs, trimmed) so they can be resolved in one pass.
//   node <tools>/land.mjs <branch>            run in the lead checkout
//   node <tools>/land.mjs <branch> --abort
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { git, root, run, toolsDir } from './lib.mjs'

const [branch, flag] = process.argv.slice(2)
if (!branch) {
  console.error('usage: land.mjs <branch> [--abort]')
  process.exit(2)
}
if (flag === '--abort') {
  git('merge', '--abort')
  console.log('merge aborted')
  process.exit(0)
}

const dirty = git('status', '--porcelain', '--untracked-files=no').out.trim()
if (dirty) {
  console.log('This checkout has uncommitted changes; commit or set them aside first:\n' + dirty)
  process.exit(1)
}
const ahead = git('log', '--oneline', `HEAD..${branch}`).out.trim()
console.log(`${branch}: ${ahead ? ahead.split('\n').length : 0} new commit(s)${ahead ? '\n' + ahead : ''}`)
const merge = git('merge', '--no-edit', branch)
const conflicted = git('diff', '--name-only', '--diff-filter=U').out.trim().split('\n').filter(Boolean)
if (!conflicted.length) {
  console.log(merge.status === 0 ? 'merged cleanly' : merge.out.trim())
  if (merge.status !== 0) process.exit(1)
  const check = run('node', [path.join(toolsDir, 'check.mjs')])
  process.stdout.write(check.out)
  process.exit(check.status)
}

const clip = (s) => {
  const lines = s.replace(/\n$/, '').split('\n').map((l) => (l.length > 160 ? l.slice(0, 157) + '…' : l))
  return lines.length > 14 ? [...lines.slice(0, 6), `… ${lines.length - 12} more lines …`, ...lines.slice(-6)] : lines
}
for (const file of conflicted) {
  const text = readFileSync(path.join(root, file), 'utf8')
  const hunks = [...text.matchAll(/^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm)]
  console.log(`\n=== ${file}: ${hunks.length} conflict(s)`)
  for (const h of hunks) {
    const line = text.slice(0, h.index).split('\n').length
    const show = (s) => clip(s).map((l) => '    ' + l).join('\n')
    console.log(`--- line ${line}\n  OURS:\n${show(h[1])}\n  THEIRS:\n${show(h[2])}`)
  }
}
console.log(`\nResolve (keep both sides where both are needed), then: git add -A && git commit --no-edit && node ${path.join(toolsDir, 'check.mjs')}`)
console.log(`Or undo the merge: node ${path.join(toolsDir, 'land.mjs')} ${branch} --abort`)
process.exit(2)
