#!/bin/bash
# Manually trigger commit worker multiple times to process all pending jobs
# Usage: ./trigger-commit-worker-multiple.sh [number-of-times]

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME="commit-worker"
NUM_TRIGGERS="${1:-5}"  # Default to 5 triggers

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate PROJECT_ID
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo -e "${YELLOW}❌ Error: PROJECT_ID is not set!${NC}"
  echo ""
  echo "   Please set it using:"
  echo "   export PROJECT_ID=\"your-actual-project-id\""
  exit 1
fi

echo -e "${BLUE}🚀 Triggering Commit Worker Multiple Times${NC}"
echo "=========================================="
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Job: ${COMMIT_JOB_NAME}"
echo "Number of triggers: ${NUM_TRIGGERS}"
echo ""

# Check current queue status first
echo -e "${GREEN}📊 Checking current queue status...${NC}"
cd backend
PROJECT_ID=${PROJECT_ID} bash -c '
export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_TLS="true"
npm run check-commit-queue 2>&1 | grep -A 10 "Commit Queue Statistics" || echo "Could not check queue status"
' || echo "Could not check queue status"
cd ..
echo ""

# Trigger the worker multiple times
for i in $(seq 1 ${NUM_TRIGGERS}); do
  echo -e "${GREEN}🔄 Trigger ${i}/${NUM_TRIGGERS}...${NC}"
  
  EXECUTION=$(gcloud run jobs execute ${COMMIT_JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(name)" 2>&1)
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Execution started: ${EXECUTION}"
    echo "   ⏳ Waiting 10 seconds before next trigger..."
    sleep 10
  else
    echo "   ❌ Failed to trigger worker"
    break
  fi
done

echo ""
echo -e "${BLUE}✅ Done! Triggered worker ${NUM_TRIGGERS} time(s)${NC}"
echo ""
echo "💡 Check status:"
echo "   ./debug-commit-worker.sh repos"
echo "   ./view-prod-logs.sh commit-worker"
echo ""

