#!/bin/sh
set -e
set -x
echo "=== Starting container ===" >&2
echo "Running database migrations..." >&2
npx prisma migrate deploy || echo "WARNING: Migration failed or already applied, continuing anyway..." >&2
echo "Starting server..." >&2
exec npm start

