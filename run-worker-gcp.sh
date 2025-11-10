#!/bin/bash
# Run worker with GCP secrets - processes one job from queue
# Usage: ./run-worker-gcp.sh

set -e

PROJECT_ID="personal-gcp-477623"

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
export REDIS_TLS="true"  # Upstash requires TLS
export GITHUB_TOKEN=$(gcloud secrets versions access latest --secret="github-token" --project=${PROJECT_ID} 2>/dev/null || echo "")
export SESSION_SECRET=$(gcloud secrets versions access latest --secret="session-secret" --project=${PROJECT_ID} 2>/dev/null || echo "")

# R2 Storage credentials (for production storage)
export USE_R2_STORAGE="true"
export R2_ACCOUNT_ID=$(gcloud secrets versions access latest --secret="r2-account-id" --project=${PROJECT_ID} 2>/dev/null || echo "")
export R2_ACCESS_KEY_ID=$(gcloud secrets versions access latest --secret="r2-access-key" --project=${PROJECT_ID} 2>/dev/null || echo "")
export R2_SECRET_ACCESS_KEY=$(gcloud secrets versions access latest --secret="r2-secret-key" --project=${PROJECT_ID} 2>/dev/null || echo "")
export R2_BUCKET_NAME=$(gcloud secrets versions access latest --secret="r2-bucket" --project=${PROJECT_ID} 2>/dev/null || echo "")

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

if [ -z "$R2_ACCOUNT_ID" ]; then
  echo "⚠️  Warning: R2 credentials not found. Using filesystem storage instead."
  echo "   For local testing, you may need to create /data/repos directory"
  export USE_R2_STORAGE="false"
fi

echo "✅ Secrets fetched successfully"
echo ""

# Change to backend directory
cd backend

# Run the Cloud Run worker (processes one job)
echo "🚀 Running Cloud Run worker..."
echo "   This will process ONE job from the queue and exit"
echo ""
npm run dev:cloudrun-worker

