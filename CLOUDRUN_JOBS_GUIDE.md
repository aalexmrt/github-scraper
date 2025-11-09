# Cloud Run Jobs Deployment Guide

## Overview

This guide shows how to deploy your GitHub scraper worker as a **Cloud Run Job** that processes one job per execution, triggered by **Cloud Scheduler**. This approach stays within the **free tier** limits.

## Architecture

```
Cloud Scheduler (every 2 min)
    └── Triggers Cloud Run Job
            └── Processes ONE job from Redis queue
            └── Exits (no continuous polling)
```

## Free Tier Limits

### Cloud Run Jobs
- **CPU**: 240,000 vCPU-seconds/month free
- **Memory**: 450,000 GiB-seconds/month free
- **Minimum billing**: 1 minute per task attempt

### Cloud Scheduler
- **Free**: First 3 scheduler jobs per billing account per month
- **After free tier**: $0.10 per job per month

## Prerequisites

1. GCP project with billing enabled (free tier still requires billing account)
2. `gcloud` CLI installed and authenticated
3. Docker installed
4. Secrets configured (DATABASE_URL, REDIS_URL, etc.)

## Quick Setup

### 1. Set Environment Variables

```bash
export PROJECT_ID="your-gcp-project"
export REGION="us-east1"
export JOB_NAME="github-scraper-worker"
```

### 2. Create Secrets

```bash
# Database URL (Neon Postgres)
printf '%s' "postgres://user:pass@host:5432/dbname" | \
  gcloud secrets create db-url --data-file=-

# Redis (Upstash)
printf '%s' "your-redis-host" | \
  gcloud secrets create redis-host --data-file=-
printf '%s' "6379" | \
  gcloud secrets create redis-port --data-file=-
printf '%s' "your-redis-password" | \
  gcloud secrets create redis-password --data-file=-

# GitHub Token
printf '%s' "your-github-token" | \
  gcloud secrets create github-token --data-file=-

# R2 Storage (Cloudflare)
printf '%s' "your-r2-account-id" | \
  gcloud secrets create r2-account-id --data-file=-
printf '%s' "your-r2-access-key" | \
  gcloud secrets create r2-access-key --data-file=-
printf '%s' "your-r2-secret-key" | \
  gcloud secrets create r2-secret-key --data-file=-
printf '%s' "github-repos" | \
  gcloud secrets create r2-bucket --data-file=-
```

### 3. Update cloudrun-job.yaml

Replace `YOUR_PROJECT_ID` in `cloudrun-job.yaml`:

```yaml
image: gcr.io/YOUR_PROJECT_ID/github-scraper-worker:latest
```

Or use environment variable substitution:

```bash
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" cloudrun-job.yaml
```

### 4. Build and Deploy

```bash
# Build and push image
cd backend
docker build -f Dockerfile.cloudrun-worker -t gcr.io/${PROJECT_ID}/github-scraper-worker:latest .
gcloud auth configure-docker
docker push gcr.io/${PROJECT_ID}/github-scraper-worker:latest
cd ..

# Deploy Cloud Run Job
gcloud run jobs replace cloudrun-job.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
```

### 5. Set Up Cloud Scheduler

```bash
./setup-cloud-scheduler.sh
```

Or manually:

```bash
gcloud scheduler jobs create http github-scraper-worker-scheduler \
  --location=${REGION} \
  --schedule="*/2 * * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oidc-service-account-email=${PROJECT_ID}@appspot.gserviceaccount.com \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run"
```

## How It Works

1. **Cloud Scheduler** triggers the Cloud Run Job every 2 minutes
2. **Cloud Run Job** starts, runs migrations, then:
   - Checks Redis queue for waiting jobs
   - If no jobs: exits gracefully (0)
   - If jobs exist: processes the first one
   - Updates database state
   - Exits (success or failure)
3. **Next trigger** processes the next job in queue

## Cost Optimization

### Stay Within Free Tier

**Example calculation** (us-east1):
- Job runs every 2 minutes = 720 executions/month
- Each execution: 1 CPU, 512Mi memory, ~2 minutes average
- CPU: 720 × 2 min × 1 CPU = 1,440 CPU-minutes = 86,400 CPU-seconds ✅ (well under 240,000)
- Memory: 720 × 2 min × 0.5 GiB = 720 GiB-minutes = 43,200 GiB-seconds ✅ (well under 450,000)

**Recommendations**:
- ✅ Keep CPU=1, Memory=512Mi (as configured)
- ✅ Set timeout to actual need (600s = 10 min max)
- ✅ Use R2 storage (not filesystem)
- ✅ Process one job per execution (as implemented)
- ✅ No retries in Cloud Run Job (let Bull handle retries)

## Monitoring

### View Job Executions

```bash
# List recent executions
gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --limit=10

# View logs for specific execution
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" \
  --limit=50 \
  --format=json
```

### Check Queue Status

```bash
# Connect to Redis and check queue length
# (Use Upstash console or redis-cli)
```

## Troubleshooting

### Job Exits Immediately with "No jobs"

- **Cause**: Queue is empty or Redis connection issue
- **Check**: Redis connection string, queue name matches
- **Solution**: Verify jobs are being added to queue by backend API

### Job Fails with Database Error

- **Cause**: Database connection or migration issue
- **Check**: DATABASE_URL secret is correct
- **Solution**: Test database connection manually

### Job Times Out

- **Cause**: Repository processing takes longer than timeout
- **Check**: Large repositories may need more time
- **Solution**: Increase `timeoutSeconds` in cloudrun-job.yaml (max 7 days)

### Scheduler Not Triggering

- **Cause**: Service account permissions or scheduler paused
- **Check**: `gcloud scheduler jobs describe github-scraper-worker-scheduler`
- **Solution**: Ensure service account has `run.jobs.run` permission

## Manual Testing

```bash
# Trigger job manually (bypass scheduler)
gcloud run jobs execute ${JOB_NAME} --region=${REGION}

# Watch logs in real-time
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}"
```

## Cleanup

```bash
# Delete scheduler
gcloud scheduler jobs delete github-scraper-worker-scheduler \
  --location=${REGION}

# Delete Cloud Run Job
gcloud run jobs delete ${JOB_NAME} --region=${REGION}

# Delete secrets (optional)
gcloud secrets delete db-url redis-host redis-port redis-password github-token r2-account-id r2-access-key r2-secret-key r2-bucket
```

## Comparison: Cloud Run Jobs vs Kubernetes Worker

| Aspect | Cloud Run Jobs | Kubernetes Worker |
|--------|---------------|-------------------|
| **Complexity** | Lower | Higher |
| **Cost** | $0/month (free tier) | $0/month (OCI free tier) |
| **Scaling** | Automatic (via scheduler frequency) | Manual/HPA |
| **Resource Usage** | Pay per execution | Always running |
| **Best For** | Low-medium traffic | High traffic, continuous processing |
| **Setup Time** | ~15 minutes | ~1 hour |

## Next Steps

1. ✅ Deploy Cloud Run Job
2. ✅ Set up Cloud Scheduler
3. ✅ Test with a sample repository
4. ✅ Monitor costs and execution times
5. ✅ Adjust scheduler frequency if needed

For the full deployment guide including Firebase Hosting + Cloud Run API, see the main README.md.

