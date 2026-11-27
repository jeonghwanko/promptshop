#!/usr/bin/env bash
# Release the committed HEAD to the VM (docs/DEPLOY.md): a tarball of the commit with server deps (and dist/ when
# scripts/build-site.mjs made one), a new folder under /opt/we-oddbout/releases, the `current` link, a restart.
# DATA_DIR and /opt/we-oddbout/env stay. Usage: scripts/release.sh [user@host]   (default ubuntu@168.110.25.61)
set -euo pipefail
HOST=${1:-ubuntu@168.110.25.61}
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "commit first: the release is HEAD"; exit 1; }
SHA=$(git rev-parse --short=12 HEAD); WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/r"; git archive HEAD | tar -x -C "$WORK/r"
(cd "$WORK/r/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
[ -f dist/main.js ] && cp -r dist "$WORK/r/dist"
tar -czf "$WORK/r.tgz" -C "$WORK/r" .
scp -q "$WORK/r.tgz" "$HOST:/tmp/we-$SHA.tgz"
ssh -o BatchMode=yes "$HOST" "set -e; R=/opt/we-oddbout/releases/$SHA; mkdir -p \$R && tar -xzf /tmp/we-$SHA.tgz -C \$R && rm /tmp/we-$SHA.tgz
  ln -sfn \$R /opt/we-oddbout/current && sudo systemctl restart we-oddbout && sleep 2 && systemctl is-active we-oddbout"
curl -s -o /dev/null -w "https://we.oddbout.com/ %{http_code}\n" https://we.oddbout.com/
echo "released $SHA. Back: ssh $HOST 'ln -sfn /opt/we-oddbout/releases/<old sha> /opt/we-oddbout/current && sudo systemctl restart we-oddbout'"
