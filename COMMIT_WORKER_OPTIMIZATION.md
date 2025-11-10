# Commit Worker Optimization

## Overview

The commit worker has been optimized to process **multiple jobs per execution in parallel batches**, making it significantly more efficient while staying within Google Cloud Platform's free tier limits.

## Performance Comparison

### Before Optimization (1 job per execution, sequential)

- **100 repos**: 100 executions × 2 minutes = **200 minutes (~3.3 hours)**
- **Monthly executions**: 8,640 (every 5 minutes)
- **Resource usage**: 1,036,800 vCPU-seconds/month ❌ **(OVER FREE TIER LIMIT!)**

### After Optimization v1 (10 jobs per execution, sequential)

- **100 repos**: 10 executions × 20 minutes = **200 minutes (~3.3 hours)** ✅
- **Monthly executions**: ~10 (assuming 100 repos/month)
- **Resource usage**: ~12,000 vCPU-seconds/month ✅ **(WITHIN FREE TIER LIMIT!)**

### After Optimization v2 (50 jobs per execution, 10 concurrent)

- **100 repos**: 2 executions × 12 minutes = **24 minutes** ✅
- **1,000 repos**: 20 executions × 12 minutes = **240 minutes (~4 hours)** ✅
- **10,000 repos**: 200 executions × 12 minutes = **2,400 minutes (~40 hours)** ✅
- **Monthly executions**: ~200 (for 10k repos/month)
- **Resource usage**: ~144,000 vCPU-seconds/month ✅ **(WITHIN FREE TIER LIMIT!)**

**Result: 8x faster than sequential batching, stays within free tier!**

## How It Works

### Scheduler Behavior

- **Frequency**: Triggers every 5 minutes (`*/5 * * * *`)
- **Per Execution**: Processes up to 50 jobs (configurable via `MAX_JOBS_PER_EXECUTION`)
- **Concurrency**: Processes 10 jobs simultaneously (configurable via `MAX_CONCURRENT_JOBS`)
- **Timeout**: 60 minutes per execution (allows time for parallel batch processing)

### Processing Flow

1. Scheduler triggers the worker
2. Worker connects to Redis and checks for waiting jobs
3. Worker processes up to `MAX_JOBS_PER_EXECUTION` jobs in parallel batches
4. Each batch processes `MAX_CONCURRENT_JOBS` repos simultaneously
5. Worker exits after processing all batches

### Example Timeline (50 repos, 10 concurrent)

- **00:00** → Process repos 1-10 concurrently (takes ~12 minutes) → exits
- **00:05** → Process repos 11-20 concurrently (takes ~12 minutes) → exits
- **00:10** → Process repos 21-30 concurrently (takes ~12 minutes) → exits
- **00:15** → Process repos 31-40 concurrently (takes ~12 minutes) → exits
- **00:20** → Process repos 41-50 concurrently (takes ~12 minutes) → exits
- **00:25** → No jobs → exits immediately

**Total time: ~25 minutes** (same as sequential, but scales better)

### Example Timeline (100 repos, 10 concurrent)

- **00:00** → Process repos 1-50 in 5 batches of 10 (takes ~12 minutes) → exits
- **00:05** → Process repos 51-100 in 5 batches of 10 (takes ~12 minutes) → exits

**Total time: ~24 minutes** (vs ~200 minutes sequential)

## Free Tier Limits & Usage

### Google Cloud Run Free Tier Limits

- **vCPU-seconds**: 180,000/month
- **GB-seconds**: 360,000/month
- **Requests**: 2,000,000/month

### Resource Usage Calculation (50 jobs/execution, 10 concurrent)

**Per Execution:**

- Each job: ~2 minutes = 120 seconds
- Processing 50 jobs with 10 concurrent: 5 batches × 120 seconds = **600 seconds per execution**
- vCPU-seconds: 600 × 1 CPU = **600 per execution**
- GB-seconds: 600 × 0.5 GB = **300 per execution**

**For 1,000 repos/month:**

- Executions needed: 1,000 ÷ 50 = **20 executions**
- Total vCPU-seconds: 20 × 600 = **12,000** ✅ (7% of limit)
- Total GB-seconds: 20 × 300 = **6,000** ✅ (2% of limit)

**For 10,000 repos/month:**

- Executions needed: 10,000 ÷ 50 = **200 executions**
- Total vCPU-seconds: 200 × 600 = **120,000** ✅ (67% of limit)
- Total GB-seconds: 200 × 300 = **60,000** ✅ (17% of limit)

**Well within free tier limits even at 10k repos/month!**

## Configuration

### Default Settings

- **MAX_JOBS_PER_EXECUTION**: `50` (configurable via environment variable)
- **MAX_CONCURRENT_JOBS**: `10` (configurable via environment variable)
- **COMMIT_WORKER_CONCURRENCY**: `10` (Bull processor concurrency)
- **Scheduler interval**: Every 5 minutes
- **Execution timeout**: 60 minutes (scheduler)
- **Per-job timeout**: 10 minutes

### Adjusting Batch Size and Concurrency

Edit `cloudrun-job-commit-worker.yaml`:

```yaml
- name: MAX_JOBS_PER_EXECUTION
  value: '50' # Total jobs to process per execution
- name: MAX_CONCURRENT_JOBS
  value: '10' # Jobs to process simultaneously
- name: COMMIT_WORKER_CONCURRENCY
  value: '10' # Bull processor concurrency (should match MAX_CONCURRENT_JOBS)
```

**Recommendations:**

| Batch Size | Concurrent | Execution Time | Use Case                      |
| ---------- | ---------- | -------------- | ----------------------------- |
| 20         | 5          | ~8 minutes     | Conservative, lower risk      |
| 50         | 10         | ~12 minutes    | **Recommended** (default)     |
| 100        | 20         | ~12 minutes    | Aggressive, faster processing |

**Note**: The scheduler timeout is set to 60 minutes (`--attempt-deadline=3600s`) to accommodate larger batches.

## Deployment

### 1. Rebuild and Deploy Worker

```bash
./deploy.sh commit-worker
```

This will:

- Build the Docker image with the optimized code
- Push to Google Container Registry
- Update the Cloud Run Job configuration

### 2. Update Scheduler Timeout

```bash
PROJECT_ID=your-project-id ./setup-two-worker-schedulers.sh
```

This updates the scheduler to allow 30-minute executions (needed for processing multiple jobs).

### 3. Verify It's Working

```bash
# Check current status
./debug-commit-worker.sh repos

# Trigger manually to test
./debug-commit-worker.sh trigger

# View logs
./view-prod-logs.sh commit-worker
```

## Monitoring

### Check Queue Status

```bash
# With GCP secrets
PROJECT_ID=your-project-id ./check-queue-gcp.sh

# Or use debug script
./debug-commit-worker.sh queue
```

### View Processing Logs

```bash
# Recent logs
./view-prod-logs.sh commit-worker

# Stream logs
./view-prod-logs.sh commit-worker --tail

# Error logs only
./debug-commit-worker.sh errors
```

### Check Repository States

```bash
./debug-commit-worker.sh repos
```

## Benefits

✅ **8x faster processing** - 1,000 repos in ~4 hours instead of ~33 hours  
✅ **Stays within free tier** - Uses only ~67% of vCPU limit even at 10k repos/month  
✅ **Parallel processing** - Processes multiple repos simultaneously  
✅ **More efficient** - Fewer Cloud Run invocations  
✅ **Cost-effective** - No additional charges  
✅ **Configurable** - Easy to adjust batch size and concurrency  
✅ **Resilient** - Continues processing even if one job fails  
✅ **Scalable** - Can handle 10k+ repos/month within free tier

## Troubleshooting

### Worker Not Processing Multiple Jobs

1. **Check environment variable is set:**

   ```bash
   gcloud run jobs describe commit-worker --region=us-east1 --format="value(spec.template.spec.containers[0].env)"
   ```

   Look for `MAX_JOBS_PER_EXECUTION=10`

2. **Check logs for batch processing:**
   ```bash
   ./view-prod-logs.sh commit-worker | grep "Processing.*job"
   ```
   Should show: `Processing X job(s) (max: 10, total waiting: Y)`

### Jobs Timing Out

If jobs are timing out, you may need to:

1. Reduce `MAX_JOBS_PER_EXECUTION` (fewer jobs per execution)
2. Increase scheduler timeout (if processing many jobs)
3. Check if individual repos are taking too long to process

### Still Processing One at a Time

Make sure you've:

1. ✅ Rebuilt and deployed the worker (`./deploy.sh commit-worker`)
2. ✅ Updated the scheduler timeout (`./setup-two-worker-schedulers.sh`)
3. ✅ Verified the environment variable is set in Cloud Run Job

## Manual Processing

If you need to process repos immediately without waiting for the scheduler:

```bash
# Process all remaining repos
./debug-commit-worker.sh process-all

# Or trigger multiple times
./debug-commit-worker.sh trigger-multiple 10
```

## Cost Analysis

### Monthly Cost Breakdown

**For 1,000 repos/month:**
| Metric | Usage | Limit | Percentage |
|--------|-------|-------|------------|
| vCPU-seconds | 12,000 | 180,000 | 7% |
| GB-seconds | 6,000 | 360,000 | 2% |
| Requests | ~20 | 2,000,000 | 0.001% |

**For 10,000 repos/month:**
| Metric | Usage | Limit | Percentage |
|--------|-------|-------|------------|
| vCPU-seconds | 120,000 | 180,000 | 67% |
| GB-seconds | 60,000 | 360,000 | 17% |
| Requests | ~200 | 2,000,000 | 0.01% |

**Total Cost: $0/month** ✅ (stays within free tier even at 10k repos/month)

## Future Optimizations

Potential improvements if you exceed free tier:

1. **Parallel processing**: Process multiple jobs concurrently (requires more CPU)
2. **Dynamic batching**: Adjust batch size based on queue length
3. **Priority queues**: Process high-priority repos first
4. **Auto-scaling**: Scale workers based on queue depth

## Related Files

- `backend/src/workers/cloudrun-commit-worker.ts` - Main worker implementation
- `cloudrun-job-commit-worker.yaml` - Cloud Run Job configuration
- `setup-two-worker-schedulers.sh` - Scheduler setup script
- `debug-commit-worker.sh` - Debugging and monitoring tools
