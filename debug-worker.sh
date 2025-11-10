#!/bin/bash
# Complete worker debugging workflow

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
JOB_NAME="worker"

echo "🔍 STEP 1: Check current status"
echo "==============================="
./check-worker-status.sh
sleep 2

echo ""
echo "🔧 STEP 2: Clean up stuck jobs in Redis"
echo "========================================"
cd backend
npx ts-node scripts/fixStuckJob.ts
cd ..
sleep 2

echo ""
echo "🚀 STEP 3: Manually trigger worker job"
echo "======================================"
echo "Running: gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --wait"
gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --wait
sleep 5

echo ""
echo "📊 STEP 4: Check latest logs"
echo "============================="
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" \
  --project=${PROJECT_ID} \
  --limit=30 \
  --format="table(timestamp, severity, textPayload)" \
  --freshness=5m

echo ""
echo "✅ STEP 5: Final status check"
echo "============================="
./check-worker-status.sh

echo ""
echo "🎯 Debugging complete!"

