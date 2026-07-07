#!/usr/bin/env bash
# Install bgutil PO Token provider for yt-dlp on EC2 (bypasses YouTube bot checks).
# Run from repo root: bash scripts/setup-yt-dlp-pot-ec2.sh
set -euo pipefail

BGUTIL_VERSION="${BGUTIL_VERSION:-1.3.1}"
BGUTIL_HOME="${BGUTIL_HOME:-$HOME/bgutil-ytdlp-pot-provider}"
DENO="${DENO_PATH:-$HOME/.deno/bin/deno}"
YT_DLP="${YT_DLP_PATH:-/usr/local/bin/yt-dlp}"
PLUGIN_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/yt-dlp/plugins"
POT_PORT="${YT_DLP_POT_PORT:-4416}"

echo "==> Installing bgutil yt-dlp plugin to $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
curl -fsSL -o /tmp/bgutil-ytdlp-pot-provider.zip \
  "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip"
unzip -o /tmp/bgutil-ytdlp-pot-provider.zip -d "$PLUGIN_DIR"

echo "==> Cloning bgutil POT HTTP server (v${BGUTIL_VERSION})"
if [ ! -d "$BGUTIL_HOME/.git" ]; then
  git clone --single-branch --branch "$BGUTIL_VERSION" \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$BGUTIL_HOME"
else
  git -C "$BGUTIL_HOME" fetch --tags
  git -C "$BGUTIL_HOME" checkout "$BGUTIL_VERSION"
fi

echo "==> Building server with Deno"
cd "$BGUTIL_HOME/server"
"$DENO" install --allow-scripts=npm:canvas --frozen

echo "==> Starting POT HTTP server on 127.0.0.1:${POT_PORT} via PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found; start the server manually:"
  echo "  cd $BGUTIL_HOME/server/node_modules"
  echo "  $DENO run --allow-env --allow-net --allow-ffi=. --allow-read=. ../src/main.ts --port ${POT_PORT}"
  exit 0
fi

pm2 delete bgutil-pot 2>/dev/null || true
pm2 start "$DENO" \
  --name bgutil-pot \
  --cwd "$BGUTIL_HOME/server/node_modules" \
  -- run --allow-env --allow-net --allow-ffi=. --allow-read=. ../src/main.ts --port "$POT_PORT"
pm2 save

sleep 2
curl -fsS "http://127.0.0.1:${POT_PORT}/" >/dev/null || {
  echo "POT server did not respond on port ${POT_PORT}"
  pm2 logs bgutil-pot --lines 30
  exit 1
}

echo "==> Verifying yt-dlp sees PO providers"
"$YT_DLP" -v --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | grep -i 'PO Token Providers' || true

echo ""
echo "Done. Add to ~/HomesDrives/.env:"
echo "  YT_DLP_POT_ENABLED=1"
echo "  YT_DLP_POT_BASE_URL=http://127.0.0.1:${POT_PORT}"
echo "  YT_DLP_COOKIES_FILE=/root/HomesDrives/.data/youtube-cookies.txt"
echo ""
echo "POT prevents stream 403s. You still need fresh youtube.com cookies for the bot check on AWS."
echo ""
echo "Then: pm2 restart reels-api --update-env"
echo ""
echo "Test download:"
echo "  $YT_DLP --js-runtimes deno:$DENO \\"
echo "    --extractor-args 'youtube:player_client=default,mweb' \\"
echo "    -f 'bestaudio[protocol!=m3u8_native]/bestaudio/best' \\"
echo "    -o /tmp/test.%(ext)s 'https://www.youtube.com/watch?v=WerQABDxisM'"
