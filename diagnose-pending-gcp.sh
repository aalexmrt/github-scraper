#!/bin/bash
# Diagnose pending repositories with GCP secrets
# Usage: ./diagnose-pending-gcp.sh

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
  echo "      PROJECT_ID=\"your-actual-project-id\" ./diagnose-pending-gcp.sh"
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

# Run diagnose script
cd backend
npm run diagnose-pending

