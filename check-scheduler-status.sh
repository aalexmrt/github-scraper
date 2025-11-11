#!/bin/bash
# Check Cloud Scheduler status for workers
# Usage: ./check-scheduler-status.sh

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
COMMIT_SCHEDULER_NAME="${COMMIT_SCHEDULER_NAME:-commit-worker-scheduler}"
USER_SCHEDULER_NAME="${USER_SCHEDULER_NAME:-user-worker-scheduler}"

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
  echo "   3. Pass it inline:"
  echo "      PROJECT_ID=\"your-actual-project-id\" ./check-scheduler-status.sh"
  echo ""
  exit 1
fi

echo "🔍 Checking Cloud Scheduler Status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Commit Worker Scheduler
echo "📊 Commit Worker Scheduler (${COMMIT_SCHEDULER_NAME}):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  
  # Get scheduler details
  STATE=$(gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(state)" 2>/dev/null || echo "UNKNOWN")
  
  SCHEDULE=$(gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(schedule)" 2>/dev/null || echo "UNKNOWN")
  
  URI=$(gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(httpTarget.uri)" 2>/dev/null || echo "UNKNOWN")
  
  echo "   ✅ Scheduler exists"
  echo "   State: ${STATE}"
  echo "   Schedule: ${SCHEDULE}"
  echo "   URI: ${URI}"
  
  if [ "$STATE" = "ENABLED" ]; then
    echo "   ✅ Status: ENABLED (scheduler is active)"
  elif [ "$STATE" = "PAUSED" ]; then
    echo "   ⚠️  Status: PAUSED (scheduler is paused - jobs won't run)"
    echo ""
    echo "   To enable:"
    echo "   gcloud scheduler jobs resume ${COMMIT_SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
  else
    echo "   ⚠️  Status: ${STATE}"
  fi
  
  # Check recent execution history
  echo ""
  echo "   Recent executions (last 5):"
  EXECUTIONS=$(gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(name)" 2>/dev/null || echo "")
  
  # Try to get execution history (this might not work for all scheduler types)
  echo "   (Execution history may not be available via CLI)"
  
else
  echo "   ❌ Scheduler does NOT exist!"
  echo ""
  echo "   To create it, run:"
  echo "   ./setup-two-worker-schedulers.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check User Worker Scheduler
echo "📊 User Worker Scheduler (${USER_SCHEDULER_NAME}):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if gcloud scheduler jobs describe ${USER_SCHEDULER_NAME} \
  --location=${REGION} \
  --project=${PROJECT_ID} &>/dev/null; then
  
  STATE=$(gcloud scheduler jobs describe ${USER_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(state)" 2>/dev/null || echo "UNKNOWN")
  
  SCHEDULE=$(gcloud scheduler jobs describe ${USER_SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(schedule)" 2>/dev/null || echo "UNKNOWN")
  
  echo "   ✅ Scheduler exists"
  echo "   State: ${STATE}"
  echo "   Schedule: ${SCHEDULE}"
  
  if [ "$STATE" = "ENABLED" ]; then
    echo "   ✅ Status: ENABLED (scheduler is active)"
  elif [ "$STATE" = "PAUSED" ]; then
    echo "   ⚠️  Status: PAUSED (scheduler is paused - jobs won't run)"
    echo ""
    echo "   To enable:"
    echo "   gcloud scheduler jobs resume ${USER_SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
  else
    echo "   ⚠️  Status: ${STATE}"
  fi
  
else
  echo "   ❌ Scheduler does NOT exist!"
  echo ""
  echo "   To create it, run:"
  echo "   ./setup-two-worker-schedulers.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# List all schedulers
echo "📋 All Cloud Schedulers in project:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
gcloud scheduler jobs list \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --format="table(name.basename(),schedule,state,timeZone)" 2>/dev/null || echo "   (Could not list schedulers)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Useful commands:"
echo "   - Resume paused scheduler:"
echo "     gcloud scheduler jobs resume ${COMMIT_SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "   - Pause scheduler:"
echo "     gcloud scheduler jobs pause ${COMMIT_SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "   - Manually trigger a job execution:"
echo "     gcloud run jobs execute commit-worker --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo "   - View scheduler details:"
echo "     gcloud scheduler jobs describe ${COMMIT_SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"

