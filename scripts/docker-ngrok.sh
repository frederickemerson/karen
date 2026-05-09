#!/usr/bin/env bash
# Load .env.local into the shell so Docker Compose picks up NGROK_AUTHTOKEN and VITE_* build args.
# Usage: sh scripts/docker-ngrok.sh
set -eu

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env.local and fill it in."
  exit 1
fi

# Export every non-comment, non-blank line as env var.
set -o allexport
# shellcheck source=/dev/null
. "$ENV_FILE"
set +o allexport

echo "Building containers with Convex + ngrok profile..."
docker compose --profile ngrok up --build -d

sh scripts/ngrok-url.sh
