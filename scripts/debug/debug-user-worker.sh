#!/bin/bash
# Debug script for user worker
# Checks queue status, repository states, logs, and can manually trigger the worker

# Don't exit on error - we want to see all checks even if one fails
set +e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
USER_JOB_NAME="user-worker"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 User Worker Debugging Tool${NC}"
echo "=================================="
echo ""

# Validate PROJECT_ID
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo -e "${RED}❌ Error: PROJECT_ID is not set!${NC}"
  echo ""
  echo "   Please set it using:"
  echo "   export PROJECT_ID=\"your-actual-project-id\""
  exit 1
fi

ACTION="${1:-all}"

check_user_queue_status() {
  echo -e "${GREEN}📊 Checking User Queue Status...${NC}"
  echo "-----------------------------------"
  (
    cd backend || exit 1
    if [ -f "package.json" ]; then
      if [ -f "scripts/checkUserQueueStatus.ts" ]; then
        npx ts-node scripts/checkUserQueueStatus.ts 2>&1
      else
        echo -e "${YELLOW}⚠️  checkUserQueueStatus.ts not found, using fallback...${NC}"
        npm run check-user-queue 2>&1 || echo -e "${RED}❌ Could not check user queue status${NC}"
      fi
    else
      echo -e "${RED}❌ Error: backend/package.json not found${NC}"
    fi
  )
  echo ""
}

check_repository_states() {
  echo -e "${GREEN}📦 Checking Repository States...${NC}"
  echo "-----------------------------------"
  (
    cd backend || exit 1
    if [ -f "package.json" ]; then
      npx ts-node scripts/checkRepositoryStates.ts 2>&1
    else
      echo -e "${RED}❌ Error: backend/package.json not found${NC}"
    fi
  )
  echo ""
}

view_recent_logs() {
  echo -e "${GREEN}📋 Viewing Recent User Worker Logs...${NC}"
  echo "-----------------------------------"
  ./scripts/debug/view-prod-logs.sh user-worker
  echo ""
}

view_error_logs() {
  echo -e "${YELLOW}❌ Viewing User Worker Error Logs...${NC}"
  echo "-----------------------------------"
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${USER_JOB_NAME} AND resource.labels.location=${REGION} AND severity>=ERROR" \
    --project=${PROJECT_ID} \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=24h
  echo ""
}

check_job_status() {
  echo -e "${GREEN}⚙️  Checking Cloud Run Job Status...${NC}"
  echo "-----------------------------------"
  echo "Job: ${USER_JOB_NAME}"
  echo ""
  
  # Check if job exists
  if ! gcloud run jobs describe ${USER_JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    echo -e "${RED}❌ Job ${USER_JOB_NAME} does not exist!${NC}"
    return
  fi
  
  # Get recent executions
  echo "Recent executions (last 5):"
  gcloud run jobs executions list \
    --job=${USER_JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --limit=5 \
    --format="table(name,status.conditions[0].type,status.conditions[0].status,status.startTime,status.completionTime)"
  echo ""
  
  # Check scheduler status
  SCHEDULER_NAME="${USER_JOB_NAME}-scheduler"
  if gcloud scheduler jobs describe ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    echo "Scheduler: ${SCHEDULER_NAME}"
    SCHEDULE=$(gcloud scheduler jobs describe ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(schedule)" 2>/dev/null || echo "N/A")
    STATE=$(gcloud scheduler jobs describe ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(state)" 2>/dev/null || echo "N/A")
    echo "  Schedule: ${SCHEDULE}"
    echo "  State: ${STATE}"
  else
    echo -e "${YELLOW}⚠️  Scheduler ${SCHEDULER_NAME} not found${NC}"
  fi
  echo ""
}

trigger_worker() {
  echo -e "${GREEN}🚀 Manually Triggering User Worker...${NC}"
  echo "-----------------------------------"
  gcloud run jobs execute ${USER_JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID}
  echo ""
  echo "✅ Worker triggered! Check logs in a few seconds:"
  echo "   ./scripts/debug/view-prod-logs.sh user-worker --tail"
  echo ""
}

trigger_multiple() {
  NUM="${1:-5}"
  echo -e "${GREEN}🚀 Triggering User Worker ${NUM} Time(s)...${NC}"
  echo "-----------------------------------"
  
  for i in $(seq 1 ${NUM}); do
    echo -e "${YELLOW}Trigger ${i}/${NUM}...${NC}"
    gcloud run jobs execute ${USER_JOB_NAME} \
      --region=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(name)" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      echo "   ✅ Execution ${i} started"
      if [ $i -lt ${NUM} ]; then
        echo "   ⏳ Waiting 15 seconds..."
        sleep 15
      fi
    else
      echo "   ❌ Failed to trigger"
      break
    fi
  done
  
  echo ""
  echo "✅ Done! Triggered worker ${NUM} time(s)"
  echo ""
}

show_help() {
  echo "Usage: ./debug-user-worker.sh [action] [options]"
  echo ""
  echo "Actions:"
  echo "  all              - Run all checks (default)"
  echo "  queue            - Check user queue status"
  echo "  repos            - Check repository states"
  echo "  logs             - View recent logs"
  echo "  errors           - View error logs"
  echo "  status           - Check Cloud Run Job status"
  echo "  trigger          - Manually trigger the worker once"
  echo "  trigger-multiple [N] - Trigger worker N times (default: 5)"
  echo "  help             - Show this help"
  echo ""
  echo "Examples:"
  echo "  ./debug-user-worker.sh trigger-multiple 10"
  echo "  ./debug-user-worker.sh queue"
  echo ""
}

case "$ACTION" in
  queue)
    check_user_queue_status
    ;;
  repos)
    check_repository_states
    ;;
  logs)
    view_recent_logs
    ;;
  errors)
    view_error_logs
    ;;
  status)
    check_job_status
    ;;
  trigger)
    trigger_worker
    ;;
  trigger-multiple)
    NUM="${2:-5}"
    trigger_multiple "$NUM"
    ;;
  help|--help|-h)
    show_help
    ;;
  all|*)
    check_user_queue_status
    check_repository_states
    check_job_status
    view_recent_logs
    echo ""
    echo -e "${BLUE}💡 Next Steps:${NC}"
    echo "  - View error logs: ./debug-user-worker.sh errors"
    echo "  - Stream logs: ./view-prod-logs.sh user-worker --tail"
    echo "  - Trigger manually: ./debug-user-worker.sh trigger"
    echo "  - Trigger multiple times: ./debug-user-worker.sh trigger-multiple 10"
    echo ""
    ;;
esac

