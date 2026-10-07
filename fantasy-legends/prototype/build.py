#!/usr/bin/env python3
"""Build the prototype into dist/.

Writes dist/index.html (src/page.html with src/engine.js and src/app.js inlined at the
/*__ENGINE__*/ and /*__APP__*/ placeholders) and copies data/*.json to dist/data/.

The page is published as a claude.ai artifact, whose host wraps it in its own
<!doctype html>/<head>/<body> skeleton, so the build checks that page.html has none of
those tags and starts with the <title>. Run: python3 build.py
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DATA = ROOT / "data"
DIST = ROOT / "dist"
PLACEHOLDERS = {"/*__ENGINE__*/": SRC / "engine.js", "/*__APP__*/": SRC / "app.js"}
DATA_FILES = ["players.json"] + [f"games_{p}.json" for p in ("qb", "rb", "wr", "te", "k", "def")]
ALLOWED_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")


def fail(msg):
    print(f"build.py: {msg}", file=sys.stderr)
    sys.exit(1)


def check_page(page):
    if not page.startswith("<title>Fantasy Football of the Past</title>"):
        fail("src/page.html must start with <title>Fantasy Football of the Past</title>.")
    if not re.match(r"<title>[^<]*</title>\s*<style>", page):
        fail("src/page.html must have a <style> right after the <title>.")
    m = re.search(r"(?i)<(!doctype|/?html|/?head|/?body)[\s>]", page)
    if m:
        fail(f"src/page.html must not contain <{m.group(1)}> (the artifact host adds the skeleton).")
    for ph in PLACEHOLDERS:
        n = page.count(ph)
        if n != 1:
            fail(f"src/page.html must contain {ph} exactly once (found {n}).")
    for url in re.findall(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", page):
        if re.match(r"(?i)^(https?:)?//", url):
            host = re.sub(r"(?i)^(https?:)?//", "", url).split("/")[0]
            if host not in ALLOWED_HOSTS:
                fail(f"src/page.html loads {url}; only Google Fonts may be loaded from outside.")
    for banned in ("alert(", "confirm(", "prompt(", "window.print", "window.open"):
        if banned in page:
            fail(f"src/page.html uses {banned}, which the artifact viewer blocks.")


def inline_js(path):
    text = path.read_text(encoding="utf-8")
    # A literal </script inside the inlined code would end the script element early.
    return re.sub(r"</(script)", r"<\\/\1", text, flags=re.IGNORECASE)


def check_app(app):
    for banned in (r"\balert\(", r"\bconfirm\(", r"\bprompt\(", r"window\.print", r"window\.open"):
        if re.search(banned, app):
            fail(f"src/app.js uses {banned}, which the artifact viewer blocks.")


def main():
    page = (SRC / "page.html").read_text(encoding="utf-8")
    check_page(page)
    for path in PLACEHOLDERS.values():
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}")
    check_app((SRC / "app.js").read_text(encoding="utf-8"))
    missing = [f for f in DATA_FILES if not (DATA / f).exists()]
    if missing:
        fail("missing data files (run build_data.py first): " + ", ".join(missing))

    out = page
    for ph, path in PLACEHOLDERS.items():
        out = out.replace(ph, inline_js(path), 1)

    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "data").mkdir(parents=True)
    (DIST / "index.html").write_text(out, encoding="utf-8")
    total = 0
    for f in DATA_FILES:
        shutil.copyfile(DATA / f, DIST / "data" / f)
        total += (DATA / f).stat().st_size

    size = (DIST / "index.html").stat().st_size
    print(f"wrote dist/index.html ({size / 1024:.1f} KB) and {len(DATA_FILES)} data files ({total / 1e6:.1f} MB) to dist/data/")


if __name__ == "__main__":
    main()
