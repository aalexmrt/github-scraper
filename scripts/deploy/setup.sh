#!/bin/bash
# Setup script for GitHub Scraper
# Run this after completing account creation

set -e

# Your configuration
export PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
export REGION="${REGION:-us-east1}"
export SERVICE="api"
export JOB_NAME="worker"

echo "🚀 Setting up deployment for project: ${PROJECT_ID}"
echo ""

# Step 1: Set GCP project
echo "📋 Setting GCP project..."
gcloud config set project ${PROJECT_ID}

# Step 2: Enable required APIs
echo "🔌 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudscheduler.googleapis.com

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Complete account creation (Neon, Upstash, Cloudflare)"
echo "2. Collect all credentials"
echo "3. Run: ./scripts/secrets/create-secrets.sh"
echo "4. Run: ./scripts/deploy/deploy.sh api"
echo "5. Run: ./scripts/deploy/deploy.sh commit-worker user-worker"
echo "6. Run: ./scripts/deploy/deploy.sh frontend"

