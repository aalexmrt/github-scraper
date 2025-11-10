# Deployment Quick Reference

Quick reference for deploying and verifying all services.

## 📋 OAuth Verification Checklist (Production)

### 1. Verify GitHub OAuth App Settings
- [ ] Go to https://github.com/settings/developers
- [ ] Open "GitHub Scraper (Prod)" OAuth App
- [ ] Homepage URL: `https://github-scraper-psi.vercel.app`
- [ ] Callback URL: `https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback`

### 2. Verify GCP Secrets
```bash
# Quick verification
gcloud secrets versions access latest --secret=frontend-url --project=personal-gcp-477623
# Should show: https://github-scraper-psi.vercel.app (no trailing slash)

gcloud secrets versions access latest --secret=backend-url --project=personal-gcp-477623
# Should show: https://api-sgmtwgzrlq-ue.a.run.app (no trailing slash)
```

### 3. Verify Cloud Run Deployment
```bash
# Check logs for correct URLs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 5 \
  --project=personal-gcp-477623 \
  --format="value(textPayload)"

# Should show:
# [AUTH] Frontend URL: https://github-scraper-psi.vercel.app
# [AUTH] Backend URL: https://api-sgmtwgzrlq-ue.a.run.app
# [AUTH] GitHub Client ID: Set
```

### 4. Test OAuth Flow
- [ ] Open: https://github-scraper-psi.vercel.app
- [ ] Click "Sign in with GitHub"
- [ ] After authorization, should redirect to: `https://github-scraper-psi.vercel.app/?auth=success`
- [ ] Verify your GitHub avatar appears in UI

---

## 🚀 Deployment Commands

### Backend API (Cloud Run Service)

```bash
# 1. Build Docker image (AMD64 for Cloud Run)
cd backend
docker build -f Dockerfile.prod \
  -t gcr.io/personal-gcp-477623/api:$(date +%Y%m%d)-amd64 \
  -t gcr.io/personal-gcp-477623/api:latest \
  --platform linux/amd64 \
  .

# 2. Push to GCR
docker push gcr.io/personal-gcp-477623/api:$(date +%Y%m%d)-amd64
docker push gcr.io/personal-gcp-477623/api:latest

# 3. Deploy to Cloud Run
cd ..
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1

# 4. Verify deployment
gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(status.url,status.latestReadyRevisionName)"
```

### Worker (Cloud Run Job)

```bash
# 1. Build Docker image
cd backend
docker build -f Dockerfile.cloudrun-worker \
  -t gcr.io/personal-gcp-477623/worker:$(date +%Y%m%d)-amd64 \
  -t gcr.io/personal-gcp-477623/worker:latest \
  --platform linux/amd64 \
  .

# 2. Push to GCR
docker push gcr.io/personal-gcp-477623/worker:$(date +%Y%m%d)-amd64
docker push gcr.io/personal-gcp-477623/worker:latest

# 3. Deploy to Cloud Run Jobs
cd ..
gcloud run jobs replace cloudrun-job.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1

# 4. Test the job manually
gcloud run jobs execute worker \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --wait
```

### Frontend (Vercel)

```bash
# Option 1: Deploy via CLI
cd frontend
vercel --prod

# Option 2: Git push (if Vercel Git integration is setup)
git push origin main  # Automatically deploys
```

---

## 🔐 Secrets Management

### View Current Secrets

```bash
# List all secrets
gcloud secrets list --project=personal-gcp-477623

# View specific secret
gcloud secrets versions access latest --secret=SECRET_NAME --project=personal-gcp-477623
```

### Update Secrets

```bash
# Update a single secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=personal-gcp-477623

# Update OAuth and URL secrets
./set-oauth-secrets.sh

# Update all secrets
./create-secrets.sh
```

### After Updating Secrets

```bash
# Redeploy to pick up new secrets
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1

# Verify new secrets are loaded (wait 30 seconds after deploy)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 3 \
  --project=personal-gcp-477623
```

---

## 🔄 Rollback Procedures

### Backend API

```bash
# List recent revisions
gcloud run revisions list \
  --service=api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="table(name,status.conditions.status,metadata.creationTimestamp)"

# Rollback to specific revision
gcloud run services update-traffic api \
  --to-revisions=REVISION_NAME=100 \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Worker

```bash
# Update to previous image
gcloud run jobs update worker \
  --image=gcr.io/personal-gcp-477623/worker:PREVIOUS_TAG \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Frontend

```bash
# Via Vercel dashboard
# Go to: https://vercel.com/aalexmrts-projects/github-scraper/deployments
# Select deployment → "Promote to Production"

# Or via CLI
cd frontend
vercel rollback
```

---

## 🐛 Troubleshooting

### OAuth Redirects to localhost:3001

**Cause:** Cloud Run is using old `FRONTEND_URL` secret

**Fix:**
```bash
# 1. Verify secret is correct
gcloud secrets versions access latest --secret=frontend-url --project=personal-gcp-477623

# 2. If incorrect, update it
echo -n "https://github-scraper-psi.vercel.app" | \
  gcloud secrets versions add frontend-url --data-file=- --project=personal-gcp-477623

# 3. Force new deployment (sometimes needed to bust cache)
# Update cloudrun.yaml to use specific version temporarily
sed -i '' 's/key: latest/key: "5"/g' cloudrun.yaml
gcloud run services replace cloudrun.yaml --project=personal-gcp-477623 --region=us-east1

# 4. Verify in logs (wait 30 seconds)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"Frontend URL"' \
  --limit 1 --project=personal-gcp-477623

# 5. Restore to 'latest' in cloudrun.yaml
sed -i '' 's/key: "5"/key: latest/g' cloudrun.yaml
```

### Backend Not Starting

```bash
# Check logs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit 50 \
  --project=personal-gcp-477623

# Common issues:
# - Missing secrets: Check all secrets are set
# - Database connection: Verify DATABASE_URL secret
# - Redis connection: Verify REDIS_* secrets
# - Prisma migrations: Check for migration errors in logs
```

### Worker Not Processing Jobs

```bash
# Check job status
gcloud run jobs describe worker \
  --region=us-east1 \
  --project=personal-gcp-477623

# Check recent executions
gcloud run jobs executions list \
  --job=worker \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --limit=5

# View logs from recent execution
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=worker' \
  --limit=100 \
  --project=personal-gcp-477623

# Manually trigger to test
gcloud run jobs execute worker \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --wait
```

### Frontend Build Failures

```bash
# Check Vercel deployment logs
vercel logs

# Common issues:
# - Missing dependencies: Check package.json
# - TypeScript errors: Run `npm run build` locally first
# - ESLint errors: Run `npm run lint` locally first
```

---

## 📊 Monitoring

### Check Service Health

```bash
# Backend API
curl https://api-sgmtwgzrlq-ue.a.run.app/health

# Frontend
curl https://github-scraper-psi.vercel.app
```

### View Logs

```bash
# Backend API (last 10 minutes)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=50 \
  --project=personal-gcp-477623

# Worker (last execution)
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=worker' \
  --limit=50 \
  --project=personal-gcp-477623 \
  --freshness=1h

# Follow logs in real-time
gcloud logging tail \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --project=personal-gcp-477623
```

### Check Costs

```bash
# Cloud Run costs
gcloud billing accounts list
gcloud billing projects describe personal-gcp-477623

# View in Cloud Console
# https://console.cloud.google.com/billing
```

---

## 🔗 Important URLs

### Production
- **Frontend**: https://github-scraper-psi.vercel.app
- **Backend API**: https://api-sgmtwgzrlq-ue.a.run.app
- **GitHub OAuth Callback**: https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback

### Dashboards
- **GCP Console**: https://console.cloud.google.com/run?project=personal-gcp-477623
- **Vercel Dashboard**: https://vercel.com/aalexmrts-projects/github-scraper
- **GitHub OAuth Apps**: https://github.com/settings/developers

### Documentation
- Full OAuth Setup: `OAUTH_SETUP.md`
- Architecture: `ARCHITECTURE.md`
- Deployment Guide: `DEPLOYMENT.md`

---

## 🚀 Next Steps: CI/CD Setup

For CI/CD automation, you can set up GitHub Actions or Cloud Build triggers. Quick start:

```bash
# 1. Setup CI/CD service account
./setup-cicd.sh

# 2. Add secrets to GitHub (or setup Cloud Build triggers)

# 3. For frontend, connect Vercel to GitHub
# Go to https://vercel.com → Import Git Repository

# 4. Push to main branch → automatic deployment! 🎉
```

