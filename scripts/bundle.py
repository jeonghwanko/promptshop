#!/usr/bin/env python3
"""Inline a page and its local ES modules into one self-contained HTML file.

Each local module becomes a function scope that returns its exports, so modules may reuse
the same top-level names. 'three' stays an external import (through the page's import map).
Usage: scripts/bundle.py <page.html> <out.html>
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
IMPORT = re.compile(r"^import\s+(.+?)\s+from\s+'(\.[^']+)';\s*$", re.M)
THREE = re.compile(r"^import \* as THREE from 'three';\s*$", re.M)
order, seen = [], set()

def visit(path):
    path = path.resolve()
    if path in seen: return
    seen.add(path)
    for _, dep in IMPORT.findall(path.read_text()): visit((path.parent / dep))
    order.append(path)

def var(path): return '__m_' + re.sub(r'\W', '_', str(path.relative_to(root)))

def rewrite_imports(text, base):
    def sub(m):
        what, dep = m.group(1), (base / m.group(2)).resolve()
        if what.startswith('{'):
            names = [n.strip() for n in what.strip('{} ').split(',') if n.strip()]
            parts = [f"{a.strip()}: {b.strip()}" if ' as ' in n else n for n in names for a, b in [n.split(' as ') if ' as ' in n else (n, n)]]
            return f"const {{ {', '.join(parts)} }} = {var(dep)};"
        if what.startswith('* as '): return f"const {what[5:].strip()} = {var(dep)};"
        return f"const {what.strip()} = {var(dep)}.default;"
    return IMPORT.sub(sub, THREE.sub('', text))

def module(path):
    text = rewrite_imports(path.read_text(), path.parent)
    names = re.findall(r"^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)", text, re.M)
    text = re.sub(r"^export\s+", "", text, flags=re.M)
    return f"const {var(path)} = (() => {{\n{text}\nreturn {{ {', '.join(names)} }};\n}})();"

page_path = (root / sys.argv[1]).resolve()
page = page_path.read_text()
app = re.search(r'<script type="module">\n(.*?)</script>', page, re.S)
app_text = app.group(1)
for _, dep in IMPORT.findall(app_text): visit(page_path.parent / dep)
body = "import * as THREE from 'three';\n" + "\n".join(module(p) for p in order) + "\n// ---- page ----\n" + rewrite_imports(app_text, page_path.parent)
out = page[:app.start()] + '<script type="module">\n' + body + '</script>' + page[app.end():]
pathlib.Path(sys.argv[2]).write_text(out)
print(sys.argv[2], len(out), 'modules:', len(order))
