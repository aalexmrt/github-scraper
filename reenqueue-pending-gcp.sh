#!/bin/bash
# Re-enqueue pending repositories with GCP secrets
# Usage: ./reenqueue-pending-gcp.sh

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Validate PROJECT_ID
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is not set!"
  echo ""
  echo "   Please set it using one of these methods:"
  echo "   1. Set environment variable:"
  echo "      export PROJECT_ID=\"your-actual-project-id\""
  echo ""
  echo "   2. Set via gcloud config:"
  echo "      gcloud config set project YOUR_PROJECT_ID"
  echo ""
  echo "   3. Pass it inline:"
  echo "      PROJECT_ID=\"your-actual-project-id\" ./reenqueue-pending-gcp.sh"
  echo ""
  exit 1
fi

echo "🔐 Fetching secrets from GCP Secret Manager..."
echo ""

# Fetch all required secrets
export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_TLS="true"  # Upstash requires TLS
export GITHUB_TOKEN=$(gcloud secrets versions access latest --secret="github-token" --project=${PROJECT_ID} 2>/dev/null || echo "")

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

echo "✅ Secrets fetched"
echo ""

# Run the reenqueue script
cd backend
npm run reenqueue-pending

