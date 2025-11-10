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
echo "   - SESSION_SECRET (generate with: openssl rand -base64 32)"
echo "   - GITHUB_TOKEN (optional)"
echo "   - GITHUB_CLIENT_ID (from Production GitHub OAuth App)"
echo "   - GITHUB_CLIENT_SECRET (from Production GitHub OAuth App)"
echo "   - FRONTEND_URL (your Vercel production URL, e.g., https://your-app.vercel.app)"
echo "   - BACKEND_URL (your Cloud Run URL, e.g., https://api-xxx.run.app)"
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

# Session Secret (required for authentication)
read -p "Enter SESSION_SECRET (generate with: openssl rand -base64 32): " SESSION_SECRET
if [ -z "${SESSION_SECRET}" ]; then
  echo "⚠️  SESSION_SECRET is empty. Generating one now..."
  SESSION_SECRET=$(openssl rand -base64 32)
  echo "✅ Generated SESSION_SECRET: ${SESSION_SECRET}"
fi
printf '%s' "${SESSION_SECRET}" | gcloud secrets create session-secret \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${SESSION_SECRET}" | gcloud secrets versions add session-secret \
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

# GitHub OAuth Client ID (Production)
echo ""
echo "🔐 GitHub OAuth Credentials (Production)"
echo "   Make sure you've created a Production OAuth App with callback URL:"
echo "   https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback"
read -p "Enter GITHUB_CLIENT_ID (Production): " GITHUB_CLIENT_ID
if [ -n "${GITHUB_CLIENT_ID}" ]; then
  printf '%s' "${GITHUB_CLIENT_ID}" | gcloud secrets create github-client-id \
    --data-file=- \
    --project=${PROJECT_ID} || \
    printf '%s' "${GITHUB_CLIENT_ID}" | gcloud secrets versions add github-client-id \
    --data-file=- \
    --project=${PROJECT_ID}
fi

# GitHub OAuth Client Secret (Production)
read -p "Enter GITHUB_CLIENT_SECRET (Production): " GITHUB_CLIENT_SECRET
if [ -n "${GITHUB_CLIENT_SECRET}" ]; then
  printf '%s' "${GITHUB_CLIENT_SECRET}" | gcloud secrets create github-client-secret \
    --data-file=- \
    --project=${PROJECT_ID} || \
    printf '%s' "${GITHUB_CLIENT_SECRET}" | gcloud secrets versions add github-client-secret \
    --data-file=- \
    --project=${PROJECT_ID}
fi

# Frontend URL (Vercel)
echo ""
echo "🌐 Frontend URL (Vercel)"
echo "   Your Vercel production URL (e.g., https://github-scraper-xxx.vercel.app)"
read -p "Enter FRONTEND_URL: " FRONTEND_URL
if [ -z "${FRONTEND_URL}" ]; then
  echo "⚠️  FRONTEND_URL is empty. You'll need to set it manually in cloudrun.yaml"
else
  printf '%s' "${FRONTEND_URL}" | gcloud secrets create frontend-url \
    --data-file=- \
    --project=${PROJECT_ID} || \
    printf '%s' "${FRONTEND_URL}" | gcloud secrets versions add frontend-url \
    --data-file=- \
    --project=${PROJECT_ID}
fi

# Backend URL (Cloud Run)
echo ""
echo "🌐 Backend URL (Cloud Run)"
read -p "Enter BACKEND_URL (default: https://api-sgmtwgzrlq-ue.a.run.app): " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-https://api-sgmtwgzrlq-ue.a.run.app}
printf '%s' "${BACKEND_URL}" | gcloud secrets create backend-url \
  --data-file=- \
  --project=${PROJECT_ID} || \
  printf '%s' "${BACKEND_URL}" | gcloud secrets versions add backend-url \
  --data-file=- \
  --project=${PROJECT_ID}

echo ""
echo "✅ All secrets created!"
echo ""
echo "📋 Verify secrets:"
echo "   gcloud secrets list --project=${PROJECT_ID}"
echo ""
echo "🔐 Verify Cloud Run service account has access to secrets:"
echo "   gcloud projects get-iam-policy ${PROJECT_ID} --flatten='bindings[].members' --filter='bindings.role:roles/secretmanager.secretAccessor'"
echo ""
echo "   If not set, grant access:"
echo "   PROJECT_NUMBER=\$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')"
echo "   gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "     --member=\"serviceAccount:\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com\" \\"
echo "     --role=\"roles/secretmanager.secretAccessor\""
echo ""
echo "📝 Next steps:"
echo "   1. cloudrun.yaml is already updated with the new secrets ✅"
echo "   2. Redeploy: gcloud run services replace cloudrun.yaml --project=${PROJECT_ID} --region=${REGION}"

