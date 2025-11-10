#!/bin/bash
# Diagnostic script to check worker and cronjob status

set -e

PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
JOB_NAME="worker"
SCHEDULER_NAME="${JOB_NAME}-scheduler"

echo "🔍 Checking Worker and Cronjob Status"
echo "======================================"
echo ""

# 1. Check Cloud Scheduler status
echo "1️⃣  Cloud Scheduler Status:"
echo "----------------------------"
if gcloud scheduler jobs describe ${SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "✅ Scheduler exists"
  gcloud scheduler jobs describe ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="table(
      name,
      schedule,
      state,
      lastAttemptTime,
      scheduleTime
    )"
else
  echo "❌ Scheduler NOT FOUND!"
  echo "   Run: ./setup-cloud-scheduler.sh"
fi
echo ""

# 2. Check Cloud Run Job status
echo "2️⃣  Cloud Run Job Status:"
echo "-------------------------"
if gcloud run jobs describe ${JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "✅ Job exists"
  gcloud run jobs describe ${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="table(
      metadata.name,
      status.conditions[0].type,
      status.conditions[0].status,
      spec.template.spec.template.spec.containers[0].image
    )"
else
  echo "❌ Job NOT FOUND!"
  echo "   Run: ./deploy-cloudrun-job.sh"
fi
echo ""

# 3. Check recent job executions
echo "3️⃣  Recent Job Executions (last 10):"
echo "-------------------------------------"
gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --limit=10 \
  --format="table(
    metadata.name,
    status.completionTime,
    status.succeededCount,
    status.failedCount,
    status.conditions[0].type,
    status.conditions[0].status
  )" 2>/dev/null || echo "No executions found"
echo ""

# 4. Check latest execution logs
echo "4️⃣  Latest Execution Logs:"
echo "---------------------------"
LATEST_EXECUTION=$(gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --limit=1 \
  --format="value(metadata.name)" 2>/dev/null | head -1)

if [ -n "$LATEST_EXECUTION" ]; then
  echo "Execution: ${LATEST_EXECUTION}"
  echo "---"
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp, textPayload)" \
    --freshness=1h 2>/dev/null || echo "No recent logs found"
else
  echo "No executions found to check logs"
fi
echo ""

# 5. Manual trigger option
echo "5️⃣  Manual Trigger:"
echo "-------------------"
echo "To manually trigger the job:"
echo "  gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo ""

# 6. Check queue status (if Redis connection info available)
echo "6️⃣  Queue Status Check:"
echo "----------------------"
echo "To check queue status, you can:"
echo "  1. Connect to Redis/Upstash and check queue length"
echo "  2. Check database for repositories with state='queued'"
echo ""

echo "✅ Diagnostic complete!"
echo ""
echo "💡 Next steps if issues found:"
echo "  - If scheduler is paused: gcloud scheduler jobs resume ${SCHEDULER_NAME} --location=${REGION}"
echo "  - If job needs redeploy: ./deploy-cloudrun-job.sh"
echo "  - To view full logs: gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --project=${PROJECT_ID} --limit=50"

