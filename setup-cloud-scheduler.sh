#!/bin/bash
# Cloud Scheduler setup for Cloud Run Jobs
# This creates a scheduler that triggers the Cloud Run Job every 2 minutes
# Stays within free tier: 1 scheduler job (free tier allows 3)

set -e

PROJECT_ID=${PROJECT_ID:-"your-gcp-project"}
REGION=${REGION:-"us-east1"}
JOB_NAME=${JOB_NAME:-"github-scraper-worker"}
SCHEDULER_NAME="${JOB_NAME}-scheduler"

# Get the service account email (default compute service account)
# Use compute service account instead of appspot
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "⏰ Setting up Cloud Scheduler for ${JOB_NAME}..."

# Check if scheduler already exists
if gcloud scheduler jobs describe ${SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "⚠️  Scheduler ${SCHEDULER_NAME} already exists. Updating..."
  UPDATE_FLAG="--update"
else
  echo "✅ Creating new scheduler ${SCHEDULER_NAME}..."
  UPDATE_FLAG=""
fi

# Create or update the scheduler job
# Runs every 2 minutes: */2 * * * *
# Free tier allows 3 scheduler jobs, so this uses 1 slot
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
  ${UPDATE_FLAG} \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --schedule="*/2 * * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oauth-service-account-email=${SERVICE_ACCOUNT_EMAIL} \
  --time-zone="UTC" \
  --attempt-deadline=600s \
  --max-retry-attempts=0 \
  --max-retry-duration=0s

echo "✅ Cloud Scheduler configured!"
echo ""
echo "📊 Free Tier Status:"
echo "   - Using 1 of 3 free scheduler jobs ✅"
echo "   - Schedule: Every 2 minutes (*/2 * * * *)"
echo ""
echo "🔍 Useful commands:"
echo "   - View scheduler: gcloud scheduler jobs describe ${SCHEDULER_NAME} --location=${REGION}"
echo "   - Pause scheduler: gcloud scheduler jobs pause ${SCHEDULER_NAME} --location=${REGION}"
echo "   - Resume scheduler: gcloud scheduler jobs resume ${SCHEDULER_NAME} --location=${REGION}"
echo "   - Delete scheduler: gcloud scheduler jobs delete ${SCHEDULER_NAME} --location=${REGION}"
echo "   - Manual trigger: gcloud run jobs execute ${JOB_NAME} --region=${REGION}"

