#!/usr/bin/env python3
"""Browser check for the unsaved-changes guard (UX-09, lib/unsaved-guard.ts).

Bundles the guard with esbuild into tests/browser/guard.js (not committed), opens
tests/browser/unsaved-guard.html in Chromium and runs eight cases. Needs Python
Playwright. Run from the repository root:
    python3 scripts/dev/check-unsaved-guard.py [path to chrome]
"""
import os, subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
subprocess.run(["npx", "esbuild", "lib/unsaved-guard.ts", "--bundle", "--format=iife", "--global-name=UG",
                "--outfile=tests/browser/guard.js", "--log-level=warning"], cwd=ROOT, check=True)
CHROME = (__import__("sys").argv[1:] or [os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")])[0]
import sys
from playwright.sync_api import sync_playwright
page_url = (ROOT / "tests/browser/unsaved-guard.html").as_uri()
results = []
def check(name, cond): results.append((name, bool(cond)))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    def fresh():
        pg = b.new_page(); pg.goto(page_url); pg.dialogs = []
        return pg
    # 1 untouched page: link works, no question
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.click("#go"); check("untouched page: link followed without a question", pg.evaluate("navs") == 1 and not asked)
    # 2 filter form, search box, ignored form: no question
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.fill("#f1", "abc"); pg.fill("#s1", "abc"); pg.fill("#i1", "abc"); pg.click("#go")
    check("filter form, search box and opted-out form never ask", pg.evaluate("navs") == 1 and not asked)
    # 3 typed in a data form: asks; Cancel keeps the page
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.message), d.dismiss()))
    pg.fill("#d1", "typed"); pg.click("#go")
    check("typed form + link: asks, and Cancel stays on the page", asked and "unsaved changes" in asked[0] and pg.evaluate("navs") == 0)
    # 4 accept: leaves
    pg = fresh()
    pg.on("dialog", lambda d: d.accept())
    pg.fill("#d1", "typed"); pg.click("#go")
    check("typed form + link + OK: leaves the page", pg.evaluate("navs") == 1)
    # 5 submitted: no question
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.fill("#d1", "typed"); pg.click("#save"); pg.click("#go")
    check("after Save: no question", pg.evaluate("navs") == 1 and not asked)
    # 6 edited form removed (Cancel on an edit form): no question
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.fill("#e1", "typed"); pg.evaluate("document.getElementById('edit').remove()"); pg.click("#go")
    check("edit form closed: no question", pg.evaluate("navs") == 1 and not asked)
    # 7 closing the tab with unsaved input: the browser asks
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.click("#d1"); pg.keyboard.type("typed"); pg.evaluate("setTimeout(() => location.reload(), 0)"); pg.wait_for_timeout(1500)
    check("closing the tab with unsaved input: browser asks", "beforeunload" in asked)
    # 8 guard removed: no question
    pg = fresh(); asked = []
    pg.on("dialog", lambda d: (asked.append(d.type), d.dismiss()))
    pg.evaluate("window.stop()"); pg.fill("#d1", "typed"); pg.click("#go")
    check("guard uninstalled: no question", pg.evaluate("navs") == 1 and not asked)
    b.close()
for n, ok in results: print("PASS" if ok else "FAIL", n)
sys.exit(0 if all(ok for _, ok in results) else 1)
