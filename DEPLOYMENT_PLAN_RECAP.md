# 🚀 Complete Deployment Plan Recap

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         Frontend: Firebase Hosting                      │
│         (Next.js Application)                           │
│                                                          │
│         /api → Rewrites to Cloud Run API                │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────────┐
│         Backend API: Cloud Run                          │
│         - Fastify HTTP Server                           │
│         - Handles /leaderboard, /repositories          │
│         - Enqueues jobs to Redis                        │
└────┬────────────────────┬──────────────────┬───────────┘
     │                    │                  │
┌────▼────────┐  ┌────────▼────────┐  ┌─────▼────────┐
│   Neon      │  │   Upstash       │  │  Cloud Run   │
│  Postgres   │  │    Redis        │  │    Jobs     │
│  (Free)     │  │   (Free)        │  │  (Worker)    │
└─────────────┘  └─────────────────┘  └─────┬────────┘
                                             │
                                    ┌────────▼────────┐
                                    │ Cloud Scheduler  │
                                    │ (Every 2 min)    │
                                    └──────────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Cloudflare R2   │
                                    │  (Repository     │
                                    │   Storage)       │
                                    └──────────────────┘
```

## 🎯 Deployment Stack

| Component       | Service          | Free Tier                          | Cost         |
| --------------- | ---------------- | ---------------------------------- | ------------ |
| **Frontend**    | Firebase Hosting | Small sites free, global CDN       | **$0/month** |
| **Backend API** | Cloud Run        | 2M requests, 180k CPU-seconds      | **$0/month** |
| **Worker**      | Cloud Run Jobs   | 240k CPU-seconds, 450k GiB-seconds | **$0/month** |
| **Database**    | Neon Postgres    | Free tier for demos                | **$0/month** |
| **Redis**       | Upstash Redis    | 500k commands/month, 256MB         | **$0/month** |
| **Storage**     | Cloudflare R2    | 10GB free, unlimited egress        | **$0/month** |
| **Scheduler**   | Cloud Scheduler  | First 3 jobs free                  | **$0/month** |

**Total Monthly Cost: $0/month** ✅

## 📋 Deployment Steps

### Phase 1: Prerequisites & Setup

1. **Create Accounts**

   - [ ] Google Cloud Project (with billing enabled)
   - [ ] Firebase account (linked to GCP project)
   - [ ] Neon account (Postgres)
   - [ ] Upstash account (Redis)
   - [ ] Cloudflare account (R2 storage)

2. **Install Tools**

   ```bash
   # Install gcloud CLI
   # Install firebase-tools
   npm i -g firebase-tools
   # Install Docker
   ```

3. **Set Environment Variables**
   ```bash
   export PROJECT_ID="your-gcp-project"
   export REGION="us-central1"
   export SERVICE="demo-api"
   export JOB_NAME="github-scraper-worker"
   ```

### Phase 2: Database & Redis Setup

1. **Neon Postgres**

   - Create Neon project
   - Get connection string: `DATABASE_URL=postgres://...`
   - Save for secrets

2. **Upstash Redis**
   - Create Redis database (closest region to Cloud Run)
   - Get connection details:
     - `REDIS_HOST`
     - `REDIS_PORT` (usually 6379)
     - `REDIS_PASSWORD`
     - Enable TLS: `REDIS_TLS=true`

### Phase 3: Cloudflare R2 Storage

1. **Create R2 Bucket**
   - Go to Cloudflare Dashboard → R2
   - Create bucket: `github-repos`
   - Create API token with Read/Write permissions
   - Save credentials:
     - `R2_ACCOUNT_ID`
     - `R2_ACCESS_KEY_ID`
     - `R2_SECRET_ACCESS_KEY`
     - `R2_BUCKET_NAME`

### Phase 4: Deploy Backend API (Cloud Run)

1. **Create Secrets**

   ```bash
   printf '%s' "$DATABASE_URL" | gcloud secrets create demo-db-url --data-file=-
   printf '%s' "$REDIS_HOST" | gcloud secrets create demo-redis-host --data-file=-
   printf '%s' "$REDIS_PORT" | gcloud secrets create demo-redis-port --data-file=-
   printf '%s' "$REDIS_PASSWORD" | gcloud secrets create demo-redis-password --data-file=-
   printf '%s' "$GITHUB_TOKEN" | gcloud secrets create demo-github-token --data-file=-
   printf '%s' "$R2_ACCOUNT_ID" | gcloud secrets create demo-r2-account-id --data-file=-
   printf '%s' "$R2_ACCESS_KEY_ID" | gcloud secrets create demo-r2-access-key --data-file=-
   printf '%s' "$R2_SECRET_ACCESS_KEY" | gcloud secrets create demo-r2-secret-key --data-file=-
   printf '%s' "$R2_BUCKET_NAME" | gcloud secrets create demo-r2-bucket --data-file=-
   ```

2. **Build & Push API Image**

   ```bash
   cd backend
   docker build -f Dockerfile.prod -t gcr.io/$PROJECT_ID/$SERVICE:latest .
   gcloud auth configure-docker
   docker push gcr.io/$PROJECT_ID/$SERVICE:latest
   ```

3. **Deploy Cloud Run Service**

   ```bash
   # Update cloudrun.yaml with your PROJECT_ID
   sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" cloudrun.yaml

   # Deploy
   gcloud run services replace cloudrun.yaml \
     --project=$PROJECT_ID \
     --region=$REGION \
     --allow-unauthenticated
   ```

4. **Get Service URL**
   ```bash
   gcloud run services describe $SERVICE \
     --region=$REGION \
     --format="value(status.url)"
   ```

### Phase 5: Deploy Worker (Cloud Run Jobs)

1. **Build & Push Worker Image**

   ```bash
   cd backend
   docker build -f Dockerfile.cloudrun-worker -t gcr.io/$PROJECT_ID/$JOB_NAME:latest .
   docker push gcr.io/$PROJECT_ID/$JOB_NAME:latest
   ```

2. **Update cloudrun-job.yaml**

   ```bash
   sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" cloudrun-job.yaml
   ```

3. **Deploy Cloud Run Job**

   ```bash
   gcloud run jobs replace cloudrun-job.yaml \
     --project=$PROJECT_ID \
     --region=$REGION
   ```

4. **Set Up Cloud Scheduler**

   ```bash
   ./setup-cloud-scheduler.sh
   ```

   Or manually:

   ```bash
   gcloud scheduler jobs create http ${JOB_NAME}-scheduler \
     --location=${REGION} \
     --schedule="*/2 * * * *" \
     --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
     --http-method=POST \
     --oidc-service-account-email=${PROJECT_ID}@appspot.gserviceaccount.com
   ```

### Phase 6: Deploy Frontend (Firebase Hosting)

1. **Initialize Firebase**

   ```bash
   firebase login
   firebase init hosting
   # Choose: Use existing project
   # Public directory: .next/out (or your build output)
   ```

2. **Update firebase.json**

   ```json
   {
     "hosting": {
       "public": ".next/out",
       "rewrites": [
         {
           "source": "/api{,/**}",
           "run": {
             "serviceId": "demo-api",
             "region": "us-central1"
           }
         },
         { "source": "/**", "destination": "/index.html" }
       ]
     }
   }
   ```

3. **Build Frontend**

   ```bash
   cd frontend
   npm run build
   # If Next.js, ensure you export static files
   ```

4. **Deploy**
   ```bash
   firebase deploy --only hosting
   ```

### Phase 7: Cost Protection Setup

1. **Set Budget Alert** (CRITICAL)

   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_BILLING_ACCOUNT_ID \
     --budget-amount=0.01 \
     --notification-rule=email=YOUR_EMAIL@example.com
   ```

2. **Verify Resource Limits**

   - ✅ CPU: 1 (in cloudrun.yaml and cloudrun-job.yaml)
   - ✅ Memory: 512Mi
   - ✅ Timeout: 600s
   - ✅ Scheduler: Every 2+ minutes

3. **Set Up Monitoring**

   ```bash
   # Make monitoring script executable
   chmod +x check-usage.sh

   # Run daily
   ./check-usage.sh
   ```

## 🔄 Deployment Workflow

### Initial Deployment

```
1. Setup accounts & tools
2. Configure databases (Neon, Upstash, R2)
3. Create GCP secrets
4. Build & deploy backend API
5. Build & deploy worker job
6. Set up Cloud Scheduler
7. Deploy frontend to Firebase
8. Set up cost protection
```

### Updates/Re-deployments

**Backend API:**

```bash
cd backend
docker build -f Dockerfile.prod -t gcr.io/$PROJECT_ID/$SERVICE:latest .
docker push gcr.io/$PROJECT_ID/$SERVICE:latest
gcloud run services replace cloudrun.yaml --region=$REGION
```

**Worker:**

```bash
cd backend
docker build -f Dockerfile.cloudrun-worker -t gcr.io/$PROJECT_ID/$JOB_NAME:latest .
docker push gcr.io/$PROJECT_ID/$JOB_NAME:latest
gcloud run jobs replace cloudrun-job.yaml --region=$REGION
```

**Frontend:**

```bash
cd frontend
npm run build
firebase deploy --only hosting
```

## 📊 Resource Usage Estimates

### Cloud Run API

- **Requests**: ~10k/month (well under 2M free tier)
- **CPU**: ~5 CPU-hours/month (well under 180k CPU-seconds)
- **Status**: ✅ Safe

### Cloud Run Jobs (Worker)

- **Executions**: 720/month (every 2 minutes)
- **CPU**: ~24 CPU-hours/month (well under 66.7 CPU-hours)
- **Memory**: ~12 GiB-hours/month (well under 125 GiB-hours)
- **Status**: ✅ Safe (~36% CPU, ~9.6% memory usage)

### Cloud Scheduler

- **Jobs**: 1 scheduler job
- **Status**: ✅ Safe (1 of 3 free)

## 🛡️ Cost Protection Checklist

Before going live, verify:

- [ ] Budget alert set at $0.01
- [ ] Email notifications configured
- [ ] CPU limits: 1 (not higher)
- [ ] Memory limits: 512Mi (not higher)
- [ ] Timeouts: 600s (reasonable)
- [ ] Scheduler: Every 2+ minutes
- [ ] Using R2 storage (not Cloud Storage)
- [ ] Monitoring script (`check-usage.sh`) ready
- [ ] Daily monitoring routine established

## 📁 Files Created

### Configuration Files

- `cloudrun.yaml` - Backend API Cloud Run config
- `cloudrun-job.yaml` - Worker Cloud Run Jobs config
- `firebase.json` - Firebase Hosting config
- `.firebaserc` - Firebase project config

### Deployment Scripts

- `deploy-cloudrun-job.sh` - Worker deployment script
- `setup-cloud-scheduler.sh` - Scheduler setup script
- `check-usage.sh` - Daily usage monitoring

### Documentation

- `COST_PROTECTION.md` - Complete cost protection guide
- `COST_PROTECTION_QUICK_REF.md` - Quick reference
- `CLOUDRUN_JOBS_GUIDE.md` - Cloud Run Jobs guide

### Code Changes

- `backend/src/workers/cloudrunWorker.ts` - Cloud Run Jobs-compatible worker
- `backend/Dockerfile.cloudrun-worker` - Worker Dockerfile
- `backend/package.json` - Added cloudrun-worker scripts

## 🎯 Key Differences from Original Plan

### Original Plan (OCI Kubernetes)

- Self-hosted PostgreSQL in K8s
- Self-hosted Redis in K8s
- Worker as continuous K8s Deployment
- More complex setup

### New Plan (Cloud Run + Managed Services)

- ✅ Neon Postgres (managed)
- ✅ Upstash Redis (managed)
- ✅ Worker as Cloud Run Jobs (event-driven)
- ✅ Simpler setup, same $0 cost
- ✅ Better for demos/MVP

## 🚀 Next Steps

1. **Today**: Set up accounts (GCP, Firebase, Neon, Upstash, Cloudflare)
2. **Tomorrow**: Deploy backend API and worker
3. **Day 3**: Deploy frontend and test end-to-end
4. **Day 4**: Set up monitoring and cost protection
5. **Ongoing**: Monitor usage weekly with `check-usage.sh`

## 📞 Quick Commands Reference

```bash
# Check usage
./check-usage.sh

# View API logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# View worker executions
gcloud run jobs executions list --job=$JOB_NAME --region=$REGION

# Pause scheduler (emergency)
gcloud scheduler jobs pause ${JOB_NAME}-scheduler --location=$REGION

# Manual worker trigger
gcloud run jobs execute $JOB_NAME --region=$REGION
```

---

**Ready to deploy?** Start with Phase 1 and work through each phase systematically. The entire setup should take 2-3 hours for first-time deployment.
