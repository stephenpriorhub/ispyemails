#!/bin/sh
set -e

# Write DATABASE_URL to /tmp/.env (writable by non-root user)
# so prisma.config.ts dotenv/config picks it up at load time
echo "DATABASE_URL=${DATABASE_URL}" > /tmp/.env

echo "Running Prisma migrations..."
DOTENV_CONFIG_PATH=/tmp/.env node node_modules/prisma/build/index.js migrate deploy

echo "Starting iSpyEmails..."
exec node server.js
