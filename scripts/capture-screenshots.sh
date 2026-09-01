#!/usr/bin/env bash
# Regenerates the plugin configuration-page screenshots.
#
# Usage:
#   scripts/capture-screenshots.sh                     all plugins
#   scripts/capture-screenshots.sh --only=seerr-proxy  one plugin
#   scripts/capture-screenshots.sh --keep              leave the container up
#
# Needs docker and node. The PNGs are written into each plugin's own repo, so
# review and commit them there.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here/screenshots"

if ! docker info >/dev/null 2>&1; then
    echo "docker is not available; the screenshots are rendered inside a Jellyfin container." >&2
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install --silent
    npx playwright install chromium
fi

exec node capture.mjs "$@"
