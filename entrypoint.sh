#!/bin/sh
set -e

export NODE_ENV=production

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

exec node dist/server.js
