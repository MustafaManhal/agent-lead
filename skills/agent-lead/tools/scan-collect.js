// In-page collector for scan.mjs. Defines window.__scanCollect(), which returns what a person can see right now:
// named controls (role, name, box, state), containers (menus, dialogs, panels), big regions, visible text and a
// compact style sample. No page state is changed.
// Short texts in floating (absolute/fixed) elements near a box: compared before and after a hover, the new ones are
// the tooltip even when the app does not mark it as one.
window.__scanNear = (box) => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 3) continue
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim()
    if (!t || t.length > 80) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.left > box.x + box.w + 200 || r.right < box.x - 200 || r.top > box.y + box.h + 90 || r.bottom < box.y - 90) continue
    let p = el
    let floating = false
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'absolute' || pos === 'fixed') { floating = true; break } }
    if (floating) out.push(t)
  }
  return out
}
// Resolves once the page has not changed for `quiet` ms (or after `max` ms): waits only as long as the app needs.
window.__scanQuiet = (quiet = 120, max = 450) => new Promise((resolve) => {
  const start = performance.now()
  let last = start
  const mo = new MutationObserver(() => { last = performance.now() })
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  const tick = () => {
    const now = performance.now()
    if (now - last >= quiet || now - start >= max) { mo.disconnect(); resolve(Math.round(now - start)) } else setTimeout(tick, 30)
  }
  setTimeout(tick, 30)
})
window.__scanTooltip = (box) => {
  const out = []
  for (const el of document.querySelectorAll('[role="tooltip"], [class*="tooltip" i], [data-tooltip-content]')) {
    const r = el.getBoundingClientRect()
    // Only a tooltip next to the hovered control (a stale one elsewhere is not its tooltip).
    if (box && (r.left > box.x + box.w + 160 || r.right < box.x - 160 || r.top > box.y + box.h + 80 || r.bottom < box.y - 80)) continue
    const cs = getComputedStyle(el)
    if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (t && !out.some((x) => x.includes(t))) { for (let i = out.length - 1; i >= 0; i--) if (t.includes(out[i])) out.splice(i, 1); out.push(t) }
  }
  return out.join(' | ').slice(0, 160)
}
// The look of the control under the pointer (to record hover styles).
window.__scanLookAt = (x, y) => {
  let el = document.elementFromPoint(x, y)
  while (el && el.parentElement && !(el.getAttribute('role') || /^(BUTTON|A|INPUT|SELECT|SUMMARY)$/.test(el.tagName))) el = el.parentElement
  if (!el) return null
  const cs = getComputedStyle(el)
  return { color: cs.color, bg: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow, cursor: cs.cursor }
}
window.__scanCollect = (opts = {}) => {
  const W = innerWidth
  const H = innerHeight
  const INTERACTIVE = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'option', 'treeitem'])
  const CONTAINERS = new Set(['dialog', 'alertdialog', 'menu', 'menubar', 'listbox', 'tooltip', 'tablist', 'toolbar', 'navigation', 'banner', 'main', 'complementary', 'contentinfo', 'region', 'tree', 'grid', 'form', 'search'])
  const r1 = (n) => Math.round(n)
  const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const implicit = (el) => {
    const t = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') || '').toLowerCase()
    if (t === 'button' || t === 'summary' || (t === 'input' && ['button', 'submit', 'reset'].includes(type))) return 'button'
    if (t === 'a' && el.hasAttribute('href')) return 'link'
    if (t === 'input') return { checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox', hidden: null }[type] ?? 'textbox'
    if (t === 'select') return 'combobox'
    if (t === 'textarea') return 'textbox'
    if (/^h[1-6]$/.test(t)) return 'heading'
    if (t === 'dialog') return 'dialog'
    if (t === 'nav') return 'navigation'
    if (t === 'main') return 'main'
    if (t === 'aside') return 'complementary'
    if (t === 'header' && !el.closest('article,section,main,aside,nav')) return 'banner'
    if (el.isContentEditable && el.parentElement && !el.parentElement.isContentEditable) return 'textbox'
    return null
  }
  const roleOf = (el) => (el.getAttribute('role') || '').split(/\s+/)[0] || implicit(el)
  const byIds = (ids) => clean(ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '))
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label')
    if (label) return clean(label)
    const lb = el.getAttribute('aria-labelledby')
    if (lb) { const t = byIds(lb); if (t) return t }
    if (el.labels?.length) { const t = clean(el.labels[0].textContent); if (t) return t }
    const text = clean(el.innerText ?? el.textContent)
    if (text && !['textbox', 'searchbox', 'combobox'].includes(roleOf(el))) return text.slice(0, 80)
    return clean(el.getAttribute('title') || el.getAttribute('placeholder') || el.querySelector?.('img[alt]')?.alt || el.querySelector?.('svg title')?.textContent || el.getAttribute('data-tooltip') || '').slice(0, 80)
  }
  const boxOf = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= H || r.left >= W) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null
    return r
  }
  const onTop = (el, r) => {
    const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(H - 1, Math.max(0, r.top + r.height / 2))
    const top = document.elementFromPoint(x, y)
    return !top || top === el || el.contains(top) || top.contains(el)
  }
  const stateOf = (el) => {
    const s = {}
    for (const a of ['expanded', 'pressed', 'checked', 'selected', 'disabled', 'haspopup', 'current']) {
      const v = el.getAttribute('aria-' + a)
      if (v != null && v !== 'false') s[a] = v
    }
    if (el.disabled) s.disabled = 'true'
    if ('value' in el && typeof el.value === 'string' && el.value && el.type !== 'password') s.value = el.value.slice(0, 40)
    if (el.type === 'password') s.value = '(password)'
    if (el.tagName === 'A') { try { const u = new URL(el.href, location.href); s.href = u.origin === location.origin ? u.pathname + u.search : u.origin } catch {} }
    return s
  }

  const controls = []
  const containers = []
  const headings = []
  const seen = new Set()
  const all = document.querySelectorAll('body *')
  for (const el of all) {
    const role = roleOf(el)
    const pointer = !role && opts.pointer && getComputedStyle(el).cursor === 'pointer' && !el.parentElement?.closest('[role],button,a,input,select,textarea') && !el.querySelector('[role],button,a,input,select,textarea')
    if (!role && !pointer) continue
    const r = boxOf(el)
    if (!r) continue
    const item = { role: role || 'clickable', name: nameOf(el), x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height) }
    if (CONTAINERS.has(role)) {
      // A container's name is its label (or its first heading), never all the text inside it.
      const lb = el.getAttribute('aria-labelledby')
      item.name = clean(el.getAttribute('aria-label') || (lb ? byIds(lb) : '') || el.querySelector('h1,h2,h3,[role=heading]')?.textContent || '').slice(0, 80)
      containers.push(item)
      continue
    }
    if (role === 'heading') { if (item.name) headings.push(item); continue }
    if (!INTERACTIVE.has(role) && !pointer) continue
    if (!onTop(el, r)) continue
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) continue
    const st = stateOf(el)
    if (Object.keys(st).length) item.state = st
    // Exact look of the control, so nobody needs to measure it again (skipped in a quick "did it change" check).
    if (opts.lite) { const key = `${item.role}|${item.name}|${item.x}|${item.y}`; if (!seen.has(key)) { seen.add(key); controls.push(item) } continue }
    const cs = getComputedStyle(el)
    const look = {
      font: `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      color: cs.color,
      bg: /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) ? undefined : cs.backgroundColor,
      border: cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none' ? `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}` : undefined,
      radius: cs.borderTopLeftRadius !== '0px' ? cs.borderTopLeftRadius : undefined,
      padding: cs.padding !== '0px' ? cs.padding : undefined,
      shadow: cs.boxShadow !== 'none' ? cs.boxShadow : undefined,
      icon: el.querySelector('svg, img') ? true : undefined,
      motion: cs.transitionDuration !== '0s' ? `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}` : cs.animationName !== 'none' ? `animation ${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : undefined,
    }
    for (const k of Object.keys(look)) if (look[k] === undefined) delete look[k]
    item.look = look
    const key = `${item.role}|${item.name}|${item.x}|${item.y}`
    if (seen.has(key)) continue
    seen.add(key)
    controls.push(item)
  }

  if (opts.lite) return { url: location.href, title: document.title, viewport: [W, H], controls, containers, headings: [], regions: [], styles: {}, texts: [], scrollables: [], lite: true }
  // Big visible blocks with their own background or border: panels, bars, sidebars.
  const regions = []
  const minArea = W * H * 0.02
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width * r.height < minArea || r.width < 40 || r.height < 24) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const painted = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || (cs.borderLeftWidth !== '0px' && cs.borderLeftStyle !== 'none') || cs.boxShadow !== 'none'
    const role = roleOf(el)
    if (!painted && !CONTAINERS.has(role)) continue
    const box = { x: r1(Math.max(0, r.left)), y: r1(Math.max(0, r.top)), w: r1(Math.min(W, r.right) - Math.max(0, r.left)), h: r1(Math.min(H, r.bottom) - Math.max(0, r.top)) }
    if (box.w < 40 || box.h < 24 || (box.w >= W - 2 && box.h >= H - 2)) continue
    if (regions.some((g) => Math.abs(g.x - box.x) < 4 && Math.abs(g.y - box.y) < 4 && Math.abs(g.w - box.w) < 8 && Math.abs(g.h - box.h) < 8)) continue
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const pos = box.h > H * 0.6 ? (cx < W / 3 ? 'left' : cx > (2 * W) / 3 ? 'right' : 'center') + '-panel' : box.w > W * 0.6 ? (cy < H / 3 ? 'top' : cy > (2 * H) / 3 ? 'bottom' : 'middle') + '-bar' : `${cy < H / 2 ? 'top' : 'bottom'}-${cx < W / 2 ? 'left' : 'right'}-block`
    regions.push({ name: clean(el.getAttribute('aria-label')) || (CONTAINERS.has(role) ? role : '') || pos, pos, ...box, area: box.w * box.h })
  }
  regions.sort((a, b) => b.area - a.area)

  // Style sample: every visible control and text leaf, counted by value.
  const styles = { text: {}, color: {}, background: {}, border: {}, radius: {}, shadow: {}, padding: {}, gap: {}, motion: {} }
  const bump = (k, v) => { if (v) styles[k][v] = (styles[k][v] ?? 0) + 1 }
  const texts = []
  let n = 0
  for (const el of all) {
    if (n > 3000) break
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    const role = roleOf(el)
    if (!own && !INTERACTIVE.has(role)) continue
    const r = boxOf(el)
    if (!r) continue
    n++
    const cs = getComputedStyle(el)
    if (own) {
      bump('text', `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}${cs.letterSpacing !== 'normal' ? ' ls ' + cs.letterSpacing : ''}`)
      bump('color', cs.color)
      const t = clean([...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' '))
      if (t && t.length < 120) texts.push(t)
    }
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) bump('background', cs.backgroundColor)
    if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') bump('border', `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`)
    if (cs.borderTopLeftRadius !== '0px') bump('radius', cs.borderTopLeftRadius)
    if (cs.boxShadow !== 'none') bump('shadow', cs.boxShadow)
    if (cs.padding !== '0px') bump('padding', cs.padding)
    if (cs.display.includes('flex') || cs.display.includes('grid')) bump('gap', cs.gap !== 'normal' ? cs.gap : '')
    if (cs.transitionDuration !== '0s') bump('motion', `${cs.transitionDuration} ${cs.transitionTimingFunction}`)
    if (cs.animationName !== 'none') bump('motion', `animation ${cs.animationDuration} ${cs.animationTimingFunction}`)
  }
  // Panels whose content goes on below the visible area (layer lists, long menus, settings pages).
  const scrollables = []
  for (const el of all) {
    if (scrollables.length >= 8) break
    if (el.scrollHeight <= el.clientHeight + 16 || el.clientHeight < 80 || el.clientWidth < 100) continue
    const oy = getComputedStyle(el).overflowY
    if (oy !== 'auto' && oy !== 'scroll') continue
    const r = boxOf(el)
    if (!r) continue
    el.setAttribute('data-scan-scroll', String(scrollables.length))
    scrollables.push({ i: scrollables.length, x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height), more: el.scrollHeight - el.clientHeight })
  }
  if (document.scrollingElement && document.scrollingElement.scrollHeight > H + 16) scrollables.push({ i: 'page', x: 0, y: 0, w: W, h: H, more: document.scrollingElement.scrollHeight - H })
  return { url: location.href, title: document.title, viewport: [W, H], scrollables, controls, containers, headings, regions: regions.slice(0, 12), styles, texts: [...new Set(texts)] }
}
