#!/bin/bash
# Cloud Scheduler setup for Two-Worker Architecture
# - Commit Worker: Every 5 minutes (processes repos)
# - User Worker: Every 4 hours (syncs users via API)
# Stays within free tier: 2 scheduler jobs (free tier allows 3)

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME=${COMMIT_JOB_NAME:-"commit-worker"}
USER_JOB_NAME=${USER_JOB_NAME:-"user-worker"}
COMMIT_SCHEDULER_NAME="${COMMIT_JOB_NAME}-scheduler"
USER_SCHEDULER_NAME="${USER_JOB_NAME}-scheduler"

# Get the service account email (default compute service account)
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "⏰ Setting up Cloud Schedulers for Two-Worker Architecture"
echo "=========================================================="
echo ""

# ============================================================
# 1. Commit Worker Scheduler (Every 5 minutes)
# ============================================================
echo "1️⃣  Setting up Commit Worker Scheduler..."
echo "   Job: ${COMMIT_JOB_NAME}"
echo "   Schedule: Every 5 minutes (*/5 * * * *)"
echo ""

if gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "⚠️  Scheduler ${COMMIT_SCHEDULER_NAME} already exists. Updating..."
  UPDATE_FLAG="--update"
else
  echo "✅ Creating new scheduler ${COMMIT_SCHEDULER_NAME}..."
  UPDATE_FLAG=""
fi

gcloud scheduler jobs create http ${COMMIT_SCHEDULER_NAME} \
  ${UPDATE_FLAG} \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --schedule="*/5 * * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${COMMIT_JOB_NAME}:run" \
  --http-method=POST \
  --oidc-service-account-email=${SERVICE_ACCOUNT_EMAIL} \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${COMMIT_JOB_NAME}:run" \
  --time-zone="UTC" \
  --attempt-deadline=600s \
  --max-retry-attempts=0 \
  --max-retry-duration=0s

echo "✅ Commit Worker Scheduler configured!"
echo ""

# ============================================================
# 2. User Worker Scheduler (Every 4 hours)
# ============================================================
echo "2️⃣  Setting up User Worker Scheduler..."
echo "   Job: ${USER_JOB_NAME}"
echo "   Schedule: Every 4 hours (0 */4 * * *)"
echo ""

if gcloud scheduler jobs describe ${USER_SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "⚠️  Scheduler ${USER_SCHEDULER_NAME} already exists. Updating..."
  UPDATE_FLAG="--update"
else
  echo "✅ Creating new scheduler ${USER_SCHEDULER_NAME}..."
  UPDATE_FLAG=""
fi

gcloud scheduler jobs create http ${USER_SCHEDULER_NAME} \
  ${UPDATE_FLAG} \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --schedule="0 */4 * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${USER_JOB_NAME}:run" \
  --http-method=POST \
  --oidc-service-account-email=${SERVICE_ACCOUNT_EMAIL} \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${USER_JOB_NAME}:run" \
  --time-zone="UTC" \
  --attempt-deadline=600s \
  --max-retry-attempts=0 \
  --max-retry-duration=0s

echo "✅ User Worker Scheduler configured!"
echo ""

# ============================================================
# Summary
# ============================================================
echo "✅ Both Cloud Schedulers configured successfully!"
echo ""
echo "📊 Free Tier Status:"
echo "   - Using 2 of 3 free scheduler jobs ✅"
echo "   - Commit Worker: Every 5 minutes (*/5 * * * *)"
echo "   - User Worker: Every 4 hours (0 */4 * * *)"
echo ""
echo "💰 Estimated Monthly Usage (assuming 15s per execution):"
echo "   - Commit Worker: 8,640 executions/month"
echo "   - User Worker: 180 executions/month"
echo "   - Total: 8,820 executions/month"
echo "   - vCPU-seconds: ~132,300/month ✅ (within 180,000 free tier)"
echo "   - GB-seconds: ~66,150/month ✅ (within 360,000 free tier)"
echo ""
echo "🔍 Useful commands:"
echo ""
echo "   View schedulers:"
echo "   - gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} --location=${REGION}"
echo "   - gcloud scheduler jobs describe ${USER_SCHEDULER_NAME} --location=${REGION}"
echo ""
echo "   Pause/Resume schedulers:"
echo "   - gcloud scheduler jobs pause ${COMMIT_SCHEDULER_NAME} --location=${REGION}"
echo "   - gcloud scheduler jobs resume ${COMMIT_SCHEDULER_NAME} --location=${REGION}"
echo "   - gcloud scheduler jobs pause ${USER_SCHEDULER_NAME} --location=${REGION}"
echo "   - gcloud scheduler jobs resume ${USER_SCHEDULER_NAME} --location=${REGION}"
echo ""
echo "   Manual triggers:"
echo "   - gcloud run jobs execute ${COMMIT_JOB_NAME} --region=${REGION}"
echo "   - gcloud run jobs execute ${USER_JOB_NAME} --region=${REGION}"
echo ""
echo "   Delete schedulers:"
echo "   - gcloud scheduler jobs delete ${COMMIT_SCHEDULER_NAME} --location=${REGION}"
echo "   - gcloud scheduler jobs delete ${USER_SCHEDULER_NAME} --location=${REGION}"

