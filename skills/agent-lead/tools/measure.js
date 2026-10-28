// Browser snippet: measure an app's UI around a visible label, and list its controls as text. Load it into the page
// (observe.mjs does this for its measure: step), then call:
//   measureUI('Vertical trim')                 -> compact tree of the panel/popover holding that label
//   measureUI('Place all', { depth: 4 })       -> smaller tree
//   measureUI('Fonts', { minHeight: 300 })     -> climb until the container is at least 300px tall
// Each line: tag, x,y relative to the container, w x h, background, radius, padding, font size/weight, color,
// border, shadow (short), text, aria-label/tooltip. Read-only.
window.measureUI = function (label, { depth = 7, minHeight = 0, minWidth = 0, max = 160 } = {}) {
  const leaf = [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === label && e.getBoundingClientRect().width > 0)
  if (!leaf) return `no visible element with text "${label}"`
  let box = leaf
  while (box.parentElement && (box.getBoundingClientRect().height < minHeight || box.getBoundingClientRect().width < minWidth || (!minHeight && !minWidth && box.childElementCount < 2))) box = box.parentElement
  const origin = box.getBoundingClientRect()
  const out = [`container ${Math.round(origin.x)},${Math.round(origin.y)} ${Math.round(origin.width)}x${Math.round(origin.height)} (viewport ${innerWidth}x${innerHeight}, dpr ${devicePixelRatio})`]
  const short = (v) => (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' ? v : '')
  const walk = (e, d) => {
    if (out.length > max) return
    const r = e.getBoundingClientRect()
    if (!r.width && !r.height) return
    const cs = getComputedStyle(e)
    const own = e.childElementCount === 0 ? e.textContent.trim().slice(0, 30) : ''
    const parts = [
      e.tagName.toLowerCase(),
      `${Math.round(r.x - origin.x)},${Math.round(r.y - origin.y)}`,
      `${Math.round(r.width)}x${Math.round(r.height)}`,
      short(cs.backgroundColor) && `bg=${cs.backgroundColor}`,
      short(cs.borderRadius) && `r=${cs.borderRadius}`,
      short(cs.padding) && cs.padding !== '0px' && `pad=${cs.padding}`,
      own && `font=${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight} ${cs.color}`,
      short(cs.borderTopWidth) && cs.borderTopStyle !== 'none' && `border=${cs.borderTopWidth} ${cs.borderTopColor}`,
      short(cs.boxShadow) && `shadow=${cs.boxShadow.slice(0, 50)}`,
      own && JSON.stringify(own),
      e.getAttribute('aria-label') && `[${e.getAttribute('aria-label')}]`,
      e.getAttribute('data-tooltip') && `{${e.getAttribute('data-tooltip')}}`,
    ].filter(Boolean)
    out.push('  '.repeat(d) + parts.join(' '))
    if (d < depth) for (const c of e.children) walk(c, d + 1)
  }
  walk(box, 0)
  return out.join('\n')
}

// Token saver: the clickable UI as text instead of a screenshot. Each line: label, role/tag, center x,y (CSS px,
// times `scale` to match the screenshot frame: scale = screenshotWidth / innerWidth), size, state.
//   uiMap()                      -> every visible button / input / menu item / tab
//   uiMap('Typography')          -> only inside the container holding that label
//   uiMap(null, { scale: 0.84, text: 'Bold|Italic' })
window.uiMap = function (within = null, { scale = 1, text = null, max = 120 } = {}) {
  let root = document.body
  if (within) {
    const leaf = [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === within)
    if (!leaf) return `no element with text "${within}"`
    root = leaf
    while (root.parentElement && root.querySelectorAll('button, input, select, [role]').length < 3) root = root.parentElement
  }
  const re = text ? new RegExp(text, 'i') : null
  const els = [...root.querySelectorAll('button, input, select, textarea, a[href], [role=button], [role=menuitem], [role=tab], [role=radio], [role=checkbox], [role=option], [role=combobox]')]
  const out = []
  for (const e of els) {
    const r = e.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue
    const label = (e.getAttribute('aria-label') || e.title || e.placeholder || e.value || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    if (re && !re.test(label)) continue
    const state = [e.getAttribute('aria-pressed') === 'true' && 'pressed', e.getAttribute('aria-checked') === 'true' && 'checked', e.getAttribute('aria-selected') === 'true' && 'selected', e.disabled && 'disabled', /\bactive\b/.test(e.className) && 'active'].filter(Boolean).join(',')
    out.push(`${JSON.stringify(label || '(no label)')} ${e.getAttribute('role') || e.tagName.toLowerCase()} @${Math.round((r.x + r.width / 2) * scale)},${Math.round((r.y + r.height / 2) * scale)} ${Math.round(r.width)}x${Math.round(r.height)}${state ? ' ' + state : ''}`)
    if (out.length >= max) break
  }
  return out.join('\n')
}
