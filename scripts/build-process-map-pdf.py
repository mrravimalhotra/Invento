#!/usr/bin/env python3
"""Rebuild public/process-map.pdf from public/process-map.html.

The HTML page is the source of truth (edit it, never the PDF). Needs Python Playwright with
Chromium (see docs/modules/user-guide.md). Run from the repository root:
    python3 scripts/build-process-map-pdf.py
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "public/process-map.html"
OUT = ROOT / "public/process-map.pdf"

header = '<div style="width:100%;font-size:8pt;color:#666;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Invento Process Map</span><span>Atharva Nature Healthcare Pvt. Ltd.</span></div>'
footer = '<div style="width:100%;font-size:8pt;color:#666;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Confidential — for internal Atharva use</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(color_scheme="light")
    pg.goto(SRC.as_uri())
    pg.emulate_media(media="print")
    pg.pdf(path=str(OUT), format="A4", landscape=True, print_background=True,
           display_header_footer=True, header_template=header, footer_template=footer,
           margin={"top": "16mm", "bottom": "14mm", "left": "12mm", "right": "12mm"})
    b.close()
print("wrote", OUT)
