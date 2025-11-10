# Build and Deploy Guide

Complete guide for building and deploying new versions of the GitHub Scraper application.

## 📋 Prerequisites

- Docker installed and running
- `gcloud` CLI installed and authenticated
- `vercel` CLI installed (for frontend)
- Access to GCP project: `personal-gcp-477623`
- Access to Vercel project

## 🔢 Version Management

### Current Versions

- **Frontend**: `0.1.0` (in `frontend/package.json`)
- **Backend API**: `1.0.0` (in `backend/package.json`)
- **Worker**: `1.0.0` (same as backend, uses same codebase)

### Updating Versions

**Before deploying, update version numbers:**

1. **Update Backend Version** (affects both API and Worker):
   ```bash
   cd backend
   npm version patch  # 1.0.0 → 1.0.1
   # OR
   npm version minor   # 1.0.0 → 1.1.0
   # OR
   npm version major   # 1.0.0 → 2.0.0
   ```

2. **Update Frontend Version**:
   ```bash
   cd frontend
   npm version patch  # 0.1.0 → 0.1.1
   # OR
   npm version minor   # 0.1.0 → 0.2.0
   ```

3. **Commit version changes**:
   ```bash
   git add backend/package.json frontend/package.json
   git commit -m "chore: bump version to X.Y.Z"
   git push origin main
   ```

**Note**: The `/version` endpoint on the backend automatically reads from `package.json`, so versions will update automatically after deployment.

---

## 🚀 Deployment Process

### Step 1: Deploy Backend API

```bash
# Set variables
PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
VERSION=$(date +%Y%m%d-%H%M%S)  # Optional: use timestamp for versioning
# OR use semantic version from package.json:
VERSION=$(cd backend && node -p "require('./package.json').version")

# 1. Build Docker image (AMD64 for Cloud Run)
cd backend
docker build -f Dockerfile.prod \
  -t gcr.io/${PROJECT_ID}/api:${VERSION} \
  --platform linux/amd64 \
  .

# 2. Push to Google Container Registry
docker push gcr.io/${PROJECT_ID}/api:${VERSION}

# 3. Update cloudrun.yaml with version tag
cd ..
sed -i '' "s|image: gcr.io/${PROJECT_ID}/api:.*|image: gcr.io/${PROJECT_ID}/api:${VERSION}|g" cloudrun.yaml

# 4. Deploy to Cloud Run
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}

# 5. Verify deployment
gcloud run services describe api \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url,status.latestReadyRevisionName)"

# 6. Test health endpoint
curl https://api-sgmtwgzrlq-ue.a.run.app/health
curl https://api-sgmtwgzrlq-ue.a.run.app/version
```

### Step 2: Deploy Worker

```bash
# Set variables (same as above)
PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
VERSION=$(cd backend && node -p "require('./package.json').version")

# 1. Build Docker image
cd backend
docker build -f Dockerfile.cloudrun-worker \
  -t gcr.io/${PROJECT_ID}/worker:${VERSION} \
  --platform linux/amd64 \
  .

# 2. Push to Google Container Registry
docker push gcr.io/${PROJECT_ID}/worker:${VERSION}

# 3. Update cloudrun-job.yaml with version tag
cd ..
sed -i '' "s|image: gcr.io/${PROJECT_ID}/worker:.*|image: gcr.io/${PROJECT_ID}/worker:${VERSION}|g" cloudrun-job.yaml

# 4. Deploy to Cloud Run Jobs
gcloud run jobs replace cloudrun-job.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}

# 5. Test the job manually (optional)
gcloud run jobs execute worker \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --wait
```

### Step 3: Deploy Frontend

```bash
cd frontend

# Option 1: Deploy via Vercel CLI
vercel --prod

# Option 2: If Vercel Git integration is set up, just push to main
# git push origin main  # Automatically deploys

# Verify deployment
# Check: https://github-scraper-psi.vercel.app
# The version badge in the footer should show the new frontend version
```

---

## 📝 Complete Deployment Script

Save this as `deploy.sh` for easy deployment:

```bash
#!/bin/bash
set -e

PROJECT_ID="personal-gcp-477623"
REGION="us-east1"

# Get versions from package.json
BACKEND_VERSION=$(cd backend && node -p "require('./package.json').version")
FRONTEND_VERSION=$(cd frontend && node -p "require('./package.json').version")

echo "🚀 Starting deployment..."
echo "Backend version: ${BACKEND_VERSION}"
echo "Frontend version: ${FRONTEND_VERSION}"
echo ""

# Deploy Backend API
echo "📦 Building and deploying Backend API..."
cd backend
docker build -f Dockerfile.prod \
  -t gcr.io/${PROJECT_ID}/api:${BACKEND_VERSION} \
  -t gcr.io/${PROJECT_ID}/api:latest \
  --platform linux/amd64 \
  .
docker push gcr.io/${PROJECT_ID}/api:${BACKEND_VERSION}
docker push gcr.io/${PROJECT_ID}/api:latest
cd ..
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
echo "✅ Backend API deployed"

# Deploy Worker
echo "📦 Building and deploying Worker..."
cd backend
docker build -f Dockerfile.cloudrun-worker \
  -t gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION} \
  -t gcr.io/${PROJECT_ID}/worker:latest \
  --platform linux/amd64 \
  .
docker push gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION}
docker push gcr.io/${PROJECT_ID}/worker:latest
cd ..
gcloud run jobs replace cloudrun-job.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
echo "✅ Worker deployed"

# Deploy Frontend
echo "📦 Deploying Frontend..."
cd frontend
vercel --prod
cd ..
echo "✅ Frontend deployed"

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Verify versions:"
echo "  Backend: curl https://api-sgmtwgzrlq-ue.a.run.app/version"
echo "  Frontend: https://github-scraper-psi.vercel.app (check footer)"
```

Make it executable:
```bash
chmod +x deploy.sh
```

---

## 🔄 Quick Deployment Commands

### Deploy Everything
```bash
./deploy.sh
```

### Deploy Only Backend API
```bash
VERSION=$(cd backend && node -p "require('./package.json').version") && \
cd backend && \
docker build -f Dockerfile.prod -t gcr.io/personal-gcp-477623/api:${VERSION} --platform linux/amd64 . && \
docker push gcr.io/personal-gcp-477623/api:${VERSION} && \
cd .. && \
sed -i '' "s|image: gcr.io/personal-gcp-477623/api:.*|image: gcr.io/personal-gcp-477623/api:${VERSION}|g" cloudrun.yaml && \
gcloud run services replace cloudrun.yaml --project=personal-gcp-477623 --region=us-east1
```

### Deploy Only Worker
```bash
VERSION=$(cd backend && node -p "require('./package.json').version") && \
cd backend && \
docker build -f Dockerfile.cloudrun-worker -t gcr.io/personal-gcp-477623/worker:${VERSION} --platform linux/amd64 . && \
docker push gcr.io/personal-gcp-477623/worker:${VERSION} && \
cd .. && \
sed -i '' "s|image: gcr.io/personal-gcp-477623/worker:.*|image: gcr.io/personal-gcp-477623/worker:${VERSION}|g" cloudrun-job.yaml && \
gcloud run jobs replace cloudrun-job.yaml --project=personal-gcp-477623 --region=us-east1
```

### Deploy Only Frontend
```bash
cd frontend && vercel --prod
```

---

## ✅ Post-Deployment Verification

### 1. Check Backend Version
```bash
curl https://api-sgmtwgzrlq-ue.a.run.app/version
# Should return: {"api":"1.0.0","worker":"1.0.0"}
```

### 2. Check Frontend Version
- Visit: https://github-scraper-psi.vercel.app
- Scroll to footer
- Verify version badge shows correct versions

### 3. Check Service Health
```bash
# Backend health
curl https://api-sgmtwgzrlq-ue.a.run.app/health

# Frontend
curl https://github-scraper-psi.vercel.app
```

### 4. Check Logs
```bash
# Backend logs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=20 \
  --project=personal-gcp-477623

# Worker logs
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=worker' \
  --limit=20 \
  --project=personal-gcp-477623 \
  --freshness=1h
```

---

## 🔙 Rollback Procedures

### Rollback Backend API
```bash
# List recent revisions
gcloud run revisions list \
  --service=api \
  --region=us-east1 \
  --project=personal-gcp-477623

# Rollback to specific revision
gcloud run services update-traffic api \
  --to-revisions=REVISION_NAME=100 \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Rollback Worker
```bash
# Update to previous image tag
gcloud run jobs update worker \
  --image=gcr.io/personal-gcp-477623/worker:PREVIOUS_VERSION \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Rollback Frontend
```bash
# Via Vercel dashboard:
# https://vercel.com/aalexmrts-projects/github-scraper/deployments
# Select previous deployment → "Promote to Production"

# Or via CLI:
cd frontend
vercel rollback
```

---

## 📊 Version Tagging Strategy

### Recommended Approach

1. **Use Semantic Versioning**:
   - `MAJOR.MINOR.PATCH` (e.g., `1.0.0`)
   - Patch: bug fixes
   - Minor: new features (backward compatible)
   - Major: breaking changes

2. **Tag Docker Images**:
   ```bash
   # Build and tag with version (done automatically by deploy.sh)
   docker build -f Dockerfile.prod \
     -t gcr.io/personal-gcp-477623/api:1.0.1 \
     --platform linux/amd64 .
   
   # Push version tag
   docker push gcr.io/personal-gcp-477623/api:1.0.1
   
   # Note: deploy.sh automatically updates cloudrun.yaml with the version tag
   ```

3. **Git Tags** (optional but recommended):
   ```bash
   git tag -a v1.0.1 -m "Release version 1.0.1"
   git push origin v1.0.1
   ```

---

## 🎯 Best Practices

1. **Always update version numbers** before deploying
2. **Test locally** before deploying to production
3. **Deploy in order**: Backend → Worker → Frontend
4. **Verify deployments** using the `/version` endpoint and footer badge
5. **Keep deployment logs** for troubleshooting
6. **Use semantic versioning** consistently
7. **Use version tags** in Cloud Run configs (not `latest`) for better traceability
8. **Document breaking changes** in commit messages

---

## 🐛 Troubleshooting

### Docker Build Fails
```bash
# Clear Docker cache
docker system prune -a

# Build without cache
docker build --no-cache -f Dockerfile.prod ...
```

### Push to GCR Fails
```bash
# Re-authenticate Docker
gcloud auth configure-docker
```

### Cloud Run Deployment Fails
```bash
# Check logs
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=50 \
  --project=personal-gcp-477623
```

### Version Not Updating
- Verify `package.json` version was updated
- Check that Docker image was rebuilt
- Verify `/version` endpoint returns correct version
- Clear browser cache if frontend version not updating

---

## 📚 Related Documentation

- `DEPLOYMENT_QUICK_REFERENCE.md` - Quick command reference
- `CICD_DEPLOYMENT_STRATEGY.md` - CI/CD setup (future automation)
- `DEPLOYMENT.md` - Full deployment architecture
- `OAUTH_SETUP.md` - OAuth configuration

