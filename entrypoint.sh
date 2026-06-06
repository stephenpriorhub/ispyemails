#!/bin/sh
set -e

# Write DATABASE_URL to .env so prisma.config.ts can read it at runtime
# (Prisma 7 evaluates config at load time; this ensures the value is available)
echo "DATABASE_URL=${DATABASE_URL}" > /app/.env

echo "Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

# Remove .env so the app doesn't use it (Next.js uses injected env vars directly)
rm -f /app/.env

echo "Starting iSpyEmails..."
exec node server.js
