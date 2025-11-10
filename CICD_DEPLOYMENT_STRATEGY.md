# CI/CD Deployment Strategy

This document outlines the CI/CD deployment strategy for all services in the GitHub Scraper application.

## Architecture Overview

The application consists of three main deployable components:

1. **Backend API** (Cloud Run Service)
   - Handles HTTP requests, OAuth, and repository management
   - Enqueues scraping jobs to Redis
   - Technology: Node.js (Fastify), TypeScript, Prisma

2. **Worker** (Cloud Run Job)
   - Processes scraping jobs from Redis queue
   - Clones repositories and analyzes commits
   - Triggered by Cloud Scheduler (every 5 minutes)
   - Technology: Node.js, TypeScript, Prisma

3. **Frontend** (Vercel)
   - User interface for submitting repositories and viewing leaderboards
   - Technology: Next.js 15, React, TailwindCSS

---

## Current Deployment Process (Manual)

### Backend API

```bash
# 1. Build Docker image
cd backend
docker build -f Dockerfile.prod -t gcr.io/personal-gcp-477623/api:latest .

# 2. Push to Google Container Registry
docker push gcr.io/personal-gcp-477623/api:latest

# 3. Deploy to Cloud Run
cd ..
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1
```

### Worker

```bash
# 1. Build Docker image
cd backend
docker build -f Dockerfile.cloudrun-worker -t gcr.io/personal-gcp-477623/worker:latest .

# 2. Push to Google Container Registry
docker push gcr.io/personal-gcp-477623/worker:latest

# 3. Deploy to Cloud Run Jobs
cd ..
gcloud run jobs replace cloudrun-job.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1
```

### Frontend

```bash
# 1. Build and deploy to Vercel
cd frontend
vercel --prod
```

---

## Proposed CI/CD Strategy

### Option 1: GitHub Actions (Recommended)

**Pros:**
- Native GitHub integration
- Free for public repos, generous free tier for private repos
- Easy secret management with GitHub Secrets
- Can trigger on branches, tags, PRs
- Supports matrix builds for multi-platform images
- Built-in caching for Docker layers and dependencies

**Cons:**
- Requires setup in GitHub repository
- Need to configure GCP service account credentials

**Implementation:**

#### 1. Setup GCP Service Account for CI/CD

```bash
PROJECT_ID="personal-gcp-477623"

# Create service account
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=${PROJECT_ID}

# Grant necessary permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}
```

#### 2. Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:
- `GCP_PROJECT_ID`: `personal-gcp-477623`
- `GCP_SA_KEY`: Contents of `github-actions-key.json` (entire JSON)
- `GCP_REGION`: `us-east1`

#### 3. Create GitHub Actions Workflows

**`.github/workflows/deploy-backend.yml`**

```yaml
name: Deploy Backend API

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'cloudrun.yaml'
      - '.github/workflows/deploy-backend.yml'

jobs:
  deploy:
    name: Build and Deploy Backend API
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: ${{ secrets.GCP_PROJECT_ID }}
          export_default_credentials: true

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build Docker image
        run: |
          cd backend
          docker build -f Dockerfile.prod \
            -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:${{ github.sha }} \
            -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:latest \
            --platform linux/amd64 \
            .

      - name: Push Docker image
        run: |
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:${{ github.sha }}
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:latest

      - name: Update cloudrun.yaml with new image
        run: |
          sed -i "s|image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:.*|image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/api:${{ github.sha }}|g" cloudrun.yaml

      - name: Deploy to Cloud Run
        run: |
          gcloud run services replace cloudrun.yaml \
            --project=${{ secrets.GCP_PROJECT_ID }} \
            --region=${{ secrets.GCP_REGION }}

      - name: Output service URL
        run: |
          gcloud run services describe api \
            --project=${{ secrets.GCP_PROJECT_ID }} \
            --region=${{ secrets.GCP_REGION }} \
            --format="value(status.url)"
```

**`.github/workflows/deploy-worker.yml`**

```yaml
name: Deploy Worker

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'cloudrun-job.yaml'
      - '.github/workflows/deploy-worker.yml'

jobs:
  deploy:
    name: Build and Deploy Worker
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: ${{ secrets.GCP_PROJECT_ID }}
          export_default_credentials: true

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build Docker image
        run: |
          cd backend
          docker build -f Dockerfile.cloudrun-worker \
            -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:${{ github.sha }} \
            -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:latest \
            --platform linux/amd64 \
            .

      - name: Push Docker image
        run: |
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:${{ github.sha }}
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:latest

      - name: Update cloudrun-job.yaml with new image
        run: |
          sed -i "s|image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:.*|image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/worker:${{ github.sha }}|g" cloudrun-job.yaml

      - name: Deploy to Cloud Run Jobs
        run: |
          gcloud run jobs replace cloudrun-job.yaml \
            --project=${{ secrets.GCP_PROJECT_ID }} \
            --region=${{ secrets.GCP_REGION }}
```

**`.github/workflows/deploy-frontend.yml`**

```yaml
name: Deploy Frontend

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'
      - '.github/workflows/deploy-frontend.yml'

jobs:
  deploy:
    name: Build and Deploy Frontend
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Vercel CLI
        run: npm install -g vercel

      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          cd frontend
          vercel --prod --token=$VERCEL_TOKEN --yes
```

For the frontend workflow, you'll need to add these GitHub Secrets:
- `VERCEL_TOKEN`: Get from Vercel → Settings → Tokens
- `VERCEL_ORG_ID`: Found in `.vercel/project.json` after first manual deploy
- `VERCEL_PROJECT_ID`: Found in `.vercel/project.json` after first manual deploy

---

### Option 2: Cloud Build

**Pros:**
- Native GCP integration
- Can trigger from GitHub, Cloud Source Repositories
- Automatic Docker layer caching
- No external credentials needed
- Can use build triggers with branch patterns

**Cons:**
- More complex configuration
- Cost: $0.003/build-minute after 120 free build-minutes/day
- Slower cold starts than GitHub Actions
- Less flexibility than GitHub Actions

**Implementation:**

#### 1. Create Build Triggers

```bash
# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com --project=personal-gcp-477623

# Connect your GitHub repository
# (Do this via Cloud Console: https://console.cloud.google.com/cloud-build/triggers)

# Grant Cloud Build permissions
PROJECT_NUMBER=$(gcloud projects describe personal-gcp-477623 --format='value(projectNumber)')
gcloud projects add-iam-policy-binding personal-gcp-477623 \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding personal-gcp-477623 \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

#### 2. Create Build Configs

**`backend/cloudbuild.yaml`**

```yaml
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-f'
      - 'Dockerfile.prod'
      - '-t'
      - 'gcr.io/$PROJECT_ID/api:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/api:latest'
      - '.'
    dir: 'backend'

  # Push the container image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/api:$SHORT_SHA'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/api:latest'

  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'services'
      - 'update'
      - 'api'
      - '--image'
      - 'gcr.io/$PROJECT_ID/api:$SHORT_SHA'
      - '--region'
      - 'us-east1'

images:
  - 'gcr.io/$PROJECT_ID/api:$SHORT_SHA'
  - 'gcr.io/$PROJECT_ID/api:latest'

options:
  logging: CLOUD_LOGGING_ONLY
```

---

### Option 3: Hybrid Approach (Recommended for Your Use Case)

**Backend + Worker:** Use Cloud Build triggers
**Frontend:** Keep Vercel's native Git integration

**Why:**
- Backend and worker are tightly coupled to GCP
- Cloud Build has native GCP integration
- Vercel already has excellent Git integration for Next.js
- Simpler secret management (no need to share GCP credentials with Vercel)
- Frontend deploys are instant with Vercel

**Setup:**

1. **Backend + Worker**: Configure Cloud Build triggers (see Option 2)
2. **Frontend**: Connect GitHub repo to Vercel via Vercel dashboard
   - Go to Vercel → New Project → Import Git Repository
   - Select your GitHub repo
   - Set root directory to `frontend/`
   - Vercel automatically detects Next.js and configures build settings
   - Every push to `main` automatically deploys

---

## Deployment Workflow Comparison

| Feature | GitHub Actions | Cloud Build | Hybrid |
|---------|---------------|-------------|--------|
| **Setup Complexity** | Medium | Medium | Low-Medium |
| **Cost (est. monthly)** | Free | ~$10-30 | ~$5-15 |
| **Build Speed** | Fast | Medium | Fast |
| **GCP Integration** | Good | Excellent | Excellent |
| **Frontend Deployment** | Manual config | Manual config | Native (Vercel) |
| **Secret Management** | GitHub Secrets | Secret Manager | Both |
| **Rollback** | Manual | Manual | Vercel: 1-click |
| **Preview Deploys** | Custom | Custom | Vercel: Automatic |

---

## Recommended Strategy: Hybrid + GitHub Actions

For your project, I recommend:

1. **Frontend**: Use Vercel's native Git integration
   - Automatic deployments on push to `main`
   - Automatic preview deployments for PRs
   - 1-click rollbacks
   - Built-in analytics and monitoring

2. **Backend + Worker**: Use GitHub Actions
   - More control over build process
   - Can run tests before deployment
   - Free for private repos (2,000 minutes/month)
   - Easier to test locally with `act`

### Implementation Steps

1. **Connect Vercel to GitHub (Frontend)**
   ```bash
   # One-time setup via Vercel dashboard
   # 1. Go to https://vercel.com
   # 2. New Project → Import Git Repository
   # 3. Select your GitHub repo
   # 4. Set root directory: frontend/
   # 5. Deploy
   ```

2. **Setup GitHub Actions (Backend + Worker)**
   ```bash
   # Create service account
   ./setup-cicd.sh  # (create this script with SA setup commands)
   
   # Add secrets to GitHub
   # Go to GitHub repo → Settings → Secrets and variables → Actions
   # Add: GCP_PROJECT_ID, GCP_SA_KEY, GCP_REGION
   
   # Create workflows
   mkdir -p .github/workflows
   # Copy the workflow files from above
   
   # Push to GitHub
   git add .github/workflows/
   git commit -m "Add CI/CD workflows"
   git push origin main
   ```

3. **Environment-Specific Deployments**

   Add environment protection rules in GitHub:
   - `main` branch → Production
   - `staging` branch → Staging environment
   - PR branches → Preview deployments (Vercel only)

---

## Rollback Strategy

### Backend API (Cloud Run)

```bash
# List recent revisions
gcloud run revisions list --service=api --region=us-east1 --project=personal-gcp-477623

# Rollback to specific revision
gcloud run services update-traffic api \
  --to-revisions=api-00006-abc=100 \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Worker (Cloud Run Job)

```bash
# List recent revisions
gcloud run jobs describe worker --region=us-east1 --project=personal-gcp-477623

# Rollback by updating image to previous SHA
gcloud run jobs update worker \
  --image=gcr.io/personal-gcp-477623/worker:previous-sha \
  --region=us-east1 \
  --project=personal-gcp-477623
```

### Frontend (Vercel)

```bash
# Via Vercel dashboard: Deployments → Select deployment → Promote to Production
# OR via CLI:
vercel rollback
```

---

## Testing Strategy

### Pre-Deployment Tests

Add these to your CI/CD pipeline:

**Backend + Worker:**
```yaml
# Add to GitHub Actions workflow before deploy step
- name: Run Tests
  run: |
    cd backend
    npm ci
    npm run test  # (you'll need to create tests)
    npm run lint
    npx tsc --noEmit  # Type check

- name: Run Migrations (dry run)
  run: |
    cd backend
    npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasync --shadow-database-url ${{ secrets.TEST_DATABASE_URL }}
```

**Frontend:**
```yaml
# Add to GitHub Actions or Vercel build settings
- name: Build and Test
  run: |
    cd frontend
    npm ci
    npm run build
    npm run lint
```

### Post-Deployment Tests

Add smoke tests to verify deployment:

```yaml
# Add to GitHub Actions workflow after deploy step
- name: Smoke Test
  run: |
    # Wait for service to be ready
    sleep 30
    
    # Test backend health endpoint
    curl -f https://api-sgmtwgzrlq-ue.a.run.app/health || exit 1
    
    # Test frontend
    curl -f https://github-scraper-psi.vercel.app || exit 1
```

---

## Monitoring and Alerts

### Setup Alerts for Failed Deployments

```bash
# Create notification channel (email)
gcloud alpha monitoring channels create \
  --display-name="Deployment Alerts" \
  --type=email \
  --channel-labels=email_address=your-email@example.com \
  --project=personal-gcp-477623

# Create alert policy for Cloud Run errors
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Cloud Run API Errors" \
  --condition-threshold-value=10 \
  --condition-threshold-duration=60s \
  --condition-display-name="Error rate too high" \
  --condition-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND severity="ERROR"' \
  --project=personal-gcp-477623
```

---

## Migration Plan

### Phase 1: Setup (Week 1)
- [ ] Create GCP service account for CI/CD
- [ ] Add GitHub Secrets
- [ ] Connect Vercel to GitHub
- [ ] Test manual deployments

### Phase 2: Backend CI/CD (Week 2)
- [ ] Create `.github/workflows/deploy-backend.yml`
- [ ] Test deployment on feature branch
- [ ] Merge to main and verify automatic deployment
- [ ] Setup rollback procedure

### Phase 3: Worker CI/CD (Week 3)
- [ ] Create `.github/workflows/deploy-worker.yml`
- [ ] Test deployment on feature branch
- [ ] Merge to main and verify automatic deployment

### Phase 4: Frontend CI/CD (Week 4)
- [ ] Configure Vercel Git integration
- [ ] Test automatic deployments
- [ ] Setup preview deployments for PRs

### Phase 5: Testing & Monitoring (Ongoing)
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Setup smoke tests
- [ ] Configure monitoring alerts
- [ ] Document runbooks

---

## Quick Setup Script

Create `setup-cicd.sh`:

```bash
#!/bin/bash
set -e

PROJECT_ID="personal-gcp-477623"
SA_NAME="github-actions-deployer"

echo "🔧 Setting up CI/CD for GitHub Actions..."

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create ${SA_NAME} \
  --display-name="GitHub Actions Deployer" \
  --project=${PROJECT_ID} || echo "Service account already exists"

# Grant permissions
echo "Granting permissions..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create key
echo "Creating service account key..."
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}

echo ""
echo "✅ CI/CD setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add these secrets to GitHub → Settings → Secrets and variables → Actions:"
echo "   - GCP_PROJECT_ID: ${PROJECT_ID}"
echo "   - GCP_SA_KEY: $(cat github-actions-key.json)"
echo "   - GCP_REGION: us-east1"
echo ""
echo "2. Copy the workflow files to .github/workflows/"
echo "3. Push to GitHub and watch the magic happen! 🚀"
echo ""
echo "⚠️  IMPORTANT: Delete github-actions-key.json after adding to GitHub Secrets"
```

Make it executable:
```bash
chmod +x setup-cicd.sh
```

