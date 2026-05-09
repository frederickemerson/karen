#!/usr/bin/env sh
# Polls the local ngrok API (port 4040) and prints the public tunnel URL.
# Used by `bun run docker:up:ngrok` after containers start.
set -eu

NGROK_API="http://localhost:4040/api/tunnels"
MAX_WAIT=30
elapsed=0

printf "Waiting for ngrok tunnel"
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  url=$(curl -sf "$NGROK_API" 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | sed 's/"public_url":"//;s/"//g') || true
  if [ -n "$url" ]; then
    printf "\n\n  Public site: %s\n\n" "$url"
    exit 0
  fi
  sleep 1
  elapsed=$((elapsed + 1))
  printf "."
done

printf "\nTimed out waiting for ngrok. Check: docker compose logs ngrok\n"
exit 1
