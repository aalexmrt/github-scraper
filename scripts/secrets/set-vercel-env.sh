#!/bin/bash
# Helper script to set NEXT_PUBLIC_API_URL in Vercel
# Usage: ./set-vercel-env.sh [backend-url]

set -e

BACKEND_URL="${1:-}"

if [ -z "$BACKEND_URL" ]; then
  echo "🔍 Detecting backend URL from GCP..."
  BACKEND_URL=$(gcloud run services list --format="value(status.url)" --filter="metadata.name=api" 2>/dev/null || echo "")
  
  if [ -z "$BACKEND_URL" ]; then
    echo "❌ Could not auto-detect backend URL"
    echo ""
    echo "Usage: $0 [backend-url]"
    echo "Example: $0 https://api-xxx.run.app"
    exit 1
  fi
fi

echo "📝 Setting NEXT_PUBLIC_API_URL in Vercel..."
echo "   Backend URL: $BACKEND_URL"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "⚠️  Vercel CLI not found. Install it with: npm i -g vercel"
  echo ""
  echo "Alternatively, set the environment variable manually in Vercel dashboard:"
  echo "   1. Go to your Vercel project settings"
  echo "   2. Navigate to Environment Variables"
  echo "   3. Add: NEXT_PUBLIC_API_URL = $BACKEND_URL"
  echo "   4. Select 'Production', 'Preview', and 'Development' environments"
  echo "   5. Redeploy your application"
  exit 1
fi

# Set environment variable for all environments
cd frontend
vercel env add NEXT_PUBLIC_API_URL production <<< "$BACKEND_URL" || true
vercel env add NEXT_PUBLIC_API_URL preview <<< "$BACKEND_URL" || true
vercel env add NEXT_PUBLIC_API_URL development <<< "$BACKEND_URL" || true

echo ""
echo "✅ Environment variable set successfully!"
echo ""
echo "⚠️  Important: You may need to redeploy your Vercel application for changes to take effect."
echo "   Run: vercel --prod"

