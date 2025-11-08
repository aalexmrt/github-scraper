#!/bin/bash
# check-usage.sh - Monitor Cloud Run Jobs usage to stay within free tier
# Usage: ./check-usage.sh

set -e

PROJECT_ID=${PROJECT_ID:-"your-gcp-project"}
REGION=${REGION:-"us-central1"}
JOB_NAME=${JOB_NAME:-"github-scraper-worker"}

echo "📊 Cloud Run Jobs Usage Report"
echo "================================"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Job: ${JOB_NAME}"
echo ""

# Get current month start date
MONTH_START=$(date -u -d '1 month ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1m +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

# Count executions this month
echo "🔍 Counting executions this month..."
if [ -n "$MONTH_START" ]; then
  EXECUTIONS=$(gcloud run jobs executions list \
    --job=${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(name)" \
    --filter="creationTimestamp>=${MONTH_START}" \
    2>/dev/null | wc -l | tr -d ' ')
else
  # Fallback: count all executions (less accurate)
  EXECUTIONS=$(gcloud run jobs executions list \
    --job=${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(name)" \
    2>/dev/null | wc -l | tr -d ' ')
fi

echo "✅ Executions this month: ${EXECUTIONS}"
echo ""

# Estimate resource usage
# Assumptions: 2 minutes average duration, 1 CPU, 512Mi memory
AVG_DURATION_MINUTES=2
CPU_COUNT=1
MEMORY_GIB=0.5

CPU_SECONDS=$((EXECUTIONS * AVG_DURATION_MINUTES * 60 * CPU_COUNT))
CPU_HOURS=$((CPU_SECONDS / 3600))
MEMORY_GIB_SECONDS=$((EXECUTIONS * AVG_DURATION_MINUTES * 60 * MEMORY_GIB))
MEMORY_GIB_HOURS=$((MEMORY_GIB_SECONDS / 3600))

# Free tier limits
CPU_LIMIT_SECONDS=240000
CPU_LIMIT_HOURS=66
MEMORY_LIMIT_GIB_SECONDS=450000
MEMORY_LIMIT_GIB_HOURS=125

# Calculate percentages
CPU_PERCENT=$((CPU_SECONDS * 100 / CPU_LIMIT_SECONDS))
MEMORY_PERCENT=$((MEMORY_GIB_SECONDS * 100 / MEMORY_LIMIT_GIB_SECONDS))

echo "📈 Resource Usage Estimates"
echo "---------------------------"
echo "CPU-seconds: ${CPU_SECONDS} / ${CPU_LIMIT_SECONDS} (${CPU_PERCENT}%)"
echo "CPU-hours: ${CPU_HOURS} / ${CPU_LIMIT_HOURS} (${CPU_PERCENT}%)"
echo ""
echo "Memory GiB-seconds: ${MEMORY_GIB_SECONDS} / ${MEMORY_LIMIT_GIB_SECONDS} (${MEMORY_PERCENT}%)"
echo "Memory GiB-hours: ${MEMORY_GIB_HOURS} / ${MEMORY_LIMIT_GIB_HOURS} (${MEMORY_PERCENT}%)"
echo ""

# Warnings
if [ $CPU_PERCENT -gt 80 ]; then
  echo "⚠️  WARNING: CPU usage exceeds 80% of free tier!"
elif [ $CPU_PERCENT -gt 50 ]; then
  echo "⚠️  CAUTION: CPU usage exceeds 50% of free tier"
else
  echo "✅ CPU usage is safe"
fi

if [ $MEMORY_PERCENT -gt 80 ]; then
  echo "⚠️  WARNING: Memory usage exceeds 80% of free tier!"
elif [ $MEMORY_PERCENT -gt 50 ]; then
  echo "⚠️  CAUTION: Memory usage exceeds 50% of free tier"
else
  echo "✅ Memory usage is safe"
fi

echo ""
echo "📅 Scheduler Status"
echo "-------------------"
SCHEDULER_STATUS=$(gcloud scheduler jobs describe ${JOB_NAME}-scheduler \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(state)" \
  2>/dev/null || echo "NOT_FOUND")

if [ "$SCHEDULER_STATUS" = "ENABLED" ]; then
  echo "✅ Scheduler is ENABLED"
elif [ "$SCHEDULER_STATUS" = "PAUSED" ]; then
  echo "⏸️  Scheduler is PAUSED"
elif [ "$SCHEDULER_STATUS" = "NOT_FOUND" ]; then
  echo "❌ Scheduler not found"
else
  echo "Status: ${SCHEDULER_STATUS}"
fi

echo ""
echo "💡 Recommendations"
echo "------------------"
if [ $CPU_PERCENT -gt 80 ] || [ $MEMORY_PERCENT -gt 80 ]; then
  echo "🚨 Consider reducing scheduler frequency:"
  echo "   gcloud scheduler jobs update http ${JOB_NAME}-scheduler \\"
  echo "     --schedule='*/5 * * * *'  # Every 5 minutes instead of 2"
fi

if [ "$SCHEDULER_STATUS" = "ENABLED" ] && [ $EXECUTIONS -gt 1000 ]; then
  echo "⚠️  High execution count detected. Consider pausing scheduler:"
  echo "   gcloud scheduler jobs pause ${JOB_NAME}-scheduler --location=${REGION}"
fi

echo ""
echo "📊 View detailed logs:"
echo "   gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50"

