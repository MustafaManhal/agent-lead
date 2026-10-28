#!/usr/bin/env node
// Finish an item in one step: run the checks, mark the item in the plan, rebuild the checklist page, and commit,
// crediting the worker. Stops without committing when a check fails.
//   node <tools>/ship.mjs "<plan item text>" "<commit subject>" [--status x|~] [--note "…"] [--log "…"]
//                         [--coauthor "Name <email>"]... [--body "paragraph"]
//   node <tools>/ship.mjs --no-plan "<commit subject>" [...]          commit only, after the checks
// Co-author trailers: every --coauthor, then $AGENT_LEAD_COAUTHOR (lines), then $AGENT_LEAD_ATTRIBUTION (the lead's
// own attribution line, for example "Co-Authored-By: Claude <noreply@anthropic.com>").
// Stages config.commitPaths (default: everything). Run it in the checkout that holds the work.
import path from 'node:path'
import { config, git, options, run, toolsDir } from './lib.mjs'

const args = process.argv.slice(2)
const o = options(args)
const noPlan = o.flag('--no-plan')
const coauthors = o.all('--coauthor')
const body = o.opt('--body')
const pass = ['--status', '--note', '--log'].flatMap((name) => {
  const v = o.opt(name)
  return v === undefined ? [] : [name, v]
})
const [item, subject] = noPlan ? [null, args[0]] : args
if (!subject) {
  console.error('usage: ship.mjs "<plan item text>" "<commit subject>" [--status x] [--note …] [--log …] [--coauthor "Name <email>"]')
  process.exit(2)
}

const check = run('node', [path.join(toolsDir, 'check.mjs')])
process.stdout.write(check.out)
if (check.status !== 0) {
  console.log('Not shipped: fix the checks first.')
  process.exit(1)
}
if (!noPlan) {
  const done = run('node', [path.join(toolsDir, 'done.mjs'), item, ...pass])
  process.stdout.write(done.out)
  if (done.status !== 0) {
    console.log('Not shipped: plan item not found.')
    process.exit(1)
  }
}

// The checklist page is a build output: it is committed only when the project already tracks it.
const pageTracked = git('ls-files', '--error-unmatch', config.page.out).status === 0
git('add', '-A', '--', ...config.commitPaths)
if (!pageTracked) git('reset', '-q', '--', config.page.out)
const trailers = [
  ...coauthors.map((c) => `Co-Authored-By: ${c}`),
  ...(process.env.AGENT_LEAD_COAUTHOR ?? '').split('\n').filter(Boolean).map((c) => (/^[\w-]+:/.test(c) ? c : `Co-Authored-By: ${c}`)),
  ...(process.env.AGENT_LEAD_ATTRIBUTION ?? '').split('\n').filter(Boolean),
]
const message = [subject, body, trailers.length ? [...new Set(trailers)].join('\n') : null].filter(Boolean).join('\n\n')
const commit = git('commit', '-q', '-m', message)
if (commit.status !== 0) {
  console.log(commit.out.trim() || 'nothing to commit')
  process.exit(1)
}
console.log(git('log', '--oneline', '-1').out.trim())
if (!noPlan) console.log('Republish the checklist page (checklist-page.md) and tell the user what changed.')
