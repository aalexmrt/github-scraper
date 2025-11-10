#!/bin/bash
# Clean up queue and database - keep only specific repository
# Usage: ./cleanup-keep-repo.sh [REPO_URL]

set -e

PROJECT_ID="personal-gcp-477623"
REPO_URL="${1:-https://github.com/aalexmrt/github-scraper}"

echo "🧹 Cleaning up queue - keeping only: ${REPO_URL}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Fetch secrets from GCP Secret Manager
echo "🔐 Fetching secrets from GCP Secret Manager..."
export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_TLS="true"
export GITHUB_TOKEN=$(gcloud secrets versions access latest --secret="github-token" --project=${PROJECT_ID} 2>/dev/null || echo "")

if [ -z "$DATABASE_URL" ] || [ -z "$REDIS_HOST" ]; then
  echo "❌ Error: Could not fetch required secrets from GCP"
  exit 1
fi

echo "✅ Secrets fetched"
echo ""

# Run cleanup script
cd backend
npx ts-node scripts/cleanupQueueKeepSpecificRepo.ts "$REPO_URL"

echo ""
echo "✅ Cleanup complete! Only ${REPO_URL} remains in the queue."

