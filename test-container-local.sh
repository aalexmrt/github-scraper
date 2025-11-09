#!/bin/bash
# Test the Cloud Run container locally with real secrets

set -e

PROJECT_ID="personal-gcp-477623"

echo "🔐 Fetching secrets from GCP Secret Manager..."

# Fetch all secrets
DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID})
REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID})
REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID})
REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID})
SESSION_SECRET=$(gcloud secrets versions access latest --secret="session-secret" --project=${PROJECT_ID})
GITHUB_TOKEN=$(gcloud secrets versions access latest --secret="github-token" --project=${PROJECT_ID} 2>/dev/null || echo "")
R2_ACCOUNT_ID=$(gcloud secrets versions access latest --secret="r2-account-id" --project=${PROJECT_ID})
R2_ACCESS_KEY_ID=$(gcloud secrets versions access latest --secret="r2-access-key" --project=${PROJECT_ID})
R2_SECRET_ACCESS_KEY=$(gcloud secrets versions access latest --secret="r2-secret-key" --project=${PROJECT_ID})
R2_BUCKET_NAME=$(gcloud secrets versions access latest --secret="r2-bucket" --project=${PROJECT_ID})

echo "✅ Secrets fetched"
echo ""
echo "🐳 Running container locally..."
echo ""

docker run --rm -it \
  -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e REDIS_HOST="${REDIS_HOST}" \
  -e REDIS_PORT="${REDIS_PORT}" \
  -e REDIS_PASSWORD="${REDIS_PASSWORD}" \
  -e REDIS_TLS="true" \
  -e SESSION_SECRET="${SESSION_SECRET}" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -e USE_R2_STORAGE="true" \
  -e R2_ACCOUNT_ID="${R2_ACCOUNT_ID}" \
  -e R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
  -e R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
  -e R2_BUCKET_NAME="${R2_BUCKET_NAME}" \
  -e FRONTEND_URL="http://localhost:3001" \
  -e BACKEND_URL="http://localhost:8080" \
  gcr.io/personal-gcp-477623/api:latest
