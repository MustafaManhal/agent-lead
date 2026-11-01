import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const playwrightRequire = createRequire('/Users/mustafamanhal/emdash/worktrees/figmu-1c7144a2/emdash-worker-i9g93/package.json')
const { chromium } = playwrightRequire('playwright')
const fixture = `<!doctype html><html><head><title>Scan fixture</title><style>
body{font:15px sans-serif;margin:24px;color:#222}button,a,input{margin:5px;padding:9px}#menu,#submenu{display:none;position:absolute;background:white;border:1px solid #aaa;padding:8px}#menu.open,#submenu.open{display:block}#submenu{left:115px;top:44px}.scroll{height:100px;width:300px;overflow-y:auto;border:1px solid #888}.row{height:42px}.icon{width:24px;height:24px}.tip{display:none;position:absolute;background:#111;color:white;padding:6px}.icon-wrap:hover .tip{display:block}dialog[open]{border:1px solid #444}
</style></head><body>
<h1>Start screen</h1><p id="zoom"></p>
<button id="file" aria-haspopup="menu" aria-expanded="false">File</button><div id="menu" role="menu"><div role="menuitem" id="more">More options</div><div id="submenu" role="menu"><div role="menuitem">Preferences</div></div></div>
<div role="tablist"><button role="tab" id="tab1" aria-selected="true">Overview</button><button role="tab" id="tab2" aria-selected="false">Activity</button></div><section id="panel">Overview panel</section>
<button id="details">Details</button><dialog id="dialog" aria-label="Details"><h2>Details panel</h2><p>Dialog content</p></dialog>
<label>Search records <input type="search" aria-label="Search records" placeholder="Search"></label><div id="results"></div>
<div class="scroll" role="region" aria-label="Records">${Array.from({length: 12}, (_, i) => `<div class="row">Record item ${i + 1}</div>`).join('')}</div>
<a href="/second">Second page</a>
<span class="icon-wrap"><button aria-label="Help"><svg class="icon"><title>Question mark</title><circle cx="12" cy="12" r="8"/></svg></button><span class="tip" role="tooltip">Help tooltip</span></span>
<button id="delete">Delete</button><script>
document.getElementById('zoom').textContent='Zoom level '+Math.floor(Math.random()*10000)+'%';
const file=document.getElementById('file'),menu=document.getElementById('menu'),more=document.getElementById('more'),sub=document.getElementById('submenu');file.onclick=()=>{menu.classList.toggle('open');file.setAttribute('aria-expanded',menu.classList.contains('open'))};more.onmouseenter=()=>sub.classList.add('open');
for(const t of document.querySelectorAll('[role=tab]'))t.onclick=()=>{for(const x of document.querySelectorAll('[role=tab]'))x.setAttribute('aria-selected',String(x===t));document.getElementById('panel').textContent=t.textContent+' panel'};
document.getElementById('details').onclick=()=>document.getElementById('dialog').showModal();document.getElementById('dialog').onkeydown=e=>{if(e.key==='Escape')document.getElementById('dialog').close()};
document.querySelector('input[type=search]').oninput=e=>document.getElementById('results').innerHTML=e.target.value?'<div role="option">Alpha result</div><div role="option">Beta result</div>':'';
document.getElementById('delete').onclick=()=>fetch('/delete',{method:'POST'});
window.addEventListener('unload',()=>{});
</script></body></html>`

test('scan crawls local fixture safely and recognizes start screen after volatile reload', { timeout: 55_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-lead-scan-'))
  let loads = 0
  let deletes = 0
  const server = createServer((req, res) => {
    if (req.url === '/delete' && req.method === 'POST') { deletes++; res.end('ok'); return }
    if (req.url === '/second') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Second</title><h1>Second page</h1><a href="/">Back to start</a>'); return }
    if (req.url === '/telemetry') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ loads, deletes })); return }
    if (req.url !== '/' && req.url !== '/favicon.ico') { res.writeHead(404); res.end(); return }
    loads++
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(fixture)
  })
  await new Promise((resolve) => server.listen(9556, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9555', '--remote-allow-origins=*'] })
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:9556/')
    const env = { ...process.env, NODE_PATH: dirname(dirname(playwrightRequire.resolve('playwright'))) }
    const out = join(dir, 'out')
    const child = spawn(process.execPath, [join(repo, 'skills/agent-lead/tools/scan.mjs'), 'http://127.0.0.1:9556/', '--port', '9555', '--out', out, '--no-rea', '--no-routes', '--max', '45', '--depth', '3', '--per', '30', '--wait', '80', '--load', '400', '--tip', '80', '--no-motion'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('scan exceeded 45 seconds')) }, 45_000)
      child.on('error', (e) => { clearTimeout(timer); reject(e) })
      child.on('exit', (code) => { clearTimeout(timer); resolve(code) })
    })
    assert.equal(exit, 0, `${stdout}\n${stderr}`)
    const graph = JSON.parse(await readFile(join(out, 'runs/main/graph.json'), 'utf8'))
    const edges = graph.edges.map((e) => e.action).join('\n')
    assert.match(edges, /File/)
    assert.match(edges, /More options/)
    assert.match(edges, /Details/)
    assert.match(edges, /Search records/)
    assert.match(edges, /Second page/)
    assert.ok(graph.states.length >= 5, `expected states for menu/tab/dialog/search/page; got ${graph.states.length}\n${stdout}`)
    const rootState = graph.states[0]
    const rootDir = join(out, 'runs/main/states', rootState.dir)
    const rootUi = JSON.parse(await readFile(join(rootDir, 'ui.json'), 'utf8'))
    assert.ok(rootUi.controls.some((c) => c.role === 'button' && c.name === 'Help' && /Help tooltip/.test(c.tip ?? '')), 'icon tooltip should be captured')
    assert.ok(rootUi.controls.some((c) => c.role === 'tab' && c.name === 'Activity'))
    assert.ok(rootUi.controls.some((c) => c.role === 'searchbox' && c.name === 'Search records'))
    assert.ok(rootUi.controls.some((c) => c.role === 'button' && c.name === 'Delete'), 'Delete should be visible to prove it was safely filtered')
    assert.ok(graph.states.some((s) => s.kind === 'tab'), 'tab switch should be a distinct state')
    assert.ok(graph.edges.some((e) => /search "a" in searchbox/.test(e.action)), 'search action should be explored')
    assert.ok((await readdir(join(rootDir, 'scroll'))).some((f) => f.endsWith('.jpg')), 'scrollable content should be captured')
    assert.ok(loads >= 2, `expected reload/navigation, saw ${loads} root loads`)
    assert.equal(deletes, 0, 'Delete button must never be activated')
    assert.doesNotMatch(stdout, /could not return to 000/)
  } finally {
    await browser?.close().catch(() => {})
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
