#!/usr/bin/env python3
"""Build the Wapella book interiors for KDP.

  python3 build.py            -> build/wapella-paperback-8.5x11.pdf and build/wapella-hardcover-8.25x11.pdf
Images: put img/<id>.jpg (grayscale, 300 DPI at print size) for each figure's data-img.
Missing images print as a labelled grey frame (draft only).
"""
import json, os, re, html, sys
from weasyprint import HTML, CSS

ROOT = os.path.dirname(os.path.abspath(__file__))
FONTS = "/usr/share/fonts/truetype/google-fonts/ofl"
FORMATS = {
    "paperback": {"w": 8.5, "h": 11.0, "out": "wapella-paperback-8.5x11.pdf"},
    "hardcover": {"w": 8.25, "h": 11.0, "out": "wapella-hardcover-8.25x11.pdf"},
}


def esc(s):
    return html.escape(s, quote=True)


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def roll_entries(fname):
    out = []
    for e in read("data/" + fname).strip().split(";"):
        e = e.strip()
        if not e:
            continue
        name, born, died = (e.split("|") + ["", ""])[:3]
        out.append((name.strip(), born.strip(), died.strip()))
    return out


def surname_key(name):
    n = re.sub(r"\(.*?\)", "", name).replace("'", "").strip()
    parts = [p for p in n.split() if p not in ("Jr.", "Sr.", "Rev.", "Mrs.")]
    last = parts[-1] if parts else n
    return (last.lower(), n.lower())


def fmt_name(name):
    # "Alice Gordon (Millham)" -> surname first, maiden name kept: "Gordon, Alice (née Millham)"
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", name)
    maiden = ""
    if m:
        name, maiden = m.group(1), m.group(2)
    parts = name.split()
    if len(parts) >= 2:
        last = parts[-1]
        rest = " ".join(parts[:-1])
        out = f"<b>{esc(last)}</b>, {esc(rest)}"
    else:
        out = f"<b>{esc(name)}</b>"
    if maiden:
        out += f" <span class='nee'>(née {esc(maiden)})</span>"
    return out


def dates(b, d):
    if b and d:
        return f"{esc(b)} – {esc(d)}"
    if d:
        return esc(d) if "age" in d or not b else f"– {esc(d)}"
    if b:
        return f"b. {esc(b)}"
    return "<i>no dates recorded</i>"


def roll_html():
    groups = [
        ("Wapella Community Cemetery", "roll-community.txt"),
        ("St. Paul’s Cemetery", "roll-stpauls.txt"),
        ("Earlswood Cemetery", "roll-earlswood.txt"),
        ("St. Andrew’s Cemetery", "roll-standrews.txt"),
    ]
    total = 0
    parts = []
    for title, f in groups:
        es = sorted(roll_entries(f), key=lambda e: surname_key(e[0]))
        total += len(es)
        items, letter = [], None
        for n, b, d in es:
            L = surname_key(n)[0][:1].upper()
            if L != letter:
                letter = L
                items.append(f"<li class='rl-letter'>{esc(L)}</li>")
            items.append(f"<li>{fmt_name(n)}<span class='rl-d'>{dates(b, d)}</span></li>")
        parts.append(f"<h3 class='rl-cem'>{esc(title)} <span>({len(es):,} names)</span></h3><ul class='roll'>{''.join(items)}</ul>")
    return (f"<section class='roll-sec' id='roll'><h2 class='fm-h' data-toc='Roll of Remembrance'>Roll of Remembrance</h2>"
            f"<p class='bm-intro'>{total:,} people recorded in the cemeteries of the Wapella district, listed by surname. "
            f"Dates are as the cemetery transcriptions give them.</p>{''.join(parts)}</section>"), total


def glance_html():
    rows = json.loads(read("data/timeline.json"))
    lis = "".join(f"<li><span class='gl-d'>{esc(d)}</span><span>{esc(t)}</span></li>" for d, t in rows)
    return f"<section class='backmatter' id='glance'><h2 class='fm-h' data-toc='Wapella at a Glance'>Wapella at a Glance</h2><ol class='glance'>{lis}</ol></section>"


def figures(body):
    def rep(m):
        tag, img = m.group(0), m.group(1)
        path = os.path.join(ROOT, "img", img + ".jpg")
        if os.path.exists(path):
            return tag.replace("<div class=\"ph\"></div>", f"<img src=\"file://{path}\" alt=\"\">", 1)
        return tag.replace("<div class=\"ph\"></div>", f"<div class=\"ph\"><span>Photograph to come<br>{esc(img.upper())}</span></div>", 1)
    return re.sub(r'<figure class="fig[^"]*" data-img="([^"]+)">.*?</figure>', rep, body, flags=re.S)


def toc(body):
    titles = dict(re.findall(r'id=[\'"]([^\'"]+)[\'"][^>]*>(?:(?!<section).)*?data-toc=[\'"]([^\'"]+)[\'"]', body, flags=re.S))
    nums = dict(re.findall(r'<section class="chapter" id="([^"]+)">\s*<p class="ch-no">([^<]+)</p>', body))

    def rep(m):
        i = m.group(1)
        t = titles.get(i, i)
        n = nums.get(i, "")
        lab = f"<span class='toc-n'>{esc(n.replace('Chapter ', ''))}</span>" if n else "<span class='toc-n'></span>"
        return f'<a href="#{i}">{lab}<span class="toc-t">{esc(t)}</span></a>'
    return re.sub(r'<a href="#([^"]+)"></a>', rep, body)


CSS_TMPL = """
@font-face { font-family: Anton; src: url(file://{F}/anton/Anton-Regular.ttf); }

@page { size: {W}in {H}in; margin: 0.8in 0.7in 0.85in 0.9in;
  @bottom-center { content: counter(page); font: 10pt 'Crimson Text'; color: #333; } }
@page :left { margin-left: 0.7in; margin-right: 0.9in;
  @top-left { content: "WAPELLA"; font: 8pt Anton; letter-spacing: 1.5pt; color: #555; } }
@page :right { margin-left: 0.9in; margin-right: 0.7in;
  @top-right { content: string(chap); font: 8pt Anton; letter-spacing: 1.5pt; color: #555; text-transform: uppercase; } }
@page front { @top-left { content: none } @top-right { content: none } @bottom-center { content: none } }
@page opener { @top-left { content: none } @top-right { content: none } @bottom-center { content: none } }
@page chapstart { @top-left { content: none } @top-right { content: none } }
@page :blank { @top-left { content: none } @top-right { content: none } @bottom-center { content: none } }

html { font-family: 'Crimson Text', serif; font-size: 13pt; line-height: 1.45; color: #111; }
body { margin: 0; }
p { margin: 0 0 0.55em; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
h3 { font: 13pt Anton; letter-spacing: 0.6pt; text-transform: uppercase; margin: 1.3em 0 0.4em; color: #111; break-after: avoid; }
i { font-style: italic; }

.half-title, .title-page, .copyright, .dedication, .contents, .blank { page: front; break-after: page; }
.blank { height: 1px; }
.half-title .ht { font: 34pt Anton; letter-spacing: 6pt; text-align: center; margin-top: 3in; text-transform: uppercase; }
.title-page { text-align: center; }
.tp-kicker { text-align: center; font: 11pt Anton; letter-spacing: 4pt; text-transform: uppercase; margin-top: 1.6in; }
.tp-title { font: 76pt Anton; letter-spacing: 4pt; text-transform: uppercase; margin: 0.2in 0 0.1in; }
.tp-sub { text-align: center; font-size: 20pt; font-style: italic; }
.tp-sub2 { text-align: center; font-size: 13pt; margin-top: 0.15in; }
.tp-rule { width: 1.2in; border-top: 1.5pt solid #111; margin: 0.6in auto 0.3in; }
.tp-pub { text-align: center; font: 12pt Anton; letter-spacing: 3pt; text-transform: uppercase; margin-top: 2.2in; }
.tp-pub span { font: italic 11pt 'Crimson Text'; letter-spacing: 0; text-transform: none; }
.copyright { font-size: 9.5pt; padding-top: 4.2in; }
.copyright p { text-align: left; margin-bottom: 0.7em; }
.cp-small { font-size: 8.5pt; color: #333; }
.dedication p { text-align: center; font-style: italic; font-size: 14pt; margin-top: 3in; }

.fm-h { font: 26pt Anton; letter-spacing: 2pt; text-transform: uppercase; margin: 0.3in 0 0.35in; string-set: chap content(); }
.contents .fm-h { string-set: none; }
ol.toc { list-style: none; padding: 0; margin: 0; }
ol.toc li { margin: 0 0 7pt; font-size: 12.5pt; }
ol.toc li.toc-part { font: 10pt Anton; letter-spacing: 2pt; text-transform: uppercase; margin: 16pt 0 8pt; color: #444; }
ol.toc a { color: #111; text-decoration: none; display: block; }
ol.toc .toc-n { display: inline-block; width: 0.35in; color: #555; }
ol.toc a::after { content: leader('.') target-counter(attr(href), page); }

.foreword { break-before: right; }
.foreword .lead { font-size: 14.5pt; }
.sig { text-align: right; font-style: italic; margin-top: 1em; }

.part-page { page: opener; break-before: right; break-after: right; text-align: center; padding-top: 3in; }
.part-no { text-align: center; font: 12pt Anton; letter-spacing: 5pt; text-transform: uppercase; color: #555; }
.part-title { font: 40pt Anton; letter-spacing: 2pt; text-transform: uppercase; margin-top: 0.2in; line-height: 1.05; }

.chapter { break-before: right; }
.chapter > .ch-no:first-child { page: chapstart; }
.ch-no { font: 11pt Anton; letter-spacing: 4pt; text-transform: uppercase; color: #555; margin-top: 1.2in; text-align: left; }
.ch-title { font: 34pt Anton; letter-spacing: 1pt; text-transform: uppercase; line-height: 1.05; margin: 0.08in 0 0.35in; string-set: chap content(); }
.lead { font-size: 14.5pt; line-height: 1.4; }

.sidebar { border-top: 2pt solid #111; border-bottom: 1pt solid #111; background: #eee; padding: 10pt 14pt 6pt; margin: 14pt 0; break-inside: avoid; font-size: 11pt; }
.sidebar p { text-align: left; hyphens: manual; }
.sb-h { font: 12pt Anton; letter-spacing: 1pt; text-transform: uppercase; margin-bottom: 6pt; }
.small { font-size: 9.5pt; color: #333; }

.fig { margin: 16pt 0; break-inside: avoid; }
.fig img, .fig .ph { display: block; width: 100%; }
.fig.full img, .fig.full .ph { height: auto; }
.fig.half { width: 62%; margin-left: auto; margin-right: auto; }
.fig .ph { height: 3.4in; background: #ddd; border: 1pt solid #999; display: flex; align-items: center; justify-content: center; text-align: center; font: 10pt Anton; letter-spacing: 1pt; color: #666; }
.fig.half .ph { height: 2.6in; }
figcaption { font-size: 10pt; line-height: 1.3; margin-top: 5pt; font-style: italic; }
figcaption .credit { display: block; font-style: normal; font-size: 8.5pt; color: #444; margin-top: 2pt; }

.roll-sec { break-before: right; }
.roll-sec .bm-intro { font-style: italic; }
.rl-cem { font-size: 12pt; margin-top: 16pt; }
.rl-cem span { font: 10pt 'Crimson Text'; text-transform: none; letter-spacing: 0; color: #444; }
ul.roll { list-style: none; padding: 0; margin: 0; columns: 3; column-gap: 0.22in; font-size: 9.2pt; line-height: 1.25; }
ul.roll li { break-inside: avoid; padding-left: 0.8em; text-indent: -0.8em; margin-bottom: 2.2pt; }
ul.roll .rl-d { display: block; color: #333; padding-left: 0.8em; text-indent: 0; }
ul.roll .nee { font-style: italic; }
ul.roll li.rl-letter { font: 11pt Anton; margin: 5pt 0 2pt; text-indent: 0; padding: 0; break-after: avoid; }

.backmatter { break-before: right; }
.bm-intro { text-align: left; }
ol.glance { list-style: none; padding: 0; margin: 0; }
ol.glance li { display: flex; border-bottom: 0.5pt solid #bbb; padding: 4pt 0; break-inside: avoid; font-size: 11pt; }
ol.glance .gl-d { width: 1.45in; flex: none; font-weight: 700; }
ul.src { padding-left: 1em; margin: 0 0 1em; }
ul.src li { font-size: 10pt; margin-bottom: 4pt; text-align: left; }
#sources p, #about p, #research p { text-align: left; }
.notes-page { break-before: page; }
#notes { break-before: right; }
.notes-page .lines { height: 7.6in; background: repeating-linear-gradient(to bottom, transparent 0, transparent 0.32in, #999 0.32in, #999 0.335in); }
.notes-page .lines.tall { height: 9.1in; margin-top: 0.1in; }
"""


def build(kind):
    f = FORMATS[kind]
    parts = [read(f"ms/{n}") for n in sorted(os.listdir(os.path.join(ROOT, "ms"))) if n.endswith(".html")]
    body = "\n".join(parts)
    roll, total = roll_html()
    body = body.replace("<!--ROLL-->", roll).replace("<!--GLANCE-->", glance_html())
    body = figures(body)
    body = toc(body)
    doc = f"<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Wapella: Railway Town, Prairie Crossroads</title></head><body>{body}</body></html>"
    css = CSS(string=CSS_TMPL.replace("{F}", FONTS).replace("{W}", str(f["w"])).replace("{H}", str(f["h"])))
    out = os.path.join(ROOT, "build", f["out"])
    d = HTML(string=doc, base_url=ROOT).render(stylesheets=[css])
    n = len(d.pages)
    if n % 2:  # KDP wants an even page count; finish on a blank verso
        doc = doc.replace("</body>", "<section class='blank' style='page: front; break-before: page'></section></body>")
        d = HTML(string=doc, base_url=ROOT).render(stylesheets=[css])
    d.write_pdf(out, pdf_variant=None)
    print(f"{kind}: {len(d.pages)} pages -> {out}  (roll: {total} names)")
    return out, len(d.pages)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    for k in (sys.argv[1:] or FORMATS):
        build(k)
