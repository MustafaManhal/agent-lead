import test from 'node:test'
import assert from 'node:assert/strict'
import { norm, ck, keysOf, sameAs, candidates } from '../../skills/agent-lead/tools/scan-core.mjs'

const snap = (controls, pathname = '/') => ({ url: `http://fixture.test${pathname}`, controls, containers: [] })
const control = (role, name, extra = {}) => ({ role, name, x: 0, y: 0, w: 20, h: 20, ...extra })
const policy = (overrides = {}) => ({
  per: 20, mode: 'full', skip: /delete|remove/i, runSkip: null,
  action: /\b(add|create)\b/i, allowRe: null, typeText: 'a', searched: new Set(), ...overrides,
})

test('normalization makes volatile labels compare while keeping role identity', () => {
  assert.equal(norm(' Zoom 100%  #a1b2c3 '), 'zoom #% #hex')
  assert.equal(ck(control('button', 'Zoom 100%')), ck(control('button', 'Zoom 80%')))
  assert.notEqual(ck(control('button', 'Open')), ck(control('tab', 'Open')))
})

test('sameAs matches volatile labels and rejects another path', () => {
  const initial = snap([control('heading', 'Canvas 100%'), control('button', 'Help')])
  const state = { url: initial.url, snap: initial, fp: 'does-not-match', ownKeys: null }
  const reloaded = snap([control('heading', 'Canvas 83%'), control('button', 'Help')])
  assert.equal(sameAs(reloaded, state), true)
  assert.equal(sameAs(snap(reloaded.controls, '/second'), state), false)
  const tabState = { ...state, fp: 'tab-fp', snap: snap([...initial.controls, control('tab', 'Activity', { state: { selected: 'true' } })]), ownKeys: [] }
  assert.equal(sameAs(tabState.snap, state), false, 'a tab with a different selected item is a different screen')
  assert.equal(keysOf(reloaded).size, 2)
})

test('candidate rules skip destructive/disabled controls and prioritize controls added by state before cap', () => {
  const controls = [
    control('button', 'Existing'), control('button', 'Delete project'),
    control('button', 'Disabled', { state: { disabled: 'true' } }),
    control('button', 'Added one'), control('tab', 'Tab', { state: { selected: 'true' } }),
    control('menuitem', 'More'), control('link', 'Other', { state: { href: '/second' } }),
    control('button', 'Create new'),
  ]
  const out = candidates(snap(controls), new Set([ck(controls[0])]), policy({ per: 3, allowRe: /Create/ }))
  assert.deepEqual(out.map((c) => c.name), ['Added one', 'More', 'Other'])
  assert.equal(out.some((c) => /Delete|Disabled|Tab/.test(c.name)), false)
  assert.equal(out.some((c) => c.kind === 'click' && c.name === 'Create new'), false) // the cap applies after prioritization
  const search = candidates(snap([control('searchbox', 'Search')]), new Set(), policy())[0]
  assert.equal(search.text, 'a')
})

test('safe mode only opens declared popups, while wide mode still respects destructive names', () => {
  const controls = [control('button', 'Ordinary'), control('button', 'Menu', { state: { haspopup: 'menu' } }), control('button', 'Delete')]
  assert.deepEqual(candidates(snap(controls), new Set(), policy({ mode: 'safe', typeText: '' })).map((c) => c.name), ['Menu'])
  assert.deepEqual(candidates(snap(controls), new Set(), policy({ mode: 'wide', typeText: '' })).map((c) => c.name), ['Ordinary', 'Menu'])
})
