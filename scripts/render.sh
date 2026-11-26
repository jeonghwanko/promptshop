#!/usr/bin/env bash
# Render every example spec to out/<id>-<ext|int>.png with headless Chrome.
# Usage: scripts/render.sh [chrome-binary]
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${1:-google-chrome}"
PORT=8766
mkdir -p out
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
for id in $(node -e "import('./examples/specs.js').then(m=>console.log(Object.keys(m.SPECS).join(' ')))"); do
  for view in ext int; do
    "$CHROME" --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
      --user-data-dir="$(mktemp -d)" --virtual-time-budget=8000 \
      --dump-dom "http://127.0.0.1:$PORT/render.html?id=$id&view=$view" 2>/dev/null |
    python3 -c "
import sys, re, json, base64, html
m = re.search(r'<pre id=\"out\">(.*?)</pre>', sys.stdin.read(), re.S)
if not m or not m.group(1).strip(): sys.exit('render failed: $id $view')
j = json.loads(html.unescape(m.group(1)))
open('out/$id-$view.png', 'wb').write(base64.b64decode(j['png'].split(',')[1]))
print('out/$id-$view.png')"
  done
done
