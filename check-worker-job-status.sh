#!/bin/bash
# Check Cloud Run Job status and recent executions
# Usage: ./check-worker-job-status.sh

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME="${COMMIT_JOB_NAME:-commit-worker}"

# Validate PROJECT_ID
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is not set!"
  exit 1
fi

echo "🔍 Checking Cloud Run Job Status..."
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
  echo "❌ Error: Cloud Run Job '${COMMIT_JOB_NAME}' does NOT exist!"
  echo ""
  echo "   To create it, deploy the job:"
  echo "   gcloud run jobs replace cloudrun-job-commit-worker.yaml --project=${PROJECT_ID} --region=${REGION}"
  exit 1
fi

echo "✅ Job exists"
echo ""

# Get job details
echo "📊 Job Configuration:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

JOB_STATUS=$(gcloud run jobs describe ${COMMIT_JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.conditions[0].type):value(status.conditions[0].status)" 2>/dev/null || echo "UNKNOWN:UNKNOWN")

echo "   Status: ${JOB_STATUS}"
echo ""

# Get recent executions
echo "📋 Recent Executions (last 10):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXECUTIONS=$(gcloud run jobs executions list \
  --job=${COMMIT_JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --limit=10 \
  --format="table(name.basename(),status.conditions[0].type,status.conditions[0].status,status.startTime,status.completionTime)" 2>/dev/null)

if [ -z "$EXECUTIONS" ]; then
  echo "   ⚠️  No executions found (or unable to list executions)"
else
  echo "$EXECUTIONS"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for failed executions
echo "🔍 Checking for Failed Executions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FAILED_EXECUTIONS=$(gcloud run jobs executions list \
  --job=${COMMIT_JOB_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --limit=5 \
  --filter="status.conditions[0].status!=True" \
  --format="value(name.basename())" 2>/dev/null || echo "")

if [ -z "$FAILED_EXECUTIONS" ]; then
  echo "   ✅ No failed executions found"
else
  echo "   ⚠️  Found failed executions:"
  echo "$FAILED_EXECUTIONS" | while read execution; do
    if [ ! -z "$execution" ]; then
      echo "      - ${execution}"
    fi
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get recent logs
echo "📋 Recent Logs (last 20 lines):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME}" \
  --limit=20 \
  --project=${PROJECT_ID} \
  --format="table(timestamp.date('%Y-%m-%d %H:%M:%S'),severity,textPayload)" \
  2>/dev/null || echo "   ⚠️  Could not fetch logs (check permissions)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Useful commands:"
echo "   - View detailed logs:"
echo "     gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME}\" --limit=50 --project=${PROJECT_ID}"
echo ""
echo "   - Manually trigger job:"
echo "     ./trigger-commit-worker.sh"
echo ""
echo "   - Check queue status:"
echo "     ./diagnose-pending-gcp.sh"

