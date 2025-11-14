#!/bin/bash
# View production logs for API, Commit Worker, and User Worker
# Usage: ./view-prod-logs.sh [api|commit-worker|user-worker|all|errors] [--tail|--recent]

set -e

# Try to get PROJECT_ID from environment, gcloud config, or use placeholder
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
fi
PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"

# Validate that PROJECT_ID is set to a real value (not placeholder)
if [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ] || [ -z "$PROJECT_ID" ]; then
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
  echo "      PROJECT_ID=\"your-actual-project-id\" ./view-prod-logs.sh all"
  echo ""
  exit 1
fi

REGION="${REGION:-us-east1}"
SERVICE_NAME="api"
COMMIT_JOB_NAME="commit-worker"
USER_JOB_NAME="user-worker"

MODE="${1:-all}"  # api, commit-worker, user-worker, all, or errors
LOG_MODE="${2:-recent}"  # --tail for streaming, --recent for last N logs

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Production Logs Viewer${NC}"
echo "=========================="
echo ""

view_api_logs() {
  echo -e "${GREEN}🌐 API Logs (Cloud Run Service: ${SERVICE_NAME})${NC}"
  echo "-----------------------------------"
  
  if [ "$LOG_MODE" = "--tail" ]; then
    echo "Streaming logs (press Ctrl+C to stop)..."
    echo ""
    gcloud beta logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)"
  else
    echo "Recent logs (last 50 entries):"
    echo ""
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --limit=50 \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
      --freshness=1h
  fi
  echo ""
}

view_commit_worker_logs() {
  echo -e "${GREEN}⚙️  Commit Worker Logs (Cloud Run Job: ${COMMIT_JOB_NAME})${NC}"
  echo "-----------------------------------"
  
  if [ "$LOG_MODE" = "--tail" ]; then
    echo "Streaming logs (press Ctrl+C to stop)..."
    echo ""
    gcloud beta logging tail "resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)"
  else
    echo "Recent logs (last 50 entries):"
    echo ""
    gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --limit=50 \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
      --freshness=1h
  fi
  echo ""
}

view_user_worker_logs() {
  echo -e "${GREEN}⚙️  User Worker Logs (Cloud Run Job: ${USER_JOB_NAME})${NC}"
  echo "-----------------------------------"
  
  if [ "$LOG_MODE" = "--tail" ]; then
    echo "Streaming logs (press Ctrl+C to stop)..."
    echo ""
    gcloud beta logging tail "resource.type=cloud_run_job AND resource.labels.job_name=${USER_JOB_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)"
  else
    echo "Recent logs (last 50 entries):"
    echo ""
    gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${USER_JOB_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --limit=50 \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
      --freshness=1h
  fi
  echo ""
}

view_api_errors() {
  echo -e "${YELLOW}❌ API Error Logs (last 20 errors)${NC}"
  echo "-----------------------------------"
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME} AND resource.labels.location=${REGION} AND severity>=ERROR" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=24h
  echo ""
}

view_commit_worker_errors() {
  echo -e "${YELLOW}❌ Commit Worker Error Logs (last 20 errors)${NC}"
  echo "-----------------------------------"
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME} AND resource.labels.location=${REGION} AND severity>=ERROR" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=24h
  echo ""
}

view_user_worker_errors() {
  echo -e "${YELLOW}❌ User Worker Error Logs (last 20 errors)${NC}"
  echo "-----------------------------------"
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${USER_JOB_NAME} AND resource.labels.location=${REGION} AND severity>=ERROR" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=24h
  echo ""
}

view_all_logs() {
  if [ "$LOG_MODE" = "--tail" ]; then
    echo -e "${GREEN}🌐 Streaming All Logs${NC}"
    echo "-----------------------------------"
    echo "Streaming logs from API, Commit Worker, and User Worker (press Ctrl+C to stop)..."
    echo ""
    # Combine all filters with OR for streaming
    gcloud beta logging tail "(resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME} AND resource.labels.location=${REGION}) OR (resource.type=cloud_run_job AND resource.labels.job_name=${COMMIT_JOB_NAME} AND resource.labels.location=${REGION}) OR (resource.type=cloud_run_job AND resource.labels.job_name=${USER_JOB_NAME} AND resource.labels.location=${REGION})" \
      --project=${PROJECT_ID} \
      --format="table(timestamp,severity,resource.labels.service_name,resource.labels.job_name,textPayload,jsonPayload.message)"
  else
    view_api_logs
    view_commit_worker_logs
    view_user_worker_logs
  fi
  echo ""
}

case "$MODE" in
  api)
    view_api_logs
    ;;
  commit-worker)
    view_commit_worker_logs
    ;;
  user-worker)
    view_user_worker_logs
    ;;
  errors)
    view_api_errors
    view_commit_worker_errors
    view_user_worker_errors
    ;;
  all|*)
    view_all_logs
    ;;
esac

echo -e "${BLUE}💡 Tips:${NC}"
echo "  - Stream logs: ./scripts/debug/view-prod-logs.sh [api|commit-worker|user-worker|all] --tail"
echo "  - View errors only: ./scripts/debug/view-prod-logs.sh errors"
echo "  - View in GCP Console: https://console.cloud.google.com/logs/query"
echo ""

