/** Pure scan matching and candidate-selection helpers. */
import { createHash } from 'node:crypto'
export const norm = (name = '') => name.toLowerCase().replace(/#?[0-9a-f]{6}\b/g, '#hex').replace(/\d+([.,:]\d+)*/g, '#').replace(/\s+/g, ' ').trim()
export const ck = (c) => `${c.role}|${norm(c.name)}`
export const bk = (c) => `[${c.role}]${norm(c.name)}`

export function keysOf(snap) {
  const controlKeys = snap.controls.filter((c) => !['textbox', 'searchbox', 'spinbutton', 'slider'].includes(c.role))
    .flatMap((c) => {
      const base = ck(c)
      const state = ['expanded', 'selected', 'checked', 'pressed', 'current', 'disabled']
        .filter((k) => c.state?.[k] && c.state[k] !== 'false')
        .map((k) => `${base}|@${k}:${c.state[k]}`)
      return [base, ...state]
    })
  return new Set([
    ...controlKeys,
    ...snap.containers.filter((c) => c.role !== 'tooltip').map(bk),
  ])
}

export function sameAs(snap, state) {
  if (fingerprint(snap) === state.fp) return true
  if (new URL(snap.url).pathname !== new URL(state.url).pathname) return false
  const a = keysOf(snap)
  const b = keysOf(state.snap)
  const both = [...b].filter((k) => a.has(k)).length
  const jaccard = both / (a.size + b.size - both || 1)
  if (!state.ownKeys?.length) return jaccard >= 0.8
  const own = state.ownKeys.filter((k) => a.has(k)).length / state.ownKeys.length
  return own >= 0.8 && jaccard >= 0.7
}

export function fingerprint(snap) {
  return createHash('sha1').update(new URL(snap.url).pathname + '\n' + [...keysOf(snap)].sort().join('\n')).digest('hex').slice(0, 10)
}

/** Select and prioritize safe controls. `seenSearches` is shared across a run. */
export function candidates(snap, parentKeys, {
  per, mode, skip, runSkip, action, allowRe, typeText, searched,
}) {
  const out = []
  for (const c of snap.controls) {
    if (!c.name && c.role !== 'combobox') continue
    if (skip.test(c.name) || runSkip?.test(c.name) || c.state?.disabled) continue
    if (typeText && ['searchbox', 'textbox', 'combobox'].includes(c.role) && (c.role === 'searchbox' || /search|find|filter/i.test(c.name))) {
      if (searched.has(c.name) || c.state?.value) continue
      searched.add(c.name)
      out.push({ role: c.role, name: c.name, x: Math.round(c.x + c.w / 2), y: Math.round(c.y + c.h / 2), kind: 'search', text: typeText })
      continue
    }
    const popup = c.state?.haspopup || c.state?.expanded
    const base = { role: c.role, name: c.name, x: Math.round(c.x + c.w / 2), y: Math.round(c.y + c.h / 2), popup: !!popup }
    if (['menuitem', 'menuitemcheckbox', 'menuitemradio'].includes(c.role)) { if (popup || mode !== 'safe') out.push({ ...base, kind: 'hover' }) }
    else if (c.role === 'tab' && !c.state?.selected) out.push({ ...base, kind: 'click' })
    else if (c.role === 'combobox' || popup) out.push({ ...base, kind: 'click' })
    else if (c.role === 'link' && c.state?.href?.startsWith('/') && c.state.href !== new URL(snap.url).pathname) out.push({ ...base, kind: 'click' })
    else if (mode === 'full' && ['button', 'treeitem'].includes(c.role) && (!action.test(c.name) || allowRe?.test(c.name)) && !c.state?.pressed && !c.state?.checked) out.push({ ...base, kind: 'click' })
    else if (mode === 'wide' && ['button', 'clickable', 'treeitem'].includes(c.role)) out.push({ ...base, kind: 'click' })
  }
  // Prioritize controls newly revealed by this state, then apply the cap.
  return out.sort((a, b) => Number(parentKeys.has(ck(a))) - Number(parentKeys.has(ck(b)))).slice(0, per)
}
