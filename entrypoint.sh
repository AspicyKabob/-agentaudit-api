#!/bin/sh
set -e

# Run Prisma migrations
echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

# Start the application
echo "Starting server..."
exec node dist/server.js
