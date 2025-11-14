#!/bin/bash
# Manually trigger commit worker to process pending jobs
# Usage: ./trigger-commit-worker.sh

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME="${COMMIT_JOB_NAME:-commit-worker}"

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
  exit 1
fi

echo "🚀 Triggering Commit Worker Job..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Job: ${COMMIT_JOB_NAME}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if job exists
if ! gcloud run jobs describe ${COMMIT_JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "❌ Error: Cloud Run Job '${COMMIT_JOB_NAME}' does not exist!"
  echo ""
  echo "   To create it, deploy the job first:"
  echo "   gcloud run jobs replace cloudrun-job-commit-worker.yaml --project=${PROJECT_ID} --region=${REGION}"
  exit 1
fi

echo "✅ Job exists, triggering execution..."
echo ""

# Trigger the job
gcloud run jobs execute ${COMMIT_JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --wait

echo ""
echo "✅ Job execution completed!"
echo ""
echo "💡 Check the logs to see if the pending repository was processed:"
echo "   gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME}\" --limit=50 --project=${PROJECT_ID}"



