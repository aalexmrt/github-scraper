#!/bin/sh
set -e
set -x

# Helper function to log with timestamp
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "=== Starting container ==="
log "Environment check:"
log "  NODE_ENV: ${NODE_ENV:-not set}"
log "  PORT: ${PORT:-not set}"
log "  DATABASE_URL: ${DATABASE_URL:+set (hidden)}"
log "  REDIS_HOST: ${REDIS_HOST:-not set}"
log "  APP_VERSION: ${APP_VERSION:-not set (will use package.json)}"

log "Step 1: Verifying dependencies are installed..."
# Check for critical dependencies
if [ ! -d "node_modules" ] || \
   [ ! -f "node_modules/.bin/prisma" ] || \
   [ ! -d "node_modules/fastify" ]; then
  log "❌ ERROR: Critical dependencies missing (node_modules, prisma, or fastify)"
  log "   This indicates the Docker image was not built correctly."
  log "   Please rebuild the image with: git tag api-v<VERSION> && git push origin api-v<VERSION>"
  exit 1
fi
log "✅ Dependencies verified (node_modules, prisma, fastify all present)"

log "Step 2: Verifying Prisma client..."
if npx prisma generate; then
  log "✅ Prisma client generated"
else
  log "⚠️  WARNING: Prisma generate failed, but continuing..."
fi

log "Step 3: Running database migrations..."
# Use direct path to avoid npx downloading prisma again
if ./node_modules/.bin/prisma migrate deploy; then
  log "✅ Database migrations completed successfully"
else
  log "⚠️  WARNING: Migration failed or already applied, continuing anyway..."
fi

log "Step 4: Starting server on port ${PORT:-3000}..."
log "Server will listen on: 0.0.0.0:${PORT:-3000}"
# Run node directly to avoid npm's version output (which shows package.json version)
# This ensures only our application logs the correct version from APP_VERSION env var
exec node dist/src/index.js

