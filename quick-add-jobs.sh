#!/bin/bash
# Quick way to add demo repositories and start processing

set -e

echo "📤 Adding demo repositories to the queue..."
echo ""

cd /Users/alexmartinez/personal_ws/github-scraper/backend
npm run populate-demo

echo ""
echo "📊 Checking queue status..."
echo ""

npx ts-node scripts/checkQueueStatus.ts

echo ""
echo "🚀 Manually triggering worker (one-time)..."
echo ""

gcloud run jobs execute worker --region=us-east1 --project=personal-gcp-477623 --wait

echo ""
echo "✅ Done! The scheduler will continue processing jobs every 2 minutes."
echo ""
echo "Monitor progress with:"
echo "  npx ts-node backend/scripts/checkQueueStatus.ts"
