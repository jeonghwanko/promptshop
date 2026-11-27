#!/usr/bin/env bash
# Copy the VM's backups (server/backup.mjs) to this machine, so they outlive the VM's disk.
# Usage: scripts/pull-backup.sh [user@host] [dir]   (default ubuntu@168.110.25.61, ~/backups/we-oddbout). Keeps 60 days here.
set -euo pipefail
HOST=${1:-ubuntu@168.110.25.61}; DIR=${2:-$HOME/backups/we-oddbout}
mkdir -p "$DIR"; chmod 700 "$DIR"
ssh -o BatchMode=yes "$HOST" 'cd /opt/we-oddbout/backups && tar -cf - isles-*.db.gz secret og 2>/dev/null' | tar -xf - -C "$DIR"
chmod 600 "$DIR"/secret 2>/dev/null || true
ls "$DIR"/isles-*.db.gz | sort | head -n -60 | xargs -r rm --
echo "$(date '+%F %T') pulled: $(ls "$DIR"/isles-*.db.gz | wc -l) days, latest $(ls "$DIR"/isles-*.db.gz | sort | tail -1 | xargs basename)"
