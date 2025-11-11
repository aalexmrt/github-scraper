#!/bin/bash
# Migration script to update existing Cloud Scheduler jobs from OIDC to OAuth
# This fixes the 401 UNAUTHENTICATED error for Cloud Run Jobs API
#
# Reference: https://docs.cloud.google.com/scheduler/docs/http-target-auth
# "An OIDC token is generally used except for Google APIs hosted on *.googleapis.com 
#  as these APIs expect an OAuth token."

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
COMMIT_JOB_NAME=${COMMIT_JOB_NAME:-"commit-worker"}
USER_JOB_NAME=${USER_JOB_NAME:-"user-worker"}
COMMIT_SCHEDULER_NAME="${COMMIT_JOB_NAME}-scheduler"
USER_SCHEDULER_NAME="${USER_JOB_NAME}-scheduler"

# Get the service account email (default compute service account)
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "🔄 Migrating Cloud Schedulers from OIDC to OAuth"
echo "=================================================="
echo ""
echo "This script will update existing schedulers to use OAuth tokens instead of OIDC."
echo "This is required because Cloud Run Jobs API (run.googleapis.com) requires OAuth tokens."
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service Account: ${SERVICE_ACCOUNT_EMAIL}"
echo ""

# Function to update a scheduler
update_scheduler() {
  local SCHEDULER_NAME=$1
  local JOB_NAME=$2
  local SCHEDULE=$3
  
  echo "Checking scheduler: ${SCHEDULER_NAME}..."
  
  if gcloud scheduler jobs describe ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    
    echo "✅ Found scheduler ${SCHEDULER_NAME}. Updating to OAuth..."
    
    # Get current configuration
    CURRENT_SCHEDULE=$(gcloud scheduler jobs describe ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(schedule)" 2>/dev/null || echo "${SCHEDULE}")
    
    CURRENT_URI=$(gcloud scheduler jobs describe ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(httpTarget.uri)" 2>/dev/null || echo "")
    
    CURRENT_ATTEMPT_DEADLINE=$(gcloud scheduler jobs describe ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(attemptDeadline)" 2>/dev/null || echo "")
    
    # Use current URI if available, otherwise construct it
    if [ -z "$CURRENT_URI" ]; then
      CURRENT_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run"
    fi
    
    # Use current attempt deadline if valid (max 30m = 1800s), otherwise use 30m
    if [ -n "$CURRENT_ATTEMPT_DEADLINE" ]; then
      # Extract seconds from duration (e.g., "3600s" -> "3600")
      DEADLINE_SECONDS=$(echo "$CURRENT_ATTEMPT_DEADLINE" | sed 's/s$//')
      if [ "$DEADLINE_SECONDS" -gt 1800 ]; then
        ATTEMPT_DEADLINE="1800s"  # Max allowed is 30 minutes
      else
        ATTEMPT_DEADLINE="$CURRENT_ATTEMPT_DEADLINE"
      fi
    else
      ATTEMPT_DEADLINE="1800s"  # Default to 30 minutes
    fi
    
    # Update scheduler with OAuth (only change authentication, preserve other settings)
    gcloud scheduler jobs update http ${SCHEDULER_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --schedule="${CURRENT_SCHEDULE}" \
      --uri="${CURRENT_URI}" \
      --http-method=POST \
      --oauth-service-account-email=${SERVICE_ACCOUNT_EMAIL} \
      --attempt-deadline=${ATTEMPT_DEADLINE}
    
    echo "✅ Successfully updated ${SCHEDULER_NAME} to use OAuth"
  else
    echo "⚠️  Scheduler ${SCHEDULER_NAME} not found. Skipping..."
  fi
  echo ""
}

# Update commit worker scheduler
if [ -n "${COMMIT_JOB_NAME}" ]; then
  update_scheduler "${COMMIT_SCHEDULER_NAME}" "${COMMIT_JOB_NAME}" "*/5 * * * *"
fi

# Update user worker scheduler
if [ -n "${USER_JOB_NAME}" ]; then
  update_scheduler "${USER_SCHEDULER_NAME}" "${USER_JOB_NAME}" "0 */4 * * *"
fi

echo "✅ Migration complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Wait a few minutes for the changes to propagate"
echo "   2. Check scheduler status: ./check-scheduler-status.sh"
echo "   3. Monitor logs to verify jobs are executing successfully"
echo "   4. Test manual trigger: gcloud run jobs execute ${COMMIT_JOB_NAME} --region=${REGION}"
echo ""

