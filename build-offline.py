#!/usr/bin/env python3
"""Build a fully self-contained copy of slidedeck.html.

The app already bundles marked.js and qrcodejs, but it still pulls Mermaid,
KaTeX and the Material Symbols icon font from a CDN. Without a network those
three fail silently: no diagrams, no formulas, and every toolbar button shows
its name in plain text instead of an icon.

This script fetches them once and writes slidedeck-offline.html with
everything inlined, fonts included as data URIs. Standard library only.

    python3 build-offline.py                 # everything, ~4.7 MB
    python3 build-offline.py --no-mermaid    # ~1.1 MB, diagrams disabled
    python3 build-offline.py --clean         # ignore the download cache

The source file is never modified.
"""

import argparse
import base64
import re
import sys
import urllib.request
from pathlib import Path

MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
KATEX_BASE = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist"
KATEX_JS_URL = f"{KATEX_BASE}/katex.min.js"
KATEX_AUTO_URL = f"{KATEX_BASE}/contrib/auto-render.min.js"
KATEX_CSS_URL = f"{KATEX_BASE}/katex.min.css"
SYMBOLS_CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,600,0,0"
)
# Google Fonts serves woff2 only to a browser-like client.
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def fetch(url: str, cache_dir: Path, name: str, clean: bool = False) -> bytes:
    """Download once, then reuse the copy in the cache directory."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / name
    if cached.exists() and not clean:
        return cached.read_bytes()
    request = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    cached.write_bytes(data)
    return data


def data_uri(payload: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def inline_script(js: bytes, label: str) -> str:
    """A closing tag inside the library's source would end the block early."""
    text = js.decode("utf-8").replace("</script", "<\\/script")
    return f'  <!-- {label} inlined for offline use -->\n  <script>\n{text}\n  </script>'


def replace_tag(html: str, url: str, replacement: str, label: str) -> str:
    """Swap the whole <link>/<script> tag that carries this URL."""
    pattern = re.compile(r"[ \t]*<(?:link|script)\b[^>]*" + re.escape(url) + r"[^>]*>(?:</script>)?")
    html, count = pattern.subn(lambda _: replacement, html, count=1)
    if count != 1:
        sys.exit(f"Tag not found for {label} ({url}) — has the source file changed?")
    return html


def build_katex_css(cache: Path, clean: bool) -> str:
    css = fetch(KATEX_CSS_URL, cache, "katex.min.css", clean).decode("utf-8")
    for font in sorted(set(re.findall(r"fonts/(KaTeX_[\w-]+\.woff2)", css))):
        payload = fetch(f"{KATEX_BASE}/fonts/{font}", cache, font, clean)
        css = css.replace(f"fonts/{font}", data_uri(payload, "font/woff2"))
    # woff2 covers every browser this app runs in; drop the legacy fallbacks
    # rather than embedding the same glyphs three times over.
    css = re.sub(r",\s*url\(fonts/[^)]+\)\s*format\(\"(?:woff|truetype)\"\)", "", css)
    return f'  <!-- KaTeX 0.16.11 stylesheet and fonts inlined for offline use -->\n  <style>\n{css}\n  </style>'


def build_symbols_css(cache: Path, clean: bool) -> str:
    css = fetch(SYMBOLS_CSS_URL, cache, "material-symbols.css", clean).decode("utf-8")
    urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", css)
    if not urls:
        sys.exit("No woff2 font found in the Material Symbols stylesheet.")
    for font_url in sorted(set(urls)):
        payload = fetch(font_url, cache, "material-symbols.woff2", clean)
        css = css.replace(font_url, data_uri(payload, "font/woff2"))
    return f'  <!-- Material Symbols icon font inlined for offline use -->\n  <style>\n{css}\n  </style>'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", default="slidedeck.html", type=Path)
    parser.add_argument("-o", "--output", default=None, type=Path)
    parser.add_argument("--no-mermaid", action="store_true",
                        help="leave Mermaid out: the app then renders mermaid blocks as plain code")
    parser.add_argument("--cache", default=Path(".vendor"), type=Path)
    parser.add_argument("--clean", action="store_true", help="re-download everything")
    args = parser.parse_args()

    output = args.output or args.source.with_name(args.source.stem + "-offline.html")
    if not args.source.exists():
        sys.exit(f"Source file not found: {args.source}")
    html = args.source.read_text(encoding="utf-8")

    html = replace_tag(html, KATEX_CSS_URL, build_katex_css(args.cache, args.clean), "KaTeX CSS")
    html = replace_tag(html, SYMBOLS_CSS_URL, build_symbols_css(args.cache, args.clean), "Material Symbols")

    if args.no_mermaid:
        html = replace_tag(html, MERMAID_URL, "  <!-- Mermaid left out of this build -->", "Mermaid")
    else:
        mermaid = fetch(MERMAID_URL, args.cache, "mermaid.min.js", args.clean)
        html = replace_tag(html, MERMAID_URL, inline_script(mermaid, "Mermaid 11"), "Mermaid")

    katex = fetch(KATEX_JS_URL, args.cache, "katex.min.js", args.clean)
    html = replace_tag(html, KATEX_JS_URL, inline_script(katex, "KaTeX 0.16.11"), "KaTeX JS")
    auto = fetch(KATEX_AUTO_URL, args.cache, "auto-render.min.js", args.clean)
    html = replace_tag(html, KATEX_AUTO_URL, inline_script(auto, "KaTeX auto-render 0.16.11"), "KaTeX auto-render")

    leftovers = sorted(set(re.findall(r"https://(?:cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)[^\"')\s]*", html)))
    if leftovers:
        print("Warning: external references still in the file:", file=sys.stderr)
        for url in leftovers:
            print("  " + url, file=sys.stderr)

    output.write_text(html, encoding="utf-8")
    print(f"{output} — {output.stat().st_size / 1024 / 1024:.2f} MB "
          f"(source {args.source.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
