#!/bin/sh
set -e

if [ -z "${AUTH_SECRET:-}" ]; then
  SECRET_FILE="${AUTH_SECRET_FILE:-/data/auth_secret}"
  if [ -f "$SECRET_FILE" ]; then
    AUTH_SECRET="$(cat "$SECRET_FILE")"
  else
    AUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
    mkdir -p "$(dirname "$SECRET_FILE")"
    printf '%s' "$AUTH_SECRET" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
  fi
  export AUTH_SECRET
fi

exec node server.js
