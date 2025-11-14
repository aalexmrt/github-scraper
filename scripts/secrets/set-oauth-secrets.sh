#!/bin/bash
# Set only the new GitHub OAuth secrets for production
# Use this if you've already run create-secrets.sh before

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"

echo "🔐 Setting up GitHub OAuth secrets for production..."
echo ""
echo "⚠️  Make sure you've created a Production OAuth App with callback URL:"
echo "   https://your-backend-url.run.app/auth/github/callback"
echo ""

# GitHub OAuth Client ID (Production)
read -p "Enter GITHUB_CLIENT_ID (Production): " GITHUB_CLIENT_ID
if [ -z "${GITHUB_CLIENT_ID}" ]; then
  echo "❌ GITHUB_CLIENT_ID is required. Exiting."
  exit 1
fi
printf '%s' "${GITHUB_CLIENT_ID}" | gcloud secrets create github-client-id \
  --data-file=- \
  --project=${PROJECT_ID} 2>/dev/null || \
  printf '%s' "${GITHUB_CLIENT_ID}" | gcloud secrets versions add github-client-id \
  --data-file=- \
  --project=${PROJECT_ID}
echo "✅ GITHUB_CLIENT_ID set"

# GitHub OAuth Client Secret (Production)
read -p "Enter GITHUB_CLIENT_SECRET (Production): " GITHUB_CLIENT_SECRET
if [ -z "${GITHUB_CLIENT_SECRET}" ]; then
  echo "❌ GITHUB_CLIENT_SECRET is required. Exiting."
  exit 1
fi
printf '%s' "${GITHUB_CLIENT_SECRET}" | gcloud secrets create github-client-secret \
  --data-file=- \
  --project=${PROJECT_ID} 2>/dev/null || \
  printf '%s' "${GITHUB_CLIENT_SECRET}" | gcloud secrets versions add github-client-secret \
  --data-file=- \
  --project=${PROJECT_ID}
echo "✅ GITHUB_CLIENT_SECRET set"

# Frontend URL (Vercel)
echo ""
echo "🌐 Frontend URL (Vercel)"
echo "   Your Vercel production URL (e.g., https://github-scraper-xxx.vercel.app)"
read -p "Enter FRONTEND_URL: " FRONTEND_URL
if [ -z "${FRONTEND_URL}" ]; then
  echo "⚠️  FRONTEND_URL is empty. Skipping..."
else
  printf '%s' "${FRONTEND_URL}" | gcloud secrets create frontend-url \
    --data-file=- \
    --project=${PROJECT_ID} 2>/dev/null || \
    printf '%s' "${FRONTEND_URL}" | gcloud secrets versions add frontend-url \
    --data-file=- \
    --project=${PROJECT_ID}
  echo "✅ FRONTEND_URL set"
fi

# Backend URL (Cloud Run)
echo ""
echo "🌐 Backend URL (Cloud Run)"
read -p "Enter BACKEND_URL (default: https://your-backend-url.run.app): " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-https://your-backend-url.run.app}
printf '%s' "${BACKEND_URL}" | gcloud secrets create backend-url \
  --data-file=- \
  --project=${PROJECT_ID} 2>/dev/null || \
  printf '%s' "${BACKEND_URL}" | gcloud secrets versions add backend-url \
  --data-file=- \
  --project=${PROJECT_ID}
echo "✅ BACKEND_URL set"

echo ""
echo "✅ All OAuth secrets configured!"
echo ""
echo "📝 Next steps:"
echo "   1. cloudrun.yaml is already updated with the new secrets ✅"
echo "   2. Redeploy: gcloud run services replace cloudrun.yaml --project=${PROJECT_ID} --region=${REGION}"

