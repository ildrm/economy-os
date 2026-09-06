#!/usr/bin/env bash
set -euo pipefail

# Resolve the checkout even when launched from another directory or a path with spaces.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required. Install the version listed in .node-version, then run this file again.' >&2
  exit 1
fi

exec node scripts/run-local.mjs "$@"
