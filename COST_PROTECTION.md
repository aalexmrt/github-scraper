# Cost Protection Guide - Cloud Run Jobs

## 🛡️ Free Tier Limits (Critical to Know)

### Cloud Run Jobs (us-east1)

- **CPU**: 240,000 vCPU-seconds/month (~66.7 CPU-hours)
- **Memory**: 450,000 GiB-seconds/month (~125 GiB-hours)
- **Minimum billing**: 1 minute per task attempt (even if it finishes in 5 seconds)

### Cloud Scheduler

- **Free**: First 3 scheduler jobs per billing account per month
- **After free tier**: $0.10 per job per month

### Cloud Run API (if using for backend)

- **Free**: 2 million requests/month
- **CPU**: 180,000 vCPU-seconds/month
- **Memory**: 360,000 GiB-seconds/month

## 🔒 Step 1: Set Up Budget Alerts

### Create Budget Alert ($0.01 threshold)

```bash
# Create a budget that alerts at $0.01 (essentially free tier)
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="Free Tier Protection" \
  --budget-amount=0.01 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100 \
  --notification-rule=pubsub-topic=projects/YOUR_PROJECT_ID/topics/budget-alerts \
  --notification-rule=email=YOUR_EMAIL@example.com
```

**Get your billing account ID:**

```bash
gcloud billing accounts list
```

### Alternative: Simple Email Alert

```bash
# Create budget with email notifications only
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="Free Tier Protection" \
  --budget-amount=0.01 \
  --threshold-rule=percent=100 \
  --notification-rule=email=YOUR_EMAIL@example.com
```

## 🚨 Step 2: Set Resource Limits in cloudrun-job.yaml

Your `cloudrun-job.yaml` should have these conservative limits:

```yaml
spec:
  template:
    spec:
      containers:
        - resources:
            limits:
              cpu: '1' # ✅ Keep at 1 CPU
              memory: '512Mi' # ✅ Keep at 512Mi (minimum)
      timeoutSeconds: 600 # ✅ 10 minutes max (adjust based on needs)
      taskTimeoutSeconds: 600 # ✅ 10 minutes per task
```

**Why these limits?**

- CPU=1, Memory=512Mi: Minimum viable, stays well within free tier
- Timeout=600s: Prevents runaway jobs from consuming resources

## 📊 Step 3: Monitor Usage Daily

### Check Current Month Usage

```bash
# Check Cloud Run Jobs usage
gcloud logging read "resource.type=cloud_run_job" \
  --limit=1 \
  --format="table(timestamp,jsonPayload.message)"

# Check billing usage (requires billing API)
gcloud billing projects describe YOUR_PROJECT_ID \
  --format="value(billingAccountName)"
```

### Create a Usage Monitoring Script

```bash
#!/bin/bash
# check-usage.sh - Daily usage checker

PROJECT_ID=${PROJECT_ID:-"your-gcp-project"}
REGION=${REGION:-"us-east1"}
JOB_NAME=${JOB_NAME:-"github-scraper-worker"}

echo "📊 Cloud Run Jobs Usage Report"
echo "================================"

# Count executions this month
EXECUTIONS=$(gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --format="value(name)" \
  --filter="creationTimestamp>=$(date -u -d '1 month ago' +%Y-%m-%dT%H:%M:%SZ)" \
  2>/dev/null | wc -l)

echo "Executions this month: ${EXECUTIONS}"

# Estimate CPU usage (executions × avg duration × CPU)
# Assuming 2 minutes average, 1 CPU
CPU_SECONDS=$((EXECUTIONS * 2 * 60 * 1))
CPU_HOURS=$((CPU_SECONDS / 3600))

echo "Estimated CPU-seconds: ${CPU_SECONDS}"
echo "Estimated CPU-hours: ${CPU_HOURS}"
echo "Free tier limit: 66.7 CPU-hours"
echo ""

if [ $CPU_HOURS -gt 60 ]; then
  echo "⚠️  WARNING: Approaching free tier limit!"
else
  echo "✅ Well within free tier"
fi
```

Make it executable:

```bash
chmod +x check-usage.sh
```

## 🎯 Step 4: Optimize Scheduler Frequency

### Current Setup: Every 2 Minutes

```bash
# This runs 720 times/month
# Each execution: ~2 min × 1 CPU = 2 CPU-minutes
# Total: 720 × 2 = 1,440 CPU-minutes = 24 CPU-hours/month ✅
```

### If You Need to Reduce Usage

**Option 1: Run every 5 minutes** (288 executions/month = ~9.6 CPU-hours)

```bash
gcloud scheduler jobs update http github-scraper-worker-scheduler \
  --schedule="*/5 * * * *"
```

**Option 2: Run every 10 minutes** (144 executions/month = ~4.8 CPU-hours)

```bash
gcloud scheduler jobs update http github-scraper-worker-scheduler \
  --schedule="*/10 * * * *"
```

**Option 3: Only during business hours** (e.g., 9 AM - 5 PM UTC)

```bash
gcloud scheduler jobs update http github-scraper-worker-scheduler \
  --schedule="*/2 9-17 * * *"
```

## 🛑 Step 5: Set Up Automatic Pause on High Usage

### Create a Cloud Function to Pause Scheduler

```bash
# This requires Cloud Functions (also has free tier)
# Pauses scheduler if usage exceeds 80% of free tier
```

**Better approach**: Manual monitoring + pause command:

```bash
# Pause scheduler if needed
gcloud scheduler jobs pause github-scraper-worker-scheduler \
  --location=${REGION}

# Resume when safe
gcloud scheduler jobs resume github-scraper-worker-scheduler \
  --location=${REGION}
```

## 📋 Step 6: Cost-Safety Checklist

Before deploying, verify:

- [ ] **CPU limit**: Set to `1` (not higher)
- [ ] **Memory limit**: Set to `512Mi` (not higher)
- [ ] **Timeout**: Set to actual need (not unlimited)
- [ ] **Scheduler frequency**: Every 2+ minutes (not every minute)
- [ ] **Task count**: `1` (processes one job per execution)
- [ ] **Parallelism**: `1` (no parallel tasks)
- [ ] **Retries**: `0` in Cloud Run Job (let Bull handle retries)
- [ ] **Budget alert**: Set up at $0.01 threshold
- [ ] **Storage**: Using R2 (not Cloud Storage, which charges egress)

## 🔍 Step 7: Daily Monitoring Commands

Add these to your routine:

```bash
# 1. Check execution count
gcloud run jobs executions list \
  --job=github-scraper-worker \
  --region=us-east1 \
  --limit=5

# 2. Check recent logs for errors
gcloud logging read "resource.type=cloud_run_job AND severity>=ERROR" \
  --limit=10 \
  --format=json

# 3. Check scheduler status
gcloud scheduler jobs describe github-scraper-worker-scheduler \
  --location=us-east1

# 4. Estimate monthly cost (should be $0)
# Note: GCP doesn't provide easy cost estimation for free tier
# Use the check-usage.sh script above
```

## ⚠️ Common Cost Traps to Avoid

### ❌ DON'T:

1. **Set CPU > 1** - Doubles your usage
2. **Set Memory > 512Mi** - Increases memory-seconds usage
3. **Run scheduler every minute** - Doubles executions
4. **Set high timeout** - Jobs that hang consume resources
5. **Enable retries in Cloud Run Job** - Processes same job multiple times
6. **Use Cloud Storage** - Charges for egress (use R2 instead)
7. **Forget to pause scheduler** - Continues running even if not needed

### ✅ DO:

1. **Monitor daily** - Catch issues early
2. **Set budget alerts** - Get notified before charges
3. **Use R2 storage** - No egress fees
4. **Process one job per execution** - Predictable usage
5. **Keep timeouts reasonable** - Prevents runaway jobs
6. **Test locally first** - Avoid failed executions

## 🎯 Free Tier Math (Your Setup)

**Assumptions:**

- Scheduler: Every 2 minutes
- Executions/month: 720
- Average duration: 2 minutes
- CPU: 1
- Memory: 512Mi (0.5 GiB)

**Calculations:**

- CPU-seconds: 720 × 120s × 1 = **86,400 CPU-seconds** ✅ (limit: 240,000)
- GiB-seconds: 720 × 120s × 0.5 = **43,200 GiB-seconds** ✅ (limit: 450,000)
- Scheduler jobs: **1** ✅ (limit: 3)

**Safety margin**: You're using ~36% of CPU limit and ~9.6% of memory limit. Very safe!

## 🚨 Emergency Stop

If you see unexpected charges:

```bash
# 1. Pause scheduler immediately
gcloud scheduler jobs pause github-scraper-worker-scheduler \
  --location=us-east1

# 2. Delete Cloud Run Job (stops all executions)
gcloud run jobs delete github-scraper-worker \
  --region=us-east1

# 3. Check billing
gcloud billing accounts list
gcloud billing projects describe YOUR_PROJECT_ID
```

## 📱 Set Up Monitoring Dashboard

### Option 1: GCP Console

1. Go to Cloud Run → Jobs → Your Job
2. View "Executions" tab
3. Monitor "CPU time" and "Memory time"

### Option 2: Cloud Monitoring (Free Tier)

```bash
# Enable Cloud Monitoring API (free tier)
gcloud services enable monitoring.googleapis.com

# View metrics in console
# Navigate to: Monitoring → Metrics Explorer
# Metric: run.googleapis.com/job/execution_count
```

## ✅ Final Checklist

Before going live:

- [ ] Budget alert set at $0.01
- [ ] Email notifications configured
- [ ] Resource limits set (CPU=1, Memory=512Mi)
- [ ] Timeout set appropriately (600s)
- [ ] Scheduler frequency optimized (every 2+ minutes)
- [ ] Using R2 storage (not Cloud Storage)
- [ ] Monitoring script created (`check-usage.sh`)
- [ ] Daily monitoring routine established
- [ ] Emergency stop procedure documented
- [ ] Tested locally first

## 📞 Support

If you see unexpected charges:

1. Check GCP Billing dashboard
2. Review Cloud Run Jobs execution logs
3. Verify scheduler frequency
4. Check for failed/retried executions
5. Contact GCP support if needed

---

**Remember**: The free tier is generous, but monitoring is key. Set up alerts and check usage weekly to stay safe!
