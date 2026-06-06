#!/bin/sh
set -e

export NODE_ENV=production

# Run Prisma migrations
echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

# Start the application
echo "Starting server..."
exec node dist/server.js
