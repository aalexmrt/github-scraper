#!/bin/bash
# Process all remaining pending repositories
# This script will:
# 1. Re-enqueue any pending repos that don't have jobs
# 2. Trigger the commit worker multiple times to process them
# Usage: ./process-remaining-repos.sh [number-of-triggers]

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME="commit-worker"
NUM_TRIGGERS="${1:-10}"  # Default to 10 triggers (enough for 4 repos + buffer)

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

echo -e "${BLUE}🔄 Processing Remaining Repositories${NC}"
echo "========================================"
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Step 1: Re-enqueue pending repos
echo -e "${GREEN}Step 1: Re-enqueueing pending repositories...${NC}"
echo "----------------------------------------"
./reenqueue-pending-gcp.sh
echo ""

# Step 2: Wait a moment for jobs to be enqueued
echo -e "${GREEN}Step 2: Waiting for jobs to be enqueued...${NC}"
sleep 3
echo ""

# Step 3: Check queue status
echo -e "${GREEN}Step 3: Checking queue status...${NC}"
cd backend
PROJECT_ID=${PROJECT_ID} bash -c '
export DATABASE_URL=$(gcloud secrets versions access latest --secret="db-url" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_HOST=$(gcloud secrets versions access latest --secret="redis-host" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_PORT=$(gcloud secrets versions access latest --secret="redis-port" --project=${PROJECT_ID} 2>/dev/null || echo "6379")
export REDIS_PASSWORD=$(gcloud secrets versions access latest --secret="redis-password" --project=${PROJECT_ID} 2>/dev/null || echo "")
export REDIS_TLS="true"
npm run check-commit-queue 2>&1 | grep -E "(Waiting:|Active:|Completed:)" | head -5 || echo "Could not check queue status"
'
cd ..
echo ""

# Step 4: Trigger worker multiple times
echo -e "${GREEN}Step 4: Triggering commit worker ${NUM_TRIGGERS} time(s)...${NC}"
echo "----------------------------------------"

for i in $(seq 1 ${NUM_TRIGGERS}); do
  echo -e "${YELLOW}🔄 Trigger ${i}/${NUM_TRIGGERS}...${NC}"
  
  EXECUTION=$(gcloud run jobs execute ${COMMIT_JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(name)" 2>&1)
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Execution started: ${EXECUTION}"
    if [ $i -lt ${NUM_TRIGGERS} ]; then
      echo "   ⏳ Waiting 15 seconds before next trigger..."
      sleep 15
    fi
  else
    echo "   ❌ Failed to trigger worker: ${EXECUTION}"
    break
  fi
done

echo ""
echo -e "${BLUE}✅ Done!${NC}"
echo ""
echo "💡 Check status:"
echo "   ./debug-commit-worker.sh repos"
echo "   PROJECT_ID=${PROJECT_ID} ./check-queue-gcp.sh"
echo "   ./view-prod-logs.sh commit-worker"
echo ""

