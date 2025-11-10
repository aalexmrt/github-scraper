#!/bin/bash
# Cloud Run Jobs deployment script
# Usage: ./deploy-cloudrun-job.sh

set -e

# Configuration (set these environment variables)
PROJECT_ID=${PROJECT_ID:-"personal-gcp-477623"}
REGION=${REGION:-"us-east1"}
JOB_NAME=${JOB_NAME:-"github-scraper-worker"}
IMAGE_NAME="gcr.io/${PROJECT_ID}/github-scraper-worker:latest"

echo "🚀 Deploying Cloud Run Job: ${JOB_NAME}"

# Step 1: Build and push the worker image
echo "📦 Building worker image..."
cd backend
docker build -f Dockerfile.worker -t ${IMAGE_NAME} .
echo "📤 Pushing image to GCR..."
gcloud auth configure-docker
docker push ${IMAGE_NAME}
cd ..

# Step 2: Create secrets (if they don't exist)
echo "🔐 Checking secrets..."
create_secret_if_not_exists() {
  local secret_name=$1
  local secret_value=$2
  
  if ! gcloud secrets describe ${secret_name} --project=${PROJECT_ID} &>/dev/null; then
    echo "Creating secret: ${secret_name}"
    printf '%s' "${secret_value}" | gcloud secrets create ${secret_name} \
      --data-file=- \
      --project=${PROJECT_ID}
  else
    echo "Secret ${secret_name} already exists, skipping..."
  fi
}

# Note: You'll need to set these environment variables before running
# export DATABASE_URL="postgres://..."
# export REDIS_HOST="..."
# etc.

# Step 3: Deploy the Cloud Run Job
echo "☁️  Deploying Cloud Run Job..."
gcloud run jobs replace cloudrun-job.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}

echo "✅ Cloud Run Job deployed successfully!"
echo ""
echo "⚠️  NOTE: Google Container Registry (GCR) is being deprecated."
echo "   If you see errors pushing to GCR, you'll need to migrate to Artifact Registry."
echo "   Run: gcloud artifacts docker upgrade migrate --projects=${PROJECT_ID}"
echo ""
echo "📋 Next steps:"
echo "1. Set up Cloud Scheduler to trigger the job:"
echo "   gcloud scheduler jobs create http ${JOB_NAME}-scheduler \\"
echo "     --location=${REGION} \\"
echo "     --schedule='*/2 * * * *' \\"
echo "     --uri=\"https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run\" \\"
echo "     --http-method=POST \\"
echo "     --oauth-service-account-email=${PROJECT_ID}@appspot.gserviceaccount.com"
echo ""
echo "2. Or trigger manually:"
echo "   gcloud run jobs execute ${JOB_NAME} --region=${REGION}"

