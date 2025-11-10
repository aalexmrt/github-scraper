#!/bin/bash
# Load secrets from GCP and run worker test
# This script fetches secrets from GCP Secret Manager and exports them as environment variables

set -e

PROJECT_ID="personal-gcp-477623"
REPO_URL="${1:-https://github.com/aalexmrt/github-scraper}"

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
  echo "   And have access to secrets: gcloud secrets list --project=${PROJECT_ID}"
  exit 1
fi

if [ -z "$REDIS_HOST" ]; then
  echo "❌ Error: Could not fetch REDIS_HOST from GCP Secret Manager"
  exit 1
fi

echo "✅ Secrets fetched successfully"
echo ""

# Change to backend directory
cd backend

# Run the test worker script
echo "🧪 Running worker test with repository: ${REPO_URL}"
echo ""
npm run test-worker "$REPO_URL"

