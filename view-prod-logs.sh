#!/bin/bash
# View production logs for API and Worker
# Usage: ./view-prod-logs.sh [api|worker|both] [--tail|--recent]

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
SERVICE_NAME="api"
JOB_NAME="worker"

MODE="${1:-both}"  # api, worker, or both
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
    gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME} AND resource.labels.location=${REGION}" \
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

view_worker_logs() {
  echo -e "${GREEN}⚙️  Worker Logs (Cloud Run Job: ${JOB_NAME})${NC}"
  echo "-----------------------------------"
  
  if [ "$LOG_MODE" = "--tail" ]; then
    echo "Streaming logs (press Ctrl+C to stop)..."
    echo ""
    gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
      --project=${PROJECT_ID} \
      --format="table(timestamp,severity,textPayload,jsonPayload.message)"
  else
    echo "Recent logs (last 50 entries):"
    echo ""
    gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
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

view_worker_errors() {
  echo -e "${YELLOW}❌ Worker Error Logs (last 20 errors)${NC}"
  echo "-----------------------------------"
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION} AND severity>=ERROR" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=24h
  echo ""
}

case "$MODE" in
  api)
    view_api_logs
    ;;
  worker)
    view_worker_logs
    ;;
  errors)
    view_api_errors
    view_worker_errors
    ;;
  both|*)
    view_api_logs
    view_worker_logs
    ;;
esac

echo -e "${BLUE}💡 Tips:${NC}"
echo "  - Stream logs: ./view-prod-logs.sh [api|worker|both] --tail"
echo "  - View errors only: ./view-prod-logs.sh errors"
echo "  - View in GCP Console: https://console.cloud.google.com/logs/query"
echo ""

