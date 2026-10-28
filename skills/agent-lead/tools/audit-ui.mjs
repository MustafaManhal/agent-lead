#!/usr/bin/env node
// Audit the running app's pages for the layout and accessibility bugs screenshots miss: horizontal overflow at
// every width from 320 px to 1440 px, tap targets smaller than 44 px on a phone, and text whose rendered contrast is
// below WCAG AA (4.5:1, 3:1 for large text), with translucent layers composited the way the browser paints them.
// Needs only Chrome or Chromium (no npm packages). The app must be running.
//   node <tools>/audit-ui.mjs [--url <base>] [--routes "/,/about"] [--routes-file routes.txt] [--widths 320,768,1440]
//                             [--min-target 44] [--dark] [--settle <ms>]
// --url defaults to "devUrl" in .agent-lead/config.json. Exits 1 with a list of problems, 0 when clean.
// From the user's my-portfolio project (scripts/audit-render.mjs), made generic.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config, options } from "./lib.mjs";

const args = process.argv.slice(2);
const o = options(args);
const BASE = (o.opt("--url") ?? config.devUrl ?? "http://localhost:3000").replace(/\/$/, "");
const routesFile = o.opt("--routes-file");
const ROUTES = routesFile
  ? readFileSync(routesFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  : (o.opt("--routes") ?? "/").split(",").map((r) => r.trim()).filter(Boolean);
const WIDTHS = (o.opt("--widths") ?? "320,375,414,768,820,900,1023,1024,1440").split(",").map(Number);
const MIN_TARGET = Number(o.opt("--min-target") ?? 44);
const DARK = o.flag("--dark");
const SETTLE = Number(o.opt("--settle") ?? 1200);
const PORT = Number(process.env.CDP_PORT ?? 9444);
const CHROME =
  process.env.CHROME_PATH ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

async function launch() {
  if (!CHROME) {
    console.error("✗ No Chrome found. Set CHROME_PATH to a Chrome/Chromium binary.");
    process.exit(2);
  }
  const profile = mkdtempSync(join(tmpdir(), "audit-render-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await sleep(250);
  }

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  if (DARK) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

  return {
    evaluate: async (expression) => {
      const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return m.result?.result?.value;
    },
    viewport: (width, height) =>
      send("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: 1, mobile: width < 768,
      }),
    goto: async (path, settle = SETTLE) => {
      await send("Page.navigate", { url: `${BASE}${path}` });
      await sleep(settle);
    },
    dispose: () => {
      try { ws.close(); } catch {}
      proc.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

const OVERFLOW = `(() => {
  const de = document.documentElement, cw = de.clientWidth;
  const inFixed = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement)
      if (getComputedStyle(n).position === "fixed") return true;
    return false;
  };
  let worst = null;
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > cw + 1 && !inFixed(el))
      if (!worst || r.right > worst.right)
        worst = { right: Math.round(r.right), cls: String(el.className || el.tagName).slice(0, 70) };
  }
  return { scrollWidth: de.scrollWidth, clientWidth: cw, worst };
})()`;

const TARGETS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll("a, button, input, textarea, select, [role=button]")) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    // A link inside a sentence is inline text, not a tap target.
    if (el.tagName === "A" && el.parentElement && /^(P|LI|SPAN)$/.test(el.parentElement.tagName)) continue;
    if (b.height < ${MIN_TARGET} || b.width < ${MIN_TARGET})
      out.push({
        w: Math.round(b.width), h: Math.round(b.height),
        label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 30),
      });
  }
  return out;
})()`;

const CONTRAST = `(() => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Do NOT regex-parse colour notation. Chrome no longer serializes everything
  // as rgb()/rgba(): an opacity modifier on a theme colour (bg-text-max/[0.04])
  // computes to "lab(100 -0.00003 0.00001 / 0.04)", and pulling the first three
  // numbers out of that reads L*=100 as R=100, a dark red background that does
  // not exist. That fabricated a 3.45:1 failure on the navbar for text really
  // sitting at 5.13:1. oklch(), color(), and color-mix() all break it the same way.
  //
  // Let the browser resolve the colour instead: paint it into a 1×1 canvas and
  // read the pixel back. getImageData is unpremultiplied sRGB, so this returns
  // both the true channels and the true alpha for ANY notation Chrome emits.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const resolve = (s) => {
    if (!s || s === "transparent") return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = s;             // invalid values leave the sentinel in place
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  // Translucent layers are COMPOSITED, not skipped. The old rule ("first
  // ancestor with alpha > 0.5 wins") threw away a 4% white wash entirely and,
  // on a frosted element, would report the wrong background either way.
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = resolve(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) stack.push(c);
      if (c[3] >= 0.999) break;
    }
    // The page base: the root element's background when it is opaque, else white (what a browser paints).
    const rootBg = resolve(getComputedStyle(document.documentElement).backgroundColor);
    let out = rootBg[3] >= 0.999 ? rootBg.slice(0, 3) : [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    // Decorative marks are exempt by spec, and must be aria-hidden to be so.
    if (el.closest("[aria-hidden='true']")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const fgRaw = resolve(cs.color);
    if (fgRaw[3] === 0) continue;
    const bg = bgOf(el);
    // Translucent TEXT is composited too. text-text-max/25 is not white; it is
    // white blended 25% into what sits behind it, which on this site is 2.14:1,
    // not 19:1. Taking the raw channels and dropping the alpha lets genuinely
    // unreadable text pass; this gate did exactly that until a deliberate
    // regression caught it.
    const fg = over(fgRaw, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && size >= 18.66);
    const floor = large ? 3 : 4.5;
    const cr = ratio(fg, bg);
    if (cr < floor)
      out.push({ cr: +cr.toFixed(2), floor, size, color: cs.color, sample: el.textContent.trim().slice(0, 30) });
  }
  return out;
})()`;

try {
  await fetch(BASE);
} catch {
  console.error(`✗ Nothing answering at ${BASE}. Start the app first.`);
  process.exit(2);
}
const routes = ROUTES;
const browser = await launch();
console.log(`Auditing ${routes.length} route(s) against ${BASE}${DARK ? " (dark)" : ""}\n`);

try {
  console.log("── overflow + tap targets ──");
  for (const route of routes) {
    await browser.viewport(1440, 900);
    await browser.goto(route);
    const marks = [];
    for (const width of WIDTHS) {
      await browser.viewport(width, 844);
      await sleep(350);
      const o = await browser.evaluate(OVERFLOW);
      if (o.scrollWidth > o.clientWidth) {
        failures.push(`OVERFLOW ${route} @${width}px: scrollW=${o.scrollWidth} vs ${o.clientWidth}${o.worst ? `, widest: ${o.worst.cls}` : ""}`);
        marks.push(`${width}:✗`);
      } else marks.push(`${width}:·`);
    }
    await browser.viewport(390, 844);
    await sleep(350);
    for (const t of await browser.evaluate(TARGETS))
      failures.push(`TARGET ${route}: ${t.w}×${t.h} (min ${MIN_TARGET}) "${t.label}"`);
    console.log(`  ${route.padEnd(26)} ${marks.join(" ")}`);
  }

  console.log("\n── rendered contrast ──");
  await browser.viewport(1440, 900);
  for (const route of routes) {
    await browser.goto(route);
    const bad = await browser.evaluate(CONTRAST);
    for (const b of bad)
      failures.push(`CONTRAST ${route}: ${b.cr}:1 (needs ${b.floor}) ${b.size}px ${b.color} "${b.sample}"`);
    console.log(`  ${bad.length ? "✗" : "ok"}  ${route}`);
  }
} finally {
  browser.dispose();
}

if (failures.length) {
  console.error(`\n✗ UI audit failed: ${failures.length} problem(s)\n`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\n✓ UI audit passed");
