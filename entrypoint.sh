#!/bin/sh
set -e

export NODE_ENV=production

# Apply any pending database migrations before starting the server.
# Railway also runs this in the pre-deploy phase; this is a safety net.
node_modules/.bin/prisma migrate deploy

exec node dist/server.js
