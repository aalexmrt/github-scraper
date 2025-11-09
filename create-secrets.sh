#!/bin/bash
# Create GCP secrets for deployment
# Run this AFTER you've created all accounts and have credentials

set -e

PROJECT_ID="personal-gcp-477623"
REGION="us-east1"

echo "🔐 Creating GCP secrets..."
echo ""
echo "⚠️  Make sure you have these values ready:"
echo "   - DATABASE_URL (from Neon)"
echo "   - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (from Upstash)"
echo "   - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (from Cloudflare)"
echo "   - GITHUB_TOKEN (optional)"
echo ""

read -p "Press Enter when ready to continue..."

# Database URL
read -p "Enter DATABASE_URL (from Neon): " DATABASE_URL
printf '%s' "${DATABASE_URL}" | gcloud secrets create db-url \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${DATABASE_URL}" | gcloud secrets versions add db-url \
  --data-file=- \
  --project=${PROJECT_ID}

# Redis Host
read -p "Enter REDIS_HOST (from Upstash): " REDIS_HOST
printf '%s' "${REDIS_HOST}" | gcloud secrets create redis-host \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${REDIS_HOST}" | gcloud secrets versions add redis-host \
  --data-file=- \
  --project=${PROJECT_ID}

# Redis Port
read -p "Enter REDIS_PORT (default: 6379): " REDIS_PORT
REDIS_PORT=${REDIS_PORT:-6379}
printf '%s' "${REDIS_PORT}" | gcloud secrets create redis-port \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${REDIS_PORT}" | gcloud secrets versions add redis-port \
  --data-file=- \
  --project=${PROJECT_ID}

# Redis Password
read -p "Enter REDIS_PASSWORD (from Upstash): " REDIS_PASSWORD
printf '%s' "${REDIS_PASSWORD}" | gcloud secrets create redis-password \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${REDIS_PASSWORD}" | gcloud secrets versions add redis-password \
  --data-file=- \
  --project=${PROJECT_ID}

# GitHub Token (optional)
read -p "Enter GITHUB_TOKEN (optional, press Enter to skip): " GITHUB_TOKEN
if [ -n "${GITHUB_TOKEN}" ]; then
  printf '%s' "${GITHUB_TOKEN}" | gcloud secrets create github-token \
    --data-file=- \
    --project=${PROJECT_ID} || \
    printf '%s' "${GITHUB_TOKEN}" | gcloud secrets versions add github-token \
    --data-file=- \
    --project=${PROJECT_ID}
fi

# R2 Account ID
read -p "Enter R2_ACCOUNT_ID (from Cloudflare): " R2_ACCOUNT_ID
printf '%s' "${R2_ACCOUNT_ID}" | gcloud secrets create r2-account-id \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${R2_ACCOUNT_ID}" | gcloud secrets versions add r2-account-id \
  --data-file=- \
  --project=${PROJECT_ID}

# R2 Access Key ID
read -p "Enter R2_ACCESS_KEY_ID (from Cloudflare): " R2_ACCESS_KEY_ID
printf '%s' "${R2_ACCESS_KEY_ID}" | gcloud secrets create r2-access-key \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${R2_ACCESS_KEY_ID}" | gcloud secrets versions add r2-access-key \
  --data-file=- \
  --project=${PROJECT_ID}

# R2 Secret Access Key
read -p "Enter R2_SECRET_ACCESS_KEY (from Cloudflare): " R2_SECRET_ACCESS_KEY
printf '%s' "${R2_SECRET_ACCESS_KEY}" | gcloud secrets create r2-secret-key \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${R2_SECRET_ACCESS_KEY}" | gcloud secrets versions add r2-secret-key \
  --data-file=- \
  --project=${PROJECT_ID}

# R2 Bucket Name
read -p "Enter R2_BUCKET_NAME (default: github-repos): " R2_BUCKET_NAME
R2_BUCKET_NAME=${R2_BUCKET_NAME:-github-repos}
printf '%s' "${R2_BUCKET_NAME}" | gcloud secrets create r2-bucket \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${R2_BUCKET_NAME}" | gcloud secrets versions add r2-bucket \
  --data-file=- \
  --project=${PROJECT_ID}

echo ""
echo "✅ All secrets created!"
echo ""
echo "📋 Verify secrets:"
echo "   gcloud secrets list --project=${PROJECT_ID}"

