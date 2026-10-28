#!/usr/bin/env python3
"""Token-cheap web research helper. Python 3.9+, standard library only.

Why: pages are big, models bill per token. This tool downloads and cleans pages
on disk, caches them, and prints only the small part you ask for.

Commands
  search "query" [-n 8]              web search (DuckDuckGo HTML), title + url + snippet
  fetch URL                          clean page to cache, print size and headings only
  grep URL kw1,kw2 [-c 1] [-m 12]    print only passages containing keywords (+/- c neighbours)
  read URL [-s START] [-n 3000]      print a slice of the cleaned text
  multi "query" kw1,kw2 [-n 5]       search, fetch top results, print keyword passages for each
  note FILE "text" --src URL         append a sourced bullet to a notes file inside the project
  cache                              list cached pages

Cache: ~/.cache/agent-lead/research (safe to delete).
From the user's Calli-app project (.ai/tools/research.py), made generic for the agent-lead plugin.
"""
import argparse, hashlib, html, json, re, sys, time, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

import os, subprocess

CACHE = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "agent-lead" / "research"


def project_root():
    r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    return Path(r.stdout.strip()) if r.returncode == 0 else Path.cwd()


AI_DIR = project_root()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
TTL = 7 * 24 * 3600


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(3_000_000)
        charset = r.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


class Cleaner(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe", "aside"}
    BLOCK = {"p", "div", "li", "br", "tr", "section", "article", "h1", "h2", "h3", "h4", "table", "ul", "ol"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.title, self.in_title = [], 0, "", False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag == "title":
            self.in_title = True
        elif tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag == "title":
            self.in_title = False
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.skip:
            self.out.append(data)


def clean(markup):
    p = Cleaner()
    p.feed(markup)
    text = html.unescape("".join(p.out))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    lines = [l.strip() for l in text.split("\n")]
    # drop tiny boilerplate lines (menus, buttons) but keep headings and list items
    lines = [l for l in lines if len(l) > 25 or l.startswith(("#", "- ")) and len(l) > 6 or l == ""]
    return p.title.strip(), re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def get_page(url, refresh=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")
    if f.exists() and not refresh and time.time() - f.stat().st_mtime < TTL:
        return json.loads(f.read_text())
    try:
        title, text = clean(http_get(url))
    except Exception as e:
        return {"url": url, "title": "", "text": "", "error": str(e)}
    d = {"url": url, "title": title, "text": text, "fetched": time.strftime("%Y-%m-%d")}
    f.write_text(json.dumps(d))
    return d


def passages(text, kws, ctx=1, maxn=12):
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    pats = [re.compile(re.escape(k.strip()), re.I) for k in kws if k.strip()]
    hit = [i for i, p in enumerate(paras) if any(r.search(p) for r in pats)]
    keep, seen = [], set()
    for i in hit:
        for j in range(max(0, i - ctx), min(len(paras), i + ctx + 1)):
            if j not in seen:
                seen.add(j)
                keep.append(j)
    keep.sort()
    out, last = [], -2
    for j in keep[: maxn * (2 * ctx + 1)]:
        if j != last + 1 and out:
            out.append("  ...")
        out.append(paras[j][:600])
        last = j
    return out, len(hit)


def search(q, n=8):
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(q)
    page = http_get(url)
    res = []
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|$)', page, re.S):
        href, title, rest = m.groups()
        q2 = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
        link = q2.get("uddg", [href])[0]
        snip = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', rest, re.S)
        strip = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
        if "duckduckgo.com/y.js" in link:
            continue
        res.append((strip(title), link, strip(snip.group(1)) if snip else ""))
        if len(res) >= n:
            break
    return res


def cmd_search(a):
    r = search(a.query, a.n)
    if not r:
        print("no results (search engine may have rate-limited; retry in a minute)")
    for i, (t, u, s) in enumerate(r, 1):
        print(f"{i}. {t}\n   {u}\n   {s[:200]}")


def cmd_fetch(a):
    d = get_page(a.url, a.refresh)
    if d.get("error"):
        sys.exit(f"error: {d['error']}")
    heads = [l for l in d["text"].split("\n") if l.startswith("#")][:25]
    print(f"{d['title']}\n{len(d['text'])} chars cached\n" + "\n".join(heads))


def cmd_grep(a):
    d = get_page(a.url)
    if d.get("error"):
        sys.exit(f"error: {d['error']}")
    out, n = passages(d["text"], a.kw.split(","), a.c, a.m)
    print(f"[{d['title'][:80]}] {n} matching paragraphs")
    print("\n".join(out) if out else "no match; try `fetch` to see headings")


def cmd_read(a):
    d = get_page(a.url)
    print(d["text"][a.s : a.s + a.n])


def cmd_multi(a):
    for t, u, _ in search(a.query, a.n):
        d = get_page(u)
        if d.get("error"):
            print(f"\n## {u}\n(error: {d['error'][:80]})")
            continue
        out, n = passages(d["text"], a.kw.split(","), 0, a.m)
        if out:
            print(f"\n## {t[:80]}\n{u}\n" + "\n".join(out))


def cmd_note(a):
    p = AI_DIR / a.file
    if AI_DIR not in p.resolve().parents:
        sys.exit("file must be inside the project")
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as f:
        f.write(f"- {a.text} ([source]({a.src}), {time.strftime('%Y-%m-%d')})\n")
    print(f"added to {p.relative_to(AI_DIR)}")


def cmd_cache(a):
    for f in sorted(CACHE.glob("*.json")) if CACHE.exists() else []:
        d = json.loads(f.read_text())
        print(f"{len(d['text']):>7}  {d['url']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("search"); s.add_argument("query"); s.add_argument("-n", type=int, default=8); s.set_defaults(f=cmd_search)
    s = sp.add_parser("fetch"); s.add_argument("url"); s.add_argument("--refresh", action="store_true"); s.set_defaults(f=cmd_fetch)
    s = sp.add_parser("grep"); s.add_argument("url"); s.add_argument("kw"); s.add_argument("-c", type=int, default=1); s.add_argument("-m", type=int, default=12); s.set_defaults(f=cmd_grep)
    s = sp.add_parser("read"); s.add_argument("url"); s.add_argument("-s", type=int, default=0); s.add_argument("-n", type=int, default=3000); s.set_defaults(f=cmd_read)
    s = sp.add_parser("multi"); s.add_argument("query"); s.add_argument("kw"); s.add_argument("-n", type=int, default=5); s.add_argument("-m", type=int, default=3); s.set_defaults(f=cmd_multi)
    s = sp.add_parser("note"); s.add_argument("file"); s.add_argument("text"); s.add_argument("--src", required=True); s.set_defaults(f=cmd_note)
    s = sp.add_parser("cache"); s.set_defaults(f=cmd_cache)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
