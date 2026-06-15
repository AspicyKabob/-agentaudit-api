#!/bin/sh
set -e

export NODE_ENV=production

echo "Running database migrations..."
if ! node_modules/.bin/prisma migrate deploy; then
  LATEST_MIGRATION=$(ls -1 prisma/migrations | grep -E '^[0-9]{14}_.*' | sort | tail -n 1)
  echo "Migration deploy failed; marking ${LATEST_MIGRATION} rolled back and retrying..."
  node_modules/.bin/prisma migrate resolve --rolled-back "${LATEST_MIGRATION}" || true
  node_modules/.bin/prisma migrate deploy
fi

exec node dist/server.js
