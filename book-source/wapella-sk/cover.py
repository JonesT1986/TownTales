#!/usr/bin/env python3
"""KDP cover PDFs for the Wapella book.

  python3 cover.py <pages>   -> build/cover-paperback.pdf, build/cover-hardcover-DRAFT.pdf
Paperback geometry is from KDP's published formula (white paper: 0.002252 in/page, 0.125 in bleed).
Hardcover geometry must be checked against KDP's own cover template for the final page count.
If img/cover.jpg exists (the 1908 main street postcard), it replaces the illustration.
"""
import os, sys
from weasyprint import HTML, CSS

ROOT = os.path.dirname(os.path.abspath(__file__))
INK, PAPER, RED, WHEAT = "#1E2930", "#F5EFDF", "#B4512C", "#E3B34A"

# Original illustration: a prairie main street with false-fronted stores, a grain elevator and the railway.
ART = f"""<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D9B4"/><stop offset="1" stop-color="#F5EFDF"/></linearGradient></defs>
<rect width="800" height="520" fill="url(#sky)"/>
<circle cx="640" cy="120" r="46" fill="{WHEAT}" opacity=".55"/>
<path d="M0 360 C150 345 300 352 420 348 S700 340 800 350 V520 H0z" fill="#D9C79A"/>
<g fill="{INK}">
 <rect x="520" y="150" width="96" height="210"/><rect x="510" y="140" width="116" height="16"/>
 <rect x="545" y="104" width="46" height="40"/><path d="M540 104 L568 84 L596 104z"/>
 <rect x="616" y="250" width="70" height="110"/><path d="M612 250 L651 228 L690 250z"/>
 <text x="568" y="200" font-family="Anton" font-size="22" fill="{PAPER}" text-anchor="middle" letter-spacing="2">WAPELLA</text>
</g>
<g stroke="{INK}" stroke-width="4"><path d="M0 372 H800"/><path d="M0 384 H800"/></g>
<g stroke="{INK}" stroke-width="3">{''.join(f'<path d="M{x} 368 V388"/>' for x in range(6, 800, 22))}</g>
<g fill="{RED}" stroke="{INK}" stroke-width="3">
 <path d="M40 360 V250 H70 V236 H150 V250 H160 V360z"/>
 <path d="M176 360 V262 H260 V360z"/>
 <path d="M276 360 V228 H300 V214 H380 V228 H396 V360z" fill="#8F3E1F"/>
 <path d="M412 360 V270 H488 V360z" fill="{WHEAT}"/>
</g>
<g fill="{PAPER}" stroke="{INK}" stroke-width="2">
 <rect x="62" y="270" width="24" height="34"/><rect x="112" y="270" width="24" height="34"/><rect x="88" y="318" width="40" height="42"/>
 <rect x="196" y="282" width="20" height="28"/><rect x="226" y="282" width="20" height="28"/>
 <rect x="296" y="250" width="22" height="30"/><rect x="330" y="250" width="22" height="30"/><rect x="362" y="250" width="22" height="30"/><rect x="314" y="312" width="44" height="48"/>
 <rect x="428" y="290" width="18" height="26"/><rect x="456" y="290" width="18" height="26"/>
</g>
<g fill="{INK}" font-family="Anton" font-size="13" letter-spacing="1" text-anchor="middle">
 <text x="100" y="256" fill="{PAPER}">HOTEL</text><text x="336" y="236" fill="{PAPER}">GENERAL STORE</text>
</g>
<path d="M0 440 L800 440" stroke="#BFA971" stroke-width="2" stroke-dasharray="10 12"/>
</svg>"""


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")


FRONT = """<div class="front">
<div class="kicker">A TownTales History</div>
<div class="art">{ART}</div>
<div class="title">WAPELLA</div>
<div class="sub">Railway Town, Prairie Crossroads</div>
<div class="sub2">Saskatchewan · 1874 to today</div>
<div class="pub">TownTales</div>
</div>"""

BACK = """<div class="back">
<p class="q">The CPR arrived in 1882. Hebridean crofters followed in 1883. In the poplar bluffs north of town, Jewish families who had never been allowed to own land built the first successful Jewish farm colony in Canada.</p>
<p>This is the story of Wapella, Saskatchewan: the land and the treaty, the railway and the people who stepped off it, the Bronfman family’s first prairie home, a brick town hall with an opera house, a ball team that won 51 games in the summer of 1924, and the hockey champions who followed.</p>
<p>Every fact is sourced. Where the records disagree, the book says so. And at its heart is a Roll of Remembrance: more than 1,300 people buried in the cemeteries of the Wapella district, each one named.</p>
<p class="small">Printed on demand from the TownTales collection. Add your family’s story for the next edition at <b>towntales.ca</b>.</p>
</div>"""


def css(W, H, spine, bleed_l, panel_w, wrap, hinge, spine_text):
    # x positions (inches) of each panel from the left edge of the sheet
    back_x = bleed_l
    spine_x = back_x + panel_w + hinge
    front_x = spine_x + spine + hinge
    return f"""
@page {{ size: {W}in {H}in; margin: 0; }}
html, body {{ margin: 0; }}
body {{ width: {W}in; height: {H}in; position: relative; background: {INK}; font-family: 'Crimson Text'; color: {PAPER}; }}
.front {{ position: absolute; left: {front_x}in; top: 0; width: {panel_w + wrap}in; height: {H}in; padding: {wrap + 0.45}in {wrap + 0.5}in {wrap + 0.45}in 0.5in; box-sizing: border-box; }}
.kicker {{ font: 13pt Anton; letter-spacing: 5pt; text-transform: uppercase; color: {WHEAT}; }}
.art {{ margin: 0.25in 0 0.3in; height: 4.6in; border: 3pt solid {PAPER}; overflow: hidden; }}
.art svg, .art img {{ width: 100%; height: 100%; display: block; object-fit: cover; }}
.title {{ font: 96pt Anton; letter-spacing: 6pt; line-height: 1; color: {PAPER}; }}
.sub {{ font-style: italic; font-size: 24pt; margin-top: 0.1in; }}
.sub2 {{ font: 12pt Anton; letter-spacing: 3pt; text-transform: uppercase; color: {WHEAT}; margin-top: 0.12in; }}
.pub {{ position: absolute; left: 0.5in; bottom: {wrap + 0.5}in; font: 14pt Anton; letter-spacing: 4pt; text-transform: uppercase; color: {PAPER}; }}
.back {{ position: absolute; left: 0; top: 0; width: {back_x + panel_w}in; height: {H}in; padding: {wrap + 0.7}in 0.6in 0 {wrap + 0.6}in; box-sizing: border-box; font-size: 13pt; line-height: 1.45; background: {INK}; }}
.back p {{ margin: 0 0 0.16in; }}
.back .q {{ font-size: 17pt; line-height: 1.35; font-style: italic; color: {WHEAT}; border-left: 3pt solid {RED}; padding-left: 0.18in; margin-bottom: 0.28in; }}
.back .small {{ font-size: 11pt; margin-top: 0.3in; }}
.spine {{ position: absolute; left: {spine_x}in; top: 0; width: {spine}in; height: {H}in; background: {RED if spine_text else INK}; }}
.spine-t {{ position: absolute; left: {spine_x + spine / 2}in; top: {H / 2}in; transform: translate(-50%,-50%) rotate(90deg); font: 11pt Anton; letter-spacing: 3pt; color: {PAPER}; white-space: nowrap; display: {'block' if spine_text else 'none'}; }}
"""


def build(pages):
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    art = ART
    cov = os.path.join(ROOT, "img", "cover.jpg")
    if os.path.exists(cov):
        art = f'<img src="file://{cov}" alt="">'
    front = FRONT.replace("{ART}", art)
    body = f"<html><body><div class='back-wrap'>{BACK}</div><div class='spine'></div><div class='spine-t'>WAPELLA · A TOWNTALES HISTORY</div>{front}</body></html>"

    # Paperback (KDP formula)
    bleed = 0.125
    spine = round(pages * 0.002252, 4)
    W, H = round(bleed + 8.5 + spine + 8.5 + bleed, 4), 11.25
    HTML(string=body).write_pdf(os.path.join(ROOT, "build", "cover-paperback.pdf"),
                                stylesheets=[CSS(string=css(W, H, spine, bleed, 8.5, bleed, 0, pages >= 79))])
    print(f"paperback cover: {W} x {H} in, spine {spine} in ({pages} pages, spine text {'yes' if pages >= 79 else 'no'})")

    # Hardcover case laminate: 8.25 x 11 boards, 0.591 in wrap, 0.197 in hinge each side of the spine
    # (third-party measurements of KDP's template; KDP publishes the exact numbers only in its template).
    wrap, hinge = 0.591, 0.197
    hc_spine = round(pages * 0.002252 + 0.189, 4)
    W2 = round(wrap + 8.25 + hinge + hc_spine + hinge + 8.25 + wrap, 4)
    H2 = round(wrap + 11 + 0.236 + wrap, 4)
    HTML(string=body).write_pdf(os.path.join(ROOT, "build", "cover-hardcover-DRAFT.pdf"),
                                stylesheets=[CSS(string=css(W2, H2, hc_spine, wrap, 8.25, wrap, hinge, True))])
    print(f"hardcover cover DRAFT: {W2} x {H2} in, spine {hc_spine} in — check against KDP's template")


if __name__ == "__main__":
    build(int(sys.argv[1]) if len(sys.argv) > 1 else 78)
