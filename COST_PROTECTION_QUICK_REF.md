# 🛡️ Cost Protection Quick Reference

## Critical Limits (DO NOT EXCEED)

| Resource | Your Setting | Free Tier Limit | Status |
|----------|-------------|-----------------|--------|
| CPU | 1 | 240,000 CPU-seconds/month | ✅ Safe (~36% usage) |
| Memory | 512Mi | 450,000 GiB-seconds/month | ✅ Safe (~9.6% usage) |
| Scheduler Frequency | Every 2 min | 3 jobs/month free | ✅ Safe (1 job) |
| Timeout | 600s (10 min) | N/A | ✅ Safe |

## 🚨 Must-Do Before Deploying

1. **Set Budget Alert** ($0.01 threshold)
   ```bash
   gcloud billing budgets create --billing-account=BILLING_ID \
     --budget-amount=0.01 \
     --notification-rule=email=YOUR_EMAIL
   ```

2. **Verify Resource Limits** in `cloudrun-job.yaml`
   - CPU: `1` (not higher)
   - Memory: `512Mi` (not higher)
   - Timeout: `600` (reasonable)

3. **Set Scheduler Frequency** (every 2+ minutes)
   ```bash
   # Every 2 minutes = safe
   --schedule="*/2 * * * *"
   ```

4. **Run Usage Check Daily**
   ```bash
   ./check-usage.sh
   ```

## ⚠️ Cost Traps

- ❌ **CPU > 1**: Doubles your usage
- ❌ **Memory > 512Mi**: Increases memory-seconds
- ❌ **Scheduler every minute**: Doubles executions
- ❌ **High timeout**: Jobs that hang consume resources
- ❌ **Cloud Storage**: Charges egress (use R2 instead)

## 🆘 Emergency Stop

```bash
# Pause scheduler
gcloud scheduler jobs pause github-scraper-worker-scheduler --location=us-central1

# Delete job
gcloud run jobs delete github-scraper-worker --region=us-central1
```

## 📊 Monitoring

```bash
# Daily check
./check-usage.sh

# View executions
gcloud run jobs executions list --job=github-scraper-worker --region=us-central1

# Check scheduler
gcloud scheduler jobs describe github-scraper-worker-scheduler --location=us-central1
```

## 📚 Full Guide

See `COST_PROTECTION.md` for complete details.

