#!/usr/bin/env node
// A shared lock for things two workers must not use at the same time: one reference-browser tab, the system
// clipboard, a dev database, a device. Put the take/release steps in every brief that touches the resource.
//   node <tools>/lock.mjs take <name> <holder> [--wait <seconds>] [--stale <minutes>]
//   node <tools>/lock.mjs release <name> <holder>
//   node <tools>/lock.mjs status [<name>]
// take waits until the lock is free (default 600 s) and treats a lock older than --stale (default 15 min) as
// abandoned. Exits 0 when taken or released, 1 when it gave up. Locks live in "locks" from the config (default /tmp)
// as agent-lead-<name>.lock, so every worktree of the project sees the same lock.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, options } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const waitS = Number(o.opt('--wait', 600))
const staleMin = Number(o.opt('--stale', 15))
const [cmd, name, holder] = args
const file = (n) => path.join(config.locks, `agent-lead-${n}.lock`)
const info = (f) => {
  const ageMin = (Date.now() - statSync(f).mtimeMs) / 60000
  return { holder: readFileSync(f, 'utf8').trim(), ageMin }
}

if (cmd === 'status') {
  const names = name ? [name] : readdirSync(config.locks).filter((f) => /^agent-lead-.*\.lock$/.test(f)).map((f) => f.slice(11, -5))
  if (!names.length) console.log('no locks')
  for (const n of names) {
    if (!existsSync(file(n))) console.log(`${n}: free`)
    else {
      const i = info(file(n))
      console.log(`${n}: held by ${i.holder} for ${i.ageMin.toFixed(1)} min${i.ageMin > staleMin ? ' (stale)' : ''}`)
    }
  }
  process.exit(0)
}
if (!['take', 'release'].includes(cmd) || !name || !holder) {
  console.error('usage: lock.mjs take|release <name> <holder> [--wait s] [--stale min]   |   lock.mjs status [name]')
  process.exit(2)
}
const f = file(name)
if (cmd === 'release') {
  if (existsSync(f) && info(f).holder.split(' ')[0] !== holder) {
    console.log(`not released: ${name} is held by ${info(f).holder}`)
    process.exit(1)
  }
  rmSync(f, { force: true })
  console.log(`released ${name}`)
  process.exit(0)
}
const until = Date.now() + waitS * 1000
for (;;) {
  if (existsSync(f)) {
    const i = info(f)
    if (i.holder.split(' ')[0] === holder) break
    if (i.ageMin > staleMin) console.log(`taking over a stale lock from ${i.holder}`)
    else if (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 5000))
      continue
    } else {
      console.log(`gave up: ${name} is held by ${i.holder} (${i.ageMin.toFixed(1)} min)`)
      process.exit(1)
    }
  }
  try {
    writeFileSync(f, `${holder} ${new Date().toISOString()}\n`, { flag: existsSync(f) ? 'w' : 'wx' })
    break
  } catch {
    // Another holder created it between the check and the write: wait and look again.
  }
}
console.log(`took ${name} as ${holder}`)
