#!/bin/bash
# Quick way to add demo repositories and start processing

set -e

echo "📤 Adding demo repositories to the queue..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}/backend"
npm run populate-demo

echo ""
echo "📊 Checking queue status..."
echo ""

npx ts-node scripts/checkQueueStatus.ts

echo ""
echo "🚀 Manually triggering worker (one-time)..."
echo ""

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
gcloud run jobs execute worker --region=${REGION} --project=${PROJECT_ID} --wait

echo ""
echo "✅ Done! The scheduler will continue processing jobs every 2 minutes."
echo ""
echo "Monitor progress with:"
echo "  npx ts-node backend/scripts/checkQueueStatus.ts"
