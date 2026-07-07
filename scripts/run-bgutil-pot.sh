#!/usr/bin/env bash
# Start bgutil PO Token HTTP server (used by PM2 or manual runs).
set -euo pipefail

BGUTIL_HOME="${BGUTIL_HOME:-$HOME/bgutil-ytdlp-pot-provider}"
DENO="${DENO_PATH:-$HOME/.deno/bin/deno}"
POT_PORT="${YT_DLP_POT_PORT:-4416}"

cd "$BGUTIL_HOME/server/node_modules"
exec "$DENO" run --allow-env --allow-net --allow-ffi=. --allow-read=. ../src/main.ts --port "$POT_PORT"
