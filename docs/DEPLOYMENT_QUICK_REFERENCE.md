# Deployment Quick Reference

Quick reference for deploying and verifying all services.

---

## 🏗️ Production Services Overview

### Cloud Providers & Services

#### **Google Cloud Platform (GCP)**

| Service                      | Name/Type                 | Purpose                          | Configuration                                    |
| ---------------------------- | ------------------------- | -------------------------------- | ------------------------------------------------ |
| **Cloud Run Service**        | `api`                     | Backend API server (Fastify)     | Auto-scales 0-3 instances, handles HTTP requests |
| **Cloud Run Job**            | `commit-worker`           | Processes repository commit jobs | Scheduled every 5 minutes via Cloud Scheduler    |
| **Cloud Run Job**            | `user-worker`             | Syncs user data via GitHub API   | Scheduled every 4 hours via Cloud Scheduler      |
| **Google Artifact Registry** | Container Registry        | Docker image storage             | Images: `api`, `commit-worker`, `user-worker`    |
| **Google Secret Manager**    | Secrets                   | Configuration & credentials      | Stores all environment variables securely        |
| **Cloud Scheduler**          | `commit-worker-scheduler` | Triggers commit worker           | Runs every 5 minutes (`*/5 * * * *`)             |
| **Cloud Scheduler**          | `user-worker-scheduler`   | Triggers user worker             | Runs every 4 hours (`0 */4 * * *`)               |

#### **Neon**

| Service        | Purpose          | Configuration                                              |
| -------------- | ---------------- | ---------------------------------------------------------- |
| **PostgreSQL** | Primary database | Connection via `DATABASE_URL` secret (from Neon dashboard) |

#### **Upstash**

| Service   | Purpose             | Configuration                                                                                |
| --------- | ------------------- | -------------------------------------------------------------------------------------------- |
| **Redis** | Job queue & caching | Connection via `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` secrets (from Upstash dashboard) |

#### **Cloudflare**

| Service        | Purpose                                          | Configuration                                                                                        |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **R2 Storage** | S3-compatible object storage for repository data | Configured via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` secrets |

#### **Vercel**

| Service      | Purpose                     | Configuration                       |
| ------------ | --------------------------- | ----------------------------------- |
| **Frontend** | Next.js application hosting | Deployed via Git integration or CLI |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Frontend: Vercel                            │
│              (Next.js Application)                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────────┐
│         Google Cloud Platform (GCP)                      │
│                                                           │
│  ┌──────────────────────────────────────────────┐      │
│  │ Cloud Run Service: api                        │      │
│  │ - Handles HTTP requests                        │      │
│  │ - Auto-scales (0-3 instances)                 │      │
│  │ - OAuth authentication                         │      │
│  └──────┬────────────────────┬───────────────────┘      │
│         │                    │                           │
│  ┌──────▼────────┐  ┌────────▼──────────┐              │
│  │ Neon          │  │ Upstash            │              │
│  │ (PostgreSQL)  │  │ (Redis)            │              │
│  └──────────────┘  └────────────────────┘              │
│                                                           │
│  ┌──────────────────────────────────────────────┐      │
│  │ Cloud Run Jobs (Scheduled)                   │      │
│  │                                              │      │
│  │ ┌────────────────┐  ┌──────────────────┐  │      │
│  │ │ commit-worker  │  │ user-worker      │  │      │
│  │ │ Every 5 min     │  │ Every 4 hours    │  │      │
│  │ └────────────────┘  └──────────────────┘  │      │
│  └──────────────────────────────────────────────┘      │
│                                                           │
│  ┌──────────────────────────────────────────────┐      │
│  │ Cloud Scheduler                               │      │
│  │ - commit-worker-scheduler                    │      │
│  │ - user-worker-scheduler                       │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│         Cloudflare R2 Storage                           │
│         (Repository data storage)                        │
└─────────────────────────────────────────────────────────┘
```

### Service Responsibilities

#### **Backend API (`api`)**

- Handles all HTTP requests from frontend
- Manages GitHub OAuth authentication
- Enqueues repository processing jobs to Redis
- Serves REST API endpoints (`/health`, `/leaderboard`, `/repositories`, `/auth/*`)
- Auto-scales based on traffic (0-3 instances)

#### **Commit Worker (`commit-worker`)**

- Processes repository commit jobs from Redis queue
- Clones/updates repositories from GitHub
- Analyzes commit history
- Generates contributor leaderboards
- Stores results in PostgreSQL
- Runs every 5 minutes via Cloud Scheduler
- Processes up to 10 jobs per execution (configurable via `MAX_JOBS_PER_EXECUTION`)

#### **User Worker (`user-worker`)**

- Syncs user data via GitHub API
- Refreshes contributor profiles
- Updates cached user information
- Runs every 4 hours via Cloud Scheduler

#### **PostgreSQL Database (Neon)**

- Stores repositories, contributors, and relationships
- Managed via Neon (serverless PostgreSQL)
- Connection string stored in Secret Manager (`DATABASE_URL` secret)
- Get connection string from Neon dashboard

#### **Redis (Upstash)**

- Job queue for asynchronous processing
- Caching layer
- Managed via Upstash (serverless Redis)
- Connection details stored in Secret Manager (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` secrets)
- Get credentials from Upstash dashboard

#### **Cloudflare R2**

- Stores cloned repository data (bare repos)
- S3-compatible API
- Replaces local file system storage for scalability

### Key Configuration Files

- `cloudrun.yaml` - Backend API service configuration
- `cloudrun-job-commit-worker.yaml` - Commit worker job configuration
- `cloudrun-job-user-worker.yaml` - User worker job configuration
- `setup-two-worker-schedulers.sh` - Cloud Scheduler setup script

---

## 📋 OAuth Verification Checklist (Production)

### 1. Verify GitHub OAuth App Settings

- [ ] Go to https://github.com/settings/developers
- [ ] Open "GitHub Scraper (Prod)" OAuth App
- [ ] Homepage URL: `https://your-app.vercel.app` (replace with your Vercel URL)
- [ ] Callback URL: `https://your-backend-url.run.app/auth/github/callback` (replace with your Cloud Run URL)

### 2. Verify GCP Secrets

```bash
# Quick verification
gcloud secrets versions access latest --secret=frontend-url --project=YOUR_GCP_PROJECT_ID
# Should show: https://your-app.vercel.app (no trailing slash)

gcloud secrets versions access latest --secret=backend-url --project=YOUR_GCP_PROJECT_ID
# Should show: https://your-backend-url.run.app (no trailing slash)
```

### 3. Verify Cloud Run Deployment

```bash
# Check logs for correct URLs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 5 \
  --project=YOUR_GCP_PROJECT_ID \
  --format="value(textPayload)"

# Should show:
# [AUTH] Frontend URL: https://your-app.vercel.app
# [AUTH] Backend URL: https://your-backend-url.run.app
# [AUTH] GitHub Client ID: Set
```

### 4. Test OAuth Flow

- [ ] Open: https://your-app.vercel.app (replace with your Vercel URL)
- [ ] Click "Sign in with GitHub"
- [ ] After authorization, should redirect to: `https://your-app.vercel.app/?auth=success`
- [ ] Verify your GitHub avatar appears in UI

---

## 🚀 Deployment Commands

### Backend API (Cloud Run Service)

```bash
# 1. Build Docker image (AMD64 for Cloud Run)
cd backend
docker build -f Dockerfile.prod \
  -t gcr.io/YOUR_GCP_PROJECT_ID/api:$(date +%Y%m%d)-amd64 \
  -t gcr.io/YOUR_GCP_PROJECT_ID/api:latest \
  --platform linux/amd64 \
  .

# 2. Push to GCR
docker push gcr.io/YOUR_GCP_PROJECT_ID/api:$(date +%Y%m%d)-amd64
docker push gcr.io/YOUR_GCP_PROJECT_ID/api:latest

# 3. Deploy to Cloud Run
cd ..
gcloud run services replace cloudrun.yaml \
  --project=YOUR_GCP_PROJECT_ID \
  --region=YOUR_REGION

# 4. Verify deployment
gcloud run services describe api \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --format="value(status.url,status.latestReadyRevisionName)"
```

### Commit Worker (Cloud Run Job)

```bash
# 1. Build Docker image
cd backend
docker build -f Dockerfile.cloudrun-commit-worker \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:$(date +%Y%m%d)-amd64 \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:latest \
  --platform linux/amd64 \
  .

# 2. Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:$(date +%Y%m%d)-amd64
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:latest

# 3. Deploy to Cloud Run Jobs
cd ..
gcloud run jobs replace cloudrun-job-commit-worker.yaml \
  --project=YOUR_GCP_PROJECT_ID \
  --region=YOUR_REGION

# 4. Test the job manually
gcloud run jobs execute commit-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --wait
```

### User Worker (Cloud Run Job)

```bash
# 1. Build Docker image
cd backend
docker build -f Dockerfile.cloudrun-user-worker \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:$(date +%Y%m%d)-amd64 \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:latest \
  --platform linux/amd64 \
  .

# 2. Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:$(date +%Y%m%d)-amd64
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:latest

# 3. Deploy to Cloud Run Jobs
cd ..
gcloud run jobs replace cloudrun-job-user-worker.yaml \
  --project=YOUR_GCP_PROJECT_ID \
  --region=YOUR_REGION

# 4. Test the job manually
gcloud run jobs execute user-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --wait
```

### Setup Cloud Schedulers

```bash
# Setup both commit-worker and user-worker schedulers
./setup-two-worker-schedulers.sh

# Or setup individually:
# Commit worker scheduler (every 5 minutes)
gcloud scheduler jobs create http commit-worker-scheduler \
  --location=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --schedule="*/5 * * * *" \
  --uri="https://YOUR_REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/commit-worker:run" \
  --http-method=POST \
  --oidc-service-account-email=${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

# User worker scheduler (every 4 hours)
gcloud scheduler jobs create http user-worker-scheduler \
  --location=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --schedule="0 */4 * * *" \
  --uri="https://YOUR_REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/user-worker:run" \
  --http-method=POST \
  --oidc-service-account-email=${PROJECT_NUMBER}-compute@developer.gserviceaccount.com
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
gcloud secrets list --project=YOUR_GCP_PROJECT_ID

# View specific secret
gcloud secrets versions access latest --secret=SECRET_NAME --project=YOUR_GCP_PROJECT_ID
```

### Update Secrets

```bash
# Update a single secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=YOUR_GCP_PROJECT_ID

# Update OAuth and URL secrets
./set-oauth-secrets.sh

# Update all secrets
./create-secrets.sh
```

### After Updating Secrets

```bash
# Redeploy to pick up new secrets
gcloud run services replace cloudrun.yaml \
  --project=YOUR_GCP_PROJECT_ID \
  --region=YOUR_REGION

# Verify new secrets are loaded (wait 30 seconds after deploy)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 3 \
  --project=YOUR_GCP_PROJECT_ID
```

---

## 🔄 Rollback Procedures

### Backend API

```bash
# List recent revisions
gcloud run revisions list \
  --service=api \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --format="table(name,status.conditions.status,metadata.creationTimestamp)"

# Rollback to specific revision
gcloud run services update-traffic api \
  --to-revisions=REVISION_NAME=100 \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID
```

### Workers

#### Commit Worker

```bash
# Update to previous image
gcloud run jobs update commit-worker \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:PREVIOUS_TAG \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID
```

#### User Worker

```bash
# Update to previous image
gcloud run jobs update user-worker \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:PREVIOUS_TAG \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID
```

### Frontend

```bash
# Via Vercel dashboard
# Go to: https://vercel.com/your-username/your-project/deployments
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
gcloud secrets versions access latest --secret=frontend-url --project=YOUR_GCP_PROJECT_ID

# 2. If incorrect, update it
echo -n "https://your-app.vercel.app" | \
  gcloud secrets versions add frontend-url --data-file=- --project=YOUR_GCP_PROJECT_ID

# 3. Force new deployment (sometimes needed to bust cache)
# Update cloudrun.yaml to use specific version temporarily
sed -i '' 's/key: latest/key: "5"/g' cloudrun.yaml
gcloud run services replace cloudrun.yaml --project=YOUR_GCP_PROJECT_ID --region=YOUR_REGION

# 4. Verify in logs (wait 30 seconds)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"Frontend URL"' \
  --limit 1 --project=YOUR_GCP_PROJECT_ID

# 5. Restore to 'latest' in cloudrun.yaml
sed -i '' 's/key: "5"/key: latest/g' cloudrun.yaml
```

### Backend Not Starting

```bash
# Check logs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit 50 \
  --project=YOUR_GCP_PROJECT_ID

# Common issues:
# - Missing secrets: Check all secrets are set
# - Database connection: Verify DATABASE_URL secret
# - Redis connection: Verify REDIS_* secrets
# - Prisma migrations: Check for migration errors in logs
```

### Workers Not Processing Jobs

#### Commit Worker

```bash
# Check job status
gcloud run jobs describe commit-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID

# Check recent executions
gcloud run jobs executions list \
  --job=commit-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --limit=5

# View logs from recent execution
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=commit-worker' \
  --limit=100 \
  --project=YOUR_GCP_PROJECT_ID

# Check scheduler status
gcloud scheduler jobs describe commit-worker-scheduler \
  --location=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID

# Manually trigger to test
gcloud run jobs execute commit-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --wait
```

#### User Worker

```bash
# Check job status
gcloud run jobs describe user-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID

# Check recent executions
gcloud run jobs executions list \
  --job=user-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --limit=5

# View logs from recent execution
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=user-worker' \
  --limit=100 \
  --project=YOUR_GCP_PROJECT_ID

# Check scheduler status
gcloud scheduler jobs describe user-worker-scheduler \
  --location=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID

# Manually trigger to test
gcloud run jobs execute user-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
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
curl https://your-backend-url.run.app/health

# Frontend
curl https://your-app.vercel.app
```

### View Logs

```bash
# Backend API (last 10 minutes)
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=50 \
  --project=YOUR_GCP_PROJECT_ID

# Commit Worker (last execution)
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=commit-worker' \
  --limit=50 \
  --project=YOUR_GCP_PROJECT_ID \
  --freshness=1h

# User Worker (last execution)
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=user-worker' \
  --limit=50 \
  --project=YOUR_GCP_PROJECT_ID \
  --freshness=1h

# Follow logs in real-time
gcloud logging tail \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --project=YOUR_GCP_PROJECT_ID

# Check all worker executions
gcloud run jobs executions list \
  --job=commit-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --limit=10

gcloud run jobs executions list \
  --job=user-worker \
  --region=YOUR_REGION \
  --project=YOUR_GCP_PROJECT_ID \
  --limit=10
```

### Check Costs

```bash
# Cloud Run costs
gcloud billing accounts list
gcloud billing projects describe YOUR_GCP_PROJECT_ID

# View in Cloud Console
# https://console.cloud.google.com/billing
```

---

## 🔗 Important URLs

### Production

- **Frontend**: https://your-app.vercel.app (replace with your Vercel URL)
- **Backend API**: https://your-backend-url.run.app (replace with your Cloud Run URL)
- **GitHub OAuth Callback**: https://your-backend-url.run.app/auth/github/callback

### Dashboards

- **GCP Console**: https://console.cloud.google.com/run?project=YOUR_GCP_PROJECT_ID
- **Vercel Dashboard**: https://vercel.com/your-username/your-project
- **GitHub OAuth Apps**: https://github.com/settings/developers

### Documentation

- Full OAuth Setup: `docs/OAUTH_SETUP.md`
- Architecture: `docs/ARCHITECTURE.md`
- Deployment Guide: `docs/DEPLOYMENT.md`

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
