#!/bin/bash
# Check queue status with GCP secrets
# Usage: ./check-queue-gcp.sh

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔐 Fetching secrets from GCP Secret Manager..."
echo ""

# Fetch all required secrets
export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_TLS="true"

# Check if critical secrets were fetched
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: Could not fetch DATABASE_URL from GCP Secret Manager"
  echo "   Make sure you're authenticated: gcloud auth login"
  exit 1
fi

if [ -z "$REDIS_HOST" ]; then
  echo "❌ Error: Could not fetch REDIS_HOST from GCP Secret Manager"
  exit 1
fi

echo "✅ Secrets fetched"
echo ""

# Run check-queue script
cd backend
npm run check-queue

