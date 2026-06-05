#!/bin/bash
# iSpyEmails startup script
# Reads ANTHROPIC_API_KEY from .env.local, overriding Claude Desktop's empty system env var
cd "$(dirname "$0")"
export ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d'=' -f2-)
echo "Starting iSpyEmails..."
npm run dev
