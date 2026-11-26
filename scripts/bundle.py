#!/usr/bin/env python3
"""Inline build.html and its modules into one self-contained HTML file (for hosts that only take one file)."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
mods = ['src/builder.js', 'src/render.js', 'src/steps.js', 'src/stage.js', 'examples/specs.js']
code = ["import * as THREE from 'three';"]
for m in mods:
    s = (root / m).read_text()
    s = re.sub(r"^import .*?;\n", "", s, flags=re.M)
    s = re.sub(r"^export (function|const|class|async function)", r"\1", s, flags=re.M)
    if m == 'src/stage.js':
        s = s.replace("const PPU = TILE_PX / Math.SQRT2;\n", "")
    code.append(f"// ---- {m} ----\n{s}")
page = (root / 'build.html').read_text()
app = re.search(r'<script type="module">\n(.*?)</script>', page, re.S)
body = re.sub(r"^import .*?;\n", "", app.group(1), flags=re.M)
bundled = '<script type="module">\n' + '\n'.join(code) + '\n// ---- app ----\n' + body + '</script>'
out = page[:app.start()] + bundled + page[app.end():]
pathlib.Path(sys.argv[1]).write_text(out)
print(sys.argv[1], len(out))
