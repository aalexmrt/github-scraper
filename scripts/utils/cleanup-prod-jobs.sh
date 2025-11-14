#!/bin/bash
# Clean up failed and queued jobs from production
# Usage: ./cleanup-prod-jobs.sh

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"

echo "🧹 Cleaning up failed and queued jobs from production..."
echo ""

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
  echo "❌ Error: Please run this script from the project root directory"
  exit 1
fi

# Load environment variables if .env exists
if [ -f "backend/.env" ]; then
  echo "📋 Loading environment variables from backend/.env..."
  export $(cat backend/.env | grep -v '^#' | xargs)
fi

# Fetch secrets from GCP Secret Manager if not set
if [ -z "$DATABASE_URL" ]; then
  echo "📥 Fetching DATABASE_URL from GCP Secret Manager..."
  export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
fi

if [ -z "$REDIS_HOST" ]; then
  echo "📥 Fetching Redis credentials from GCP Secret Manager..."
  export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
  export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
  export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
  export REDIS_TLS="true"
fi

# Verify required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL not set and could not fetch from GCP Secret Manager"
  echo "   Make sure you're authenticated: gcloud auth login"
  exit 1
fi

if [ -z "$REDIS_HOST" ]; then
  echo "❌ Error: REDIS_HOST not set and could not fetch from GCP Secret Manager"
  echo "   Make sure you're authenticated: gcloud auth login"
  exit 1
fi

echo ""
echo "🚀 Running cleanup script..."
echo ""

cd backend
npx ts-node scripts/cleanupFailedAndQueuedJobs.ts

echo ""
echo "✅ Cleanup script completed!"

