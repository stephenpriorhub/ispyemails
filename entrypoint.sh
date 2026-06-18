#!/bin/sh
set -e
echo "Running Prisma migrations..."
# Use the locally-installed prisma binary (not npx) so the container does not
# re-download the CLI on every start. DATABASE_URL is provided by Railway.
node node_modules/prisma/build/index.js migrate deploy
echo "Starting iSpyEmails..."
exec node server.js
