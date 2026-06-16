#!/bin/sh
set -e

export NODE_ENV=production

echo "Cleaning up previously failed migrations..."
node_modules/.bin/prisma migrate resolve --rolled-back "20260615133307_add_policy_version_table" || true

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

exec node dist/server.js
