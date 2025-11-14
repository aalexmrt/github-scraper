#!/bin/bash
# Comprehensive worker test script
# Tests worker functionality by adding a repository and monitoring processing

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Worker Test Script${NC}"
echo "=========================="
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ]; then
  echo -e "${RED}❌ Error: Must run from project root directory${NC}"
  exit 1
fi

cd backend

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}⚠️  Warning: .env file not found. Make sure environment variables are set.${NC}"
fi

# Step 1: Check Redis connection
echo -e "${BLUE}1️⃣  Checking Redis Connection...${NC}"
echo "-----------------------------------"
if npm run --silent check-queue 2>/dev/null || npx ts-node scripts/checkQueueStatus.ts 2>/dev/null; then
  echo -e "${GREEN}✅ Redis connection successful${NC}"
else
  echo -e "${RED}❌ Redis connection failed${NC}"
  echo "   Make sure Redis/Upstash is configured and accessible"
  echo "   Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS environment variables"
  exit 1
fi
echo ""

# Step 2: Check current queue status
echo -e "${BLUE}2️⃣  Current Queue Status:${NC}"
echo "---------------------------"
npx ts-node scripts/checkQueueStatus.ts || echo -e "${YELLOW}⚠️  Could not check queue status${NC}"
echo ""

# Step 3: Ask for repository URL or use default test repo
echo -e "${BLUE}3️⃣  Adding Test Repository${NC}"
echo "---------------------------"
read -p "Enter GitHub repository URL (or press Enter for default: https://github.com/vercel/next.js): " REPO_URL
REPO_URL=${REPO_URL:-"https://github.com/vercel/next.js"}

echo ""
echo -e "${YELLOW}📤 Adding repository: ${REPO_URL}${NC}"

# Run the script to add the repo
if npx ts-node scripts/testWorker.ts "$REPO_URL"; then
  echo -e "${GREEN}✅ Repository added successfully${NC}"
else
  echo -e "${RED}❌ Failed to add repository${NC}"
  exit 1
fi
echo ""

# Step 4: Check queue status again
echo -e "${BLUE}4️⃣  Updated Queue Status:${NC}"
echo "---------------------------"
npx ts-node scripts/checkQueueStatus.ts
echo ""

# Step 5: Worker execution options
echo -e "${BLUE}5️⃣  Worker Execution Options:${NC}"
echo "---------------------------"
echo ""
echo "Choose how to run the worker:"
echo "  1) Local development worker (continuous, press Ctrl+C to stop)"
echo "  2) Cloud Run worker (one job, then exit)"
echo "  3) Skip worker execution (manual trigger later)"
echo ""
read -p "Enter choice [1-3] (default: 3): " WORKER_CHOICE
WORKER_CHOICE=${WORKER_CHOICE:-3}

case $WORKER_CHOICE in
  1)
    echo ""
    echo -e "${YELLOW}🚀 Starting local development worker...${NC}"
    echo "   Press Ctrl+C to stop"
    echo ""
    npm run dev:worker
    ;;
  2)
    echo ""
    echo -e "${YELLOW}🚀 Executing Cloud Run worker...${NC}"
    if command -v gcloud &> /dev/null; then
      PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
      REGION="${REGION:-us-east1}"
      gcloud run jobs execute worker --region=$REGION --project=$PROJECT_ID --wait
    else
      echo -e "${RED}❌ gcloud CLI not found. Cannot execute Cloud Run job.${NC}"
      echo "   Run manually: npm run dev:cloudrun-worker"
    fi
    ;;
  3)
    echo ""
    echo -e "${YELLOW}⏭️  Skipping worker execution${NC}"
    echo ""
    echo "To run the worker manually:"
    echo "  Local:     npm run dev:worker"
    echo "  Cloud Run: npm run dev:cloudrun-worker"
    echo "  Or:        gcloud run jobs execute worker --region=\${REGION:-us-east1} --project=\${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
    ;;
esac

echo ""
echo -e "${BLUE}6️⃣  Monitoring Results:${NC}"
echo "---------------------------"
echo ""
echo "To check if the repository was processed:"
echo "  npx ts-node scripts/checkQueueStatus.ts"
echo ""
echo "To check repository state in database:"
echo "  npx ts-node -e \"import prisma from './src/utils/prisma'; prisma.repository.findMany({orderBy: {createdAt: 'desc'}, take: 5}).then(r => console.log(JSON.stringify(r, null, 2))).finally(() => prisma.\$disconnect())\""
echo ""
echo -e "${GREEN}✅ Test complete!${NC}"

