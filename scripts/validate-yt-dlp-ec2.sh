#!/usr/bin/env bash
# Diagnose yt-dlp + YouTube setup on EC2.
set -euo pipefail

YT_DLP="${YT_DLP_PATH:-/usr/local/bin/yt-dlp}"
DENO="${DENO_PATH:-$HOME/.deno/bin/deno}"
COOKIES="${YT_DLP_COOKIES_FILE:-$HOME/HomesDrives/.data/youtube-cookies.txt}"
TEST_URL="${1:-https://www.youtube.com/watch?v=WerQABDxisM}"

echo "=== yt-dlp version ==="
"$YT_DLP" --version

echo ""
echo "=== PO Token providers (need bgutil:http in list) ==="
"$YT_DLP" -v --skip-download "$TEST_URL" 2>&1 | grep -i 'PO Token Providers' || echo "NONE — run: bash scripts/setup-yt-dlp-pot-ec2.sh"

echo ""
echo "=== bgutil POT server ==="
if curl -fsS --max-time 2 http://127.0.0.1:4416/ >/dev/null 2>&1; then
  echo "OK — http://127.0.0.1:4416"
else
  echo "NOT RUNNING — pm2 start bgutil-pot or bash scripts/setup-yt-dlp-pot-ec2.sh"
fi

echo ""
echo "=== Cookies file ==="
if [ -f "$COOKIES" ]; then
  echo "Found: $COOKIES ($(wc -l < "$COOKIES") lines)"
  grep -c '\.youtube\.com' "$COOKIES" | xargs -I{} echo "youtube.com cookie lines: {}"
else
  echo "MISSING: $COOKIES"
  echo "Bot check on AWS IPs usually needs fresh youtube.com cookies."
fi

if grep -q '^YT_DLP_SKIP_COOKIES=1' "$HOME/HomesDrives/.env" 2>/dev/null; then
  echo "WARNING: YT_DLP_SKIP_COOKIES=1 is set — cookies will be ignored"
fi

echo ""
echo "=== Test without cookies (often fails on EC2) ==="
set +e
"$YT_DLP" --js-runtimes "deno:$DENO" \
  --extractor-args 'youtube:player_client=default,mweb' \
  -f 'bestaudio[protocol!=m3u8_native]/bestaudio/best' \
  --skip-download \
  -o /tmp/yt-test.%(ext)s \
  "$TEST_URL" 2>&1 | tail -3
NO_COOKIE_EXIT=$?
set -e

if [ -f "$COOKIES" ]; then
  echo ""
  echo "=== Test WITH cookies ==="
  set +e
  "$YT_DLP" --js-runtimes "deno:$DENO" \
    --cookies "$COOKIES" \
    -f 'bestaudio[protocol!=m3u8_native]/bestaudio/best' \
    -o /tmp/yt-test.%(ext)s \
    "$TEST_URL" 2>&1 | tail -5
  COOKIE_EXIT=$?
  set -e
  ls -la /tmp/yt-test* 2>/dev/null || echo "No output file"
  if [ "$COOKIE_EXIT" -eq 0 ]; then
    echo "SUCCESS with cookies"
  fi
fi

if [ "$NO_COOKIE_EXIT" -ne 0 ] && [ ! -f "$COOKIES" ]; then
  echo ""
  echo "Next: export youtube.com-only cookies and upload:"
  echo "  curl -X PUT http://127.0.0.1:8001/api/reels-maker/youtube/cookies \\"
  echo "    -H 'x-reels-api-secret: YOUR_SECRET' \\"
  echo "    -H 'Content-Type: text/plain' \\"
  echo "    --data-binary @cookies.txt"
fi
