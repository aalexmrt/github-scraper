# Plan: Extract Deployment Files to `github-scraper-infra` Repository

## Overview

This plan outlines the extraction of deployment-related files from the main `github-scraper` repository into a new dedicated repository: `github-scraper-infra`. This separation follows **industry best practices** by separating CI (build) from CD (deploy).

**Key Principles**:

- ✅ **Build in main repo**: Dockerfiles and image building stay with source code
- ✅ **Deploy in infra repo**: Deployment configs and scripts reference published images
- ✅ **Published images**: Images built and stored in registry, deployed on-demand
- ✅ **Git tags**: Single source of truth for versions (tags in main repo)
- ✅ **Automated deployment**: Option C - Fully automated deployment from tag to production (with safety nets)
- 📝 **Future improvement**: Staging environment can be added later when resources allow (~$0-5/month, 2-4 hours setup)

**Benefits**:

- **Improve organization**: Clear separation of build vs deploy concerns
- **Industry standard**: Follows CI/CD best practices (build once, deploy many)
- **Faster deployments**: No build time during deployment
- **Instant rollbacks**: Deploy any previous image version
- **Better traceability**: Immutable images in registry
- **Support multiple deployment targets**: Cloud Run, Kubernetes, Docker Compose, etc.

---

## 📋 Files to Extract

### ⚠️ Important: Dockerfiles Stay in Main Repo

**Dockerfiles will NOT be moved** - they remain in `github-scraper` repository because:

- ✅ Dockerfiles are tightly coupled to source code
- ✅ Code changes often require Dockerfile changes
- ✅ Industry best practice: Build images where code lives
- ✅ Enables proper CI/CD separation (build vs deploy)

**Dockerfiles to keep in `github-scraper`**:

- `backend/Dockerfile.prod`
- `backend/Dockerfile.cloudrun-commit-worker`
- `backend/Dockerfile.cloudrun-user-worker`
- `backend/Dockerfile.cloudrun-worker`
- `backend/Dockerfile.worker`
- `backend/Dockerfile.commit-worker`
- `backend/Dockerfile.user-worker`
- `frontend/Dockerfile`

**New in main repo**: `.github/workflows/build-and-push.yml` (builds and publishes images)

---

### 2. Cloud Run Configuration Files

**Location**: Root directory

**Files**:

- `cloudrun.yaml` - Cloud Run service configuration (API)
- `cloudrun.yaml.template` - Template with placeholders
- `cloudrun-job.yaml` - Generic Cloud Run job template
- `cloudrun-job.yaml.template` - Job template with placeholders
- `cloudrun-job-commit-worker.yaml` - Commit worker job config
- `cloudrun-job-user-worker.yaml` - User worker job config

**New Location**: `github-scraper-infra/cloudrun/`

```
cloudrun/
├── cloudrun.yaml.template
├── cloudrun-job.yaml.template
├── cloudrun-job-commit-worker.yaml
└── README.md (explaining template usage)
```

**Note**: Generated files (`cloudrun.yaml`, `cloudrun-job.yaml`) should NOT be committed (add to `.gitignore`)

---

### 3. Docker Compose Files

**⚠️ Important: Docker Compose Files Stay in Main Repo**

**Docker Compose files will NOT be moved** - they remain in `github-scraper` repository because:

- ✅ Used for **local development only** (not deployment)
- ✅ Developers need them when working on the codebase
- ✅ Not part of deployment infrastructure
- ✅ Should be co-located with source code for easy access

**Files to keep in `github-scraper`**:

- `docker-compose.services.yml` - Services-only compose file (backend services only)
  - **Note**: Frontend runs locally, not in Docker Compose
  - Used for local development of backend services (API, workers, database, Redis)

**Note**: `docker-compose.yml` is not used and can be removed if desired.

---

### 4. Deployment Scripts

**Location**: `scripts/deploy/`, `scripts/debug/`, `scripts/secrets/`, `scripts/utils/`

**Files**:

- `scripts/deploy/deploy.sh` - Main deployment script
- `scripts/deploy/setup.sh` - GCP project setup
- `scripts/deploy/setup-cicd.sh` - CI/CD setup
- `scripts/deploy/setup-two-worker-schedulers.sh` - Scheduler setup
- `scripts/debug/*.sh` - All debug scripts
- `scripts/secrets/*.sh` - All secret management scripts
- `scripts/utils/cleanup-prod-jobs.sh` - Production cleanup
- `scripts/utils/trigger-commit-worker.sh` - Manual job trigger

**New Location**: `github-scraper-infra/scripts/` (keep same structure)

```
scripts/
├── deploy/
│   ├── deploy.sh
│   ├── setup.sh
│   ├── setup-cicd.sh
│   └── setup-two-worker-schedulers.sh
├── debug/
│   ├── check-scheduler-status.sh
│   ├── check-worker-job-status.sh
│   ├── debug-commit-worker.sh
│   ├── debug-user-worker.sh
│   └── view-prod-logs.sh
├── secrets/
│   ├── create-secrets.sh
│   ├── set-oauth-secrets.sh
│   └── set-vercel-env.sh
└── utils/
    ├── cleanup-prod-jobs.sh
    └── trigger-commit-worker.sh
```

**Note**: Development scripts (`scripts/dev/`) stay in main repo as they're for local development

**Cloud Scheduler Configuration**:

**Cloud Schedulers move to infra repo** because:

- ✅ Schedulers are **infrastructure/deployment concerns**, not application code
- ✅ Schedulers reference Cloud Run Jobs (which are deployed via infra repo)
- ✅ Scheduler configuration may change independently of application code
- ✅ Schedulers need to be managed alongside other deployment configs

**Files to Move**:

- `scripts/deploy/setup-two-worker-schedulers.sh` - Creates/updates Cloud Scheduler jobs
- `scripts/debug/check-scheduler-status.sh` - Checks scheduler status

**Scheduler Details**:

- **Commit Worker Scheduler**: Runs every 15 minutes (`*/15 * * * *`)
- **User Worker Scheduler**: Runs every 4 hours (`0 */4 * * *`)
- Both schedulers trigger Cloud Run Jobs (not services)
- Schedulers are created once and persist across deployments
- Schedulers don't need updates when deploying new job versions (they reference job names, not versions)

**Setup**:

```bash
# In infra repo, after deploying jobs
./scripts/deploy/setup-two-worker-schedulers.sh
```

**Note**: Schedulers are created once and don't need to be recreated for each deployment. They automatically trigger the latest version of the Cloud Run Job.

---

### 5. Frontend Deployment

**⚠️ Important: Frontend Deployment Stays Separate**

**Frontend deployment will NOT be part of infra repo** because:

- ✅ Frontend deploys to **Vercel** (not Cloud Run)
- ✅ Vercel has its own deployment pipeline (connected to GitHub)
- ✅ Frontend deployment is independent of backend deployment
- ✅ Frontend versioning can be separate from backend versioning

**Current Setup**:

- Frontend repository: Same as main repo (`github-scraper/frontend`)
- Deployment: Automatic via Vercel (connected to GitHub)
- Configuration: Environment variables in Vercel dashboard
- Scripts: `scripts/secrets/set-vercel-env.sh` - **Moves to infra repo** (for managing Vercel env vars)

**Workflow**:

1. Frontend code changes → Push to main repo
2. Vercel automatically builds and deploys
3. No coordination needed with backend deployment

**Note**: If you want to coordinate frontend and backend deployments, you can add a step in the infra repo workflow to trigger Vercel deployment, but this is optional.

---

### 6. Deployment Documentation

**Location**: `docs/`

**Files**:

- `docs/DEPLOYMENT.md` - Main deployment guide
- `docs/DEPLOYMENT_PATTERNS.md` - Configuration patterns
- `docs/DEPLOYMENT_QUICK_REFERENCE.md` - Quick reference
- `docs/OAUTH_SETUP.md` - OAuth setup (deployment-related)

**New Location**: `github-scraper-infra/docs/`

```
docs/
├── DEPLOYMENT.md
├── DEPLOYMENT_PATTERNS.md
├── DEPLOYMENT_QUICK_REFERENCE.md
├── OAUTH_SETUP.md
└── README.md (index/overview)
```

**Note**: `docs/ARCHITECTURE.md` stays in main repo (application architecture, not deployment)

---

## 🏗️ Proposed Repository Structure

### Main Repository (`github-scraper`)

**Purpose**: Application code + Image building

```
github-scraper/
├── backend/
│   ├── Dockerfile.prod                 # ✅ Stays here
│   ├── Dockerfile.cloudrun-*          # ✅ Stays here
│   └── (source code)
├── frontend/
│   ├── Dockerfile                       # ✅ Stays here
│   └── (source code)
├── .github/workflows/
│   └── build-and-push.yml              # ✅ NEW: Builds & publishes images
└── (rest of application code)
```

### Infrastructure Repository (`github-scraper-infra`)

**Purpose**: Deployment configurations only (references published images)

```
github-scraper-infra/
├── README.md                          # Main repository README (with build badges)
├── .gitignore                         # Ignore generated files (see below)
├── .github/                           # GitHub Actions workflows
│   └── workflows/
│       └── deploy.yml                 # Deployment workflow (references published images)
├── cloudrun/                          # Cloud Run configurations
│   ├── cloudrun.yaml.template         # References published images
│   ├── cloudrun-job.yaml.template     # References published images
│   └── README.md
├── scripts/                           # Deployment scripts
│   ├── deploy/
│   │   ├── deploy.sh                  # Deploys pre-built images
│   │   ├── setup.sh                   # GCP project setup
│   │   ├── setup-cicd.sh              # CI/CD setup
│   │   └── setup-two-worker-schedulers.sh  # Cloud Scheduler setup
│   ├── debug/
│   │   ├── check-scheduler-status.sh
│   │   └── (other debug scripts)
│   ├── secrets/
│   │   ├── create-secrets.sh          # GCP Secret Manager setup
│   │   ├── set-oauth-secrets.sh
│   │   └── set-vercel-env.sh          # Vercel env vars (frontend)
│   └── utils/
├── docs/                              # Deployment documentation
│   ├── DEPLOYMENT.md
│   ├── DEPLOYMENT_PATTERNS.md
│   ├── DEPLOYMENT_QUICK_REFERENCE.md
│   └── OAUTH_SETUP.md
└── kubernetes/                        # Future: Kubernetes manifests (optional)
    └── README.md                      # Placeholder for future K8s support
```

**Key Difference**: Infra repo **references** published images, doesn't build them.

---

## 🔄 Migration Steps

### Phase 1: Repository Setup

1. ✅ Create new repository `github-scraper-infra` on GitHub
2. ✅ Initialize with README (with build badges) and `.gitignore` (see below)
3. ✅ Create directory structure
4. ✅ Add GitHub Actions workflows (`.github/workflows/`)
5. ✅ Add initial commit

**`.gitignore` for Infra Repo**:

Create `.gitignore` in `github-scraper-infra`:

```gitignore
# Generated Cloud Run configs (from templates)
cloudrun.yaml
cloudrun-job-*.yaml
*.yaml
!*.template
!*.yaml.template

# Temporary files
*.tmp
*.bak
*.swp
*~

# Local environment files
.env
.env.local
.env.*.local

# IDE files
.vscode/
.idea/
*.iml

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Secrets (should never be committed, but extra safety)
secrets/
*.pem
*.key
*.crt
```

**Key Points**:

- ✅ Ignore generated YAML files (created from templates)
- ✅ Keep template files (`.template` extension)
- ✅ Ignore local config files
- ✅ Never commit secrets

### Phase 2: Main Repo Setup (Image Building)

1. ✅ **Keep Dockerfiles** in `github-scraper` (do NOT move)
2. ✅ Add `.github/workflows/build-and-push.yml` to main repo
3. ✅ Configure GCP Artifact Registry access
4. ✅ Test: Create tag → Verify images build and push
5. ✅ Document image building process

### Phase 3: File Migration to Infra Repo

1. ✅ Copy Cloud Run configs to `cloudrun/` (update to reference published images)
2. ✅ Copy deployment scripts to `scripts/` (update to deploy, not build)
   - Include `setup-two-worker-schedulers.sh` (Cloud Scheduler setup)
   - Include all debug scripts
   - Include secret management scripts
3. ✅ Copy deployment docs to `docs/`
4. ✅ Create `.gitignore` (see Phase 1)
5. ✅ **Do NOT copy Dockerfiles** (they stay in main repo for building)
6. ✅ **Do NOT copy Docker Compose files** (they stay in main repo for local development)
7. ✅ **Do NOT copy frontend code** (frontend deploys separately via Vercel)

### Phase 4: Update Scripts

1. ✅ Update `deploy.sh` to **reference published images** (not build)
2. ✅ Update Cloud Run configs to use image tags from registry
3. ✅ Add image version validation (check image exists before deploy)
4. ✅ Update paths in scripts (relative to new structure)
5. ✅ Test script execution with published images

### Phase 5: Update Main Repository

1. ✅ **Keep Dockerfiles** in main repo (they belong here)
2. ✅ Remove Cloud Run configs (moved to infra repo)
3. ✅ Remove deployment scripts (moved to infra repo)
4. ✅ Update main README to reference infra repo
5. ✅ Add note about image building workflow
6. ✅ Update any CI/CD workflows that reference deployment files

### Phase 6: CI/CD Setup

1. ✅ Create GitHub Actions workflows in infra repo
2. ✅ Add build status badges to READMEs (both repos)
3. ✅ Test workflows (deploy images)
4. ✅ Document CI/CD process

### Phase 7: Documentation

1. ✅ Create comprehensive README in new repo
2. ✅ Document how to use deployment configurations
3. ✅ Add migration guide for existing deployments
4. ✅ Update all documentation references
5. ✅ Document CI/CD workflows and badges

---

## 🔧 Script Updates Required

### Major Changes to Deployment Scripts:

1. **`scripts/deploy/deploy.sh`** - **Complete rewrite**:

   **Current** (builds images):

   ```bash
   cd backend
   docker build -f Dockerfile.prod -t api:${version} .
   docker push api:${version}
   ```

   **New** (references published images):

   ```bash
   VERSION=$1  # e.g., "1.2.3"

   # Validate image exists in registry
   if ! gcloud artifacts docker images describe \
     ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${VERSION}; then
     echo "❌ Error: Image api:${VERSION} not found in registry"
     echo "   Build it first in github-scraper repo"
     exit 1
   fi

   # Deploy existing image (no building)
   export IMAGE_TAG=${VERSION}
   envsubst < cloudrun/cloudrun.yaml.template > cloudrun.yaml
   gcloud run services replace cloudrun.yaml
   ```

2. **`cloudrun.yaml.template`** - Update image references:

   **Current**:

   ```yaml
   - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${IMAGE_TAG}
   ```

   **New** (same format, but IMAGE_TAG comes from git tag version, not build):

   ```yaml
   - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${IMAGE_TAG}
   ```

   **Note**: The deploy script exports `IMAGE_TAG=${VERSION}` so templates can continue using `${IMAGE_TAG}` variable name.

3. **Docker Compose files** (for local dev):
   - Keep as-is (builds locally for development)
   - These are for local development only

---

## 📝 Key Considerations

### 1. Build Strategy (REVISED - Industry Best Practice)

**✅ Chosen Approach: Published Images (Option C)**

**Architecture**:

- **Main repo** (`github-scraper`): Builds and publishes images to registry
- **Infra repo** (`github-scraper-infra`): References published images, deploys them

**Why This Approach**:

✅ **Industry Standard**: Separate CI (build) from CD (deploy)

- Build happens in main repo (where code lives)
- Deploy happens in infra repo (where configs live)

✅ **Better Traceability**:

- Each version has immutable image in registry
- Can deploy any version without rebuilding
- Rollback = deploy previous image (instant)

✅ **Faster Deployments**:

- No build time during deployment
- Just pull existing image and deploy
- Rollbacks are instant

✅ **Better Security**:

- Images scanned in registry
- Signed images (optional)
- No source code needed for deployment

✅ **Multi-Environment Support**:

- Same image deployed to dev/staging/prod
- Only config changes between environments
- No "works on my machine" issues

**Complete Deployment Flow**:

### Step-by-Step: How Services Get Deployed

**Phase 1: Build (Main Repo)**

1. Developer creates tag: `git tag api-v1.2.3 && git push origin api-v1.2.3`
2. GitHub Actions triggers in main repo (`.github/workflows/build-and-push.yml`)
3. Workflow extracts service name (`api`) and version (`1.2.3`) from tag
4. Builds Docker image: `api:1.2.3`
5. Pushes image to GCP Artifact Registry: `us-east1-docker.pkg.dev/PROJECT_ID/github-scraper/api:1.2.3`
6. Image is now available in registry ✅

**Phase 2: Deploy (Infra Repo) - Three Options**

#### Option A: Manual Deployment (Recommended for Start)

**When**: After image is built, manually trigger deployment

**How**:

```bash
# In infra repo
cd github-scraper-infra
./scripts/deploy/deploy.sh api 1.2.3
```

**What happens**:

1. Script validates image `api:1.2.3` exists in registry
2. Generates `cloudrun.yaml` from template with version `1.2.3`
3. Runs `gcloud run services replace cloudrun.yaml`
4. Cloud Run updates service to use new image
5. Service restarts with new version ✅

#### Option B: GitHub Actions Manual Trigger (UI)

**When**: After image is built, trigger via GitHub UI

**How**:

1. Go to infra repo → Actions → "Deploy" workflow
2. Click "Run workflow"
3. Select service: `api`
4. Enter version: `1.2.3`
5. Click "Run workflow"

**What happens**:

1. GitHub Actions runs `.github/workflows/deploy.yml`
2. Workflow validates image exists
3. Calls `./scripts/deploy/deploy.sh api 1.2.3`
4. Same as Option A ✅

#### Option C: Fully Automated (Advanced)

**When**: Automatically after image is built

**How**: Main repo workflow triggers infra repo deployment

**Setup**:

1. In main repo workflow, uncomment the trigger step:

```yaml
- name: Trigger deployment
  run: |
    curl -X POST https://api.github.com/repos/USERNAME/github-scraper-infra/dispatches \
      -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
      -d '{"event_type":"deploy","client_payload":{"service":"${{ steps.extract.outputs.SERVICE }}","version":"${{ steps.extract.outputs.VERSION }}"}}'
```

2. In infra repo, add `repository_dispatch` trigger:

```yaml
on:
  repository_dispatch:
    types: [deploy]
```

**What happens**:

1. Main repo builds image → triggers infra repo workflow
2. Infra repo workflow receives service + version
3. Automatically deploys (no manual step) ✅

**⚠️ When Option C is Acceptable**:

- ✅ Solo developer or very small team (< 3 people)
- ✅ Low-traffic application (personal project, side project)
- ✅ You're comfortable with "move fast and fix" approach
- ✅ You have good monitoring/alerting in place
- ✅ You can quickly rollback if something breaks
- ✅ Non-critical application (not handling payments, medical data, etc.)

**❌ When to Avoid Option C**:

- ❌ Production systems with real users/customers
- ❌ Team of 3+ developers (need coordination)
- ❌ High-traffic or business-critical applications
- ❌ Compliance requirements (SOC2, HIPAA, etc.)
- ❌ You want to test before production

**Visual Flow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Tag Created                                        │
│ git tag api-v1.2.3 && git push origin api-v1.2.3          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Build Workflow (Main Repo)                         │
│ .github/workflows/build-and-push.yml                       │
│                                                             │
│ ✅ Extracts: service=api, version=1.2.3                    │
│ ✅ Builds: api:1.2.3                                       │
│ ✅ Pushes to: Artifact Registry                             │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Image Available in Registry                        │
│ us-east1-docker.pkg.dev/PROJECT/github-scraper/api:1.2.3 │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌──────────────────────┐
│ Option A:       │    │ Option B/C:          │
│ Manual Script   │    │ GitHub Actions       │
│                 │    │                      │
│ ./deploy.sh     │    │ workflow_dispatch    │
│   api 1.2.3     │    │ or                   │
│                 │    │ repository_dispatch   │
└────────┬────────┘    └──────────┬───────────┘
         │                        │
         └───────────┬────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Deploy Script (Infra Repo)                         │
│ scripts/deploy/deploy.sh api 1.2.3                         │
│                                                             │
│ ✅ Validates image exists in registry                      │
│ ✅ Generates cloudrun.yaml with version 1.2.3              │
│ ✅ Runs: gcloud run services replace cloudrun.yaml         │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Cloud Run Updates                                   │
│                                                             │
│ ✅ Pulls new image from registry                           │
│ ✅ Updates service configuration                            │
│ ✅ Restarts service with new version                       │
│ ✅ Service is live with api:1.2.3                          │
└─────────────────────────────────────────────────────────────┘
```

**Key Points**:

- ✅ **Build happens automatically** when tag is pushed
- ✅ **Deploy can be manual** (Option A/B) or **automatic** (Option C)
- ✅ **Image must exist** before deployment (validation step)
- ✅ **Deployment is fast** (no build time, just config update)
- ✅ **Other services unaffected** (independent deployment)

---

## 💰 Staging Environment: Cost & Effort Analysis

### Cost Analysis (Cloud Run)

**Good News**: Cloud Run scales to **zero** when idle, so staging costs are **minimal**:

| Resource                      | Production           | Staging              | Cost Difference                    |
| ----------------------------- | -------------------- | -------------------- | ---------------------------------- |
| **Cloud Run Service** (`api`) | Scales 0-3 instances | Scales 0-1 instances | **$0 when idle** (pay per request) |
| **Cloud Run Jobs**            | Run on schedule      | Disabled or manual   | **$0 if disabled**                 |
| **Database (Neon)**           | Shared               | Can use same DB      | **$0** (same instance)             |
| **Redis (Upstash)**           | Shared               | Can use same Redis   | **$0** (same instance)             |
| **Artifact Registry**         | Images stored        | Same images          | **$0** (same storage)              |

**Estimated Monthly Cost for Staging**:

- **Idle (no traffic)**: **$0** ✅
- **Light testing (100 requests/day)**: **~$0.10-0.50/month** ✅
- **Active testing**: **~$1-5/month** (depending on usage)

**Verdict**: Staging costs are **negligible** with Cloud Run's scale-to-zero model.

### Effort Required

**Minimal Setup** (~2-4 hours):

1. **Create staging service names** (30 min):

   - `api-staging` (instead of `api`)
   - `commit-worker-staging` (optional - can disable)
   - `user-worker-staging` (optional - can disable)

2. **Update deploy script** (1 hour):

   ```bash
   ./deploy.sh api 1.2.3 staging  # Add environment parameter
   ```

3. **Create staging configs** (1 hour):

   - `cloudrun-staging.yaml.template` (same as prod, different name)
   - Or use environment variable: `SERVICE_NAME=api-staging`

4. **Optional: Disable staging jobs** (30 min):

   - Don't create schedulers for staging workers
   - Or run them manually when needed

5. **Update GitHub Actions** (1 hour):
   - Add staging environment
   - Configure auto-deploy to staging

**Total**: ~2-4 hours of work, **$0-5/month** cost

### Staging Setup Options

#### Option 1: Minimal Staging (Recommended for Low Resources)

- ✅ Same database/Redis (use different table prefixes or namespaces)
- ✅ Separate Cloud Run services (`api-staging`)
- ✅ Jobs disabled in staging (test manually)
- ✅ **Cost**: ~$0-1/month
- ✅ **Effort**: 2 hours

#### Option 2: Full Staging Environment

- ✅ Separate database (Neon free tier allows multiple projects)
- ✅ Separate Redis (Upstash free tier)
- ✅ Separate Cloud Run services
- ✅ Jobs enabled but run less frequently
- ✅ **Cost**: ~$0-5/month
- ✅ **Effort**: 4 hours

#### Option 3: No Staging (Option C Direct to Prod)

- ✅ Deploy directly to production
- ✅ **Cost**: $0
- ✅ **Effort**: 0 hours
- ⚠️ **Risk**: Higher chance of breaking production

---

## 🤔 Recommendation: Option C vs Staging

### For Your Situation (Low Resources, Personal/Side Project)

**Option C (Fully Automated) is Acceptable IF**:

1. ✅ **You're the only developer** or very small team
2. ✅ **Low user traffic** (won't affect many people if broken)
3. ✅ **You have monitoring** (Cloud Run logs, error alerts)
4. ✅ **Quick rollback capability** (can revert tag/deploy previous version)
5. ✅ **Non-critical application** (not handling payments, sensitive data)

**Add These Safety Nets**:

```yaml
# .github/workflows/deploy.yml
on:
  repository_dispatch:
    types: [deploy]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      # 1. Validate image exists
      - name: Verify image exists
        run: |
          # Already in plan ✅

      # 2. Health check after deployment
      - name: Health check
        run: |
          sleep 10  # Wait for service to start
          curl -f https://your-api.run.app/health || exit 1

      # 3. Notify on failure
      - name: Notify on failure
        if: failure()
        run: |
          # Send alert (email, Slack, etc.)
          echo "Deployment failed!"
```

### Middle Ground: "Soft" Staging

**Instead of full staging, use these practices**:

1. **Deploy to production, but with safeguards**:

   - ✅ Health checks after deployment (verifies service is responding)
   - ✅ Manual rollback capability (instant, using previous images)
   - ✅ Monitoring via Cloud Run logs and GCP Console
   - ✅ Can add canary deployments later if needed

2. **Test locally first**:

   - ✅ Run full test suite before tagging
   - ✅ Test Docker image locally before pushing
   - ✅ Manual smoke tests before production

3. **Use feature flags**:
   - ✅ Deploy code but disable features
   - ✅ Enable gradually after monitoring

**This gives you**:

- ✅ No staging environment cost
- ✅ Safety through automation
- ✅ Best of both worlds

---

## 📊 Decision Matrix

| Factor           | Option C (Auto)        | Option C + Safety       | Staging (Minimal)    |
| ---------------- | ---------------------- | ----------------------- | -------------------- |
| **Cost**         | $0                     | $0                      | $0-1/month           |
| **Setup Time**   | 0 hours                | 1 hour                  | 2-4 hours            |
| **Deploy Speed** | ⚡ Instant             | ⚡ Instant              | 🐢 +5 min            |
| **Risk Level**   | ⚠️ Medium              | ✅ Low-Medium           | ✅ Low               |
| **Best For**     | Solo dev, side project | Small team, low traffic | Team, production app |

**✅ Chosen Approach: Option C + Safety Nets**

**Decision**: We're going with **Option C (Fully Automated)** with safety nets:

- ✅ **Automated deployment** from tag to production
- ✅ **Safety nets**: Health checks (API service), image validation, manual rollback capability
- ✅ **No staging environment** for now (keeps costs at $0)
- 📝 **Future improvement**: Add staging environment when resources allow (~$0-5/month, 2-4 hours setup)

**Why This Works**:

- Solo developer or small team
- Low user traffic
- Non-critical application
- Can quickly rollback if issues occur
- Staging can be added later as project grows

**Implementation**:

- Main repo: `.github/workflows/build-and-push.yml` (builds on tags)
- Infra repo: `scripts/deploy/deploy.sh` (validates image exists, then deploys)

### 2. Version Management with Git Tags

**Current Problem**:

- Version stored in `package.json` files
- Automatic bumping can be error-prone
- Version changes require manual commits
- No clear connection between git commits and deployments

**New Approach: Git Tags as Source of Truth**

Use git tags (e.g., `v1.2.3`) for versioning:

**Benefits**:

- ✅ **Single source of truth**: Git tags define versions
- ✅ **Better traceability**: Know exactly which commit is deployed
- ✅ **No file modifications**: Don't modify `package.json` during deployment
- ✅ **CI/CD friendly**: Easy to trigger deployments from tags
- ✅ **Rollback support**: Can deploy any previous tag
- ✅ **Semantic versioning**: Natural fit for `v1.2.3` format

**Workflow**:

1. Developer creates git tag: `git tag v1.2.3`
2. Push tag: `git push origin v1.2.3`
3. Deploy script reads tag: `./deploy.sh v1.2.3`
4. Or auto-detect latest tag: `./deploy.sh` (uses latest tag)

**Implementation**:

- Deploy script reads version from git tag
- Uses tag for Docker image tags
- No modification of `package.json` files
- Tag format: `v<major>.<minor>.<patch>` (e.g., `v1.2.3`)

### 3. Secrets Management

**How Secrets Are Managed**:

Secrets are stored in **GCP Secret Manager** and referenced in Cloud Run configurations:

**Setup Process** (one-time, in infra repo):

1. **Create secrets** using `scripts/secrets/create-secrets.sh`:

   ```bash
   cd github-scraper-infra
   ./scripts/secrets/create-secrets.sh
   ```

   This script prompts for and creates:

   - `db-url` - PostgreSQL connection string (from Neon)
   - `redis-host`, `redis-port`, `redis-password` - Redis credentials (from Upstash)
   - `r2-account-id`, `r2-access-key`, `r2-secret-key`, `r2-bucket` - Cloudflare R2 storage
   - `session-secret` - Session encryption key
   - `github-token` - GitHub Personal Access Token (optional)
   - `github-client-id`, `github-client-secret` - GitHub OAuth credentials
   - `frontend-url`, `backend-url` - Application URLs

2. **Secrets are referenced in Cloud Run templates**:

   ```yaml
   env:
     - name: DATABASE_URL
       valueFrom:
         secretKeyRef:
           name: db-url
           key: latest
   ```

3. **Update secrets** when needed:
   ```bash
   # Update a secret
   echo "new-value" | gcloud secrets versions add secret-name \
     --data-file=- \
     --project=${PROJECT_ID}
   ```

**Key Points**:

- ✅ Secrets stay in **GCP Secret Manager** (not in repo)
- ✅ Secret management scripts (`scripts/secrets/`) move to infra repo
- ✅ Cloud Run automatically pulls secrets from Secret Manager
- ✅ No secrets in code or config files
- ✅ Secrets can be updated without redeploying (use `latest` key)

**Security**:

- Secrets are encrypted at rest in GCP
- Access controlled via IAM
- Cloud Run service account needs `secretAccessor` role
- Never commit secrets to git

### 4. Environment Variables

**Environment Variables in Cloud Run**:

Environment variables are configured in Cloud Run YAML templates and come from two sources:

1. **From GCP Secret Manager** (sensitive data):

   - Database credentials
   - API keys
   - OAuth secrets
   - Storage credentials

2. **Direct values** (non-sensitive config):
   - `NODE_ENV=production`
   - `REDIS_TLS=true`
   - `USE_R2_STORAGE=true`
   - Service-specific configs (e.g., `MAX_JOBS_PER_EXECUTION=50`)

**Template Variables** (substituted during deployment via `envsubst`):

- `${PROJECT_ID}` - GCP Project ID
- `${REGION}` - GCP Region (e.g., `us-east1`)
- `${REPOSITORY}` - Artifact Registry repository name (`github-scraper`)
- `${SERVICE}` - Service name (`api`, `commit-worker`, `user-worker`)
- `${VERSION}` - Image version (e.g., `1.2.3`) - passed as argument to deploy script
- `${IMAGE_TAG}` - Same as `${VERSION}`, exported for template compatibility (templates use `${IMAGE_TAG}`)
- `${IMAGE_NAME}` - Service name for job templates (same as `${SERVICE}`)
- `${JOB_NAME}` - Job name (for job templates, same as `${SERVICE}`)

**Required Environment Variables** (documented in templates):

**API Service** (`cloudrun.yaml.template`):

- `DATABASE_URL` (from Secret Manager)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (from Secret Manager)
- `GITHUB_TOKEN` (from Secret Manager, optional)
- `SESSION_SECRET` (from Secret Manager)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (from Secret Manager)
- `FRONTEND_URL`, `BACKEND_URL` (from Secret Manager)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (from Secret Manager)
- `NODE_ENV=production`
- `REDIS_TLS=true`
- `USE_R2_STORAGE=true`

**Worker Jobs** (`cloudrun-job.yaml.template`):

- Same as API service, plus:
- `MAX_JOBS_PER_EXECUTION=50`
- `MAX_CONCURRENT_JOBS=10`
- `COMMIT_WORKER_CONCURRENCY=10` (for commit-worker)
- `MAX_REPO_SIZE_MB=250`
- `MAX_COMMIT_COUNT=2500`

**Documentation**: All environment variables are documented in Cloud Run templates with comments explaining their purpose.

### 5. CI/CD Integration & GitHub Actions

**Why GitHub Actions?**

- ✅ Shows awareness of best practices (even if using shell scripts)
- ✅ Validates configurations before deployment
- ✅ Build status badges demonstrate CI/CD maturity
- ✅ Can automate deployments triggered by git tags
- ✅ Provides audit trail and testing

**Workflows to Add**:

1. **`.github/workflows/deploy.yml`** (in infra repo)
   - Receives `repository_dispatch` from main repo (automated)
   - Supports `workflow_dispatch` for manual triggers
   - Validates image exists in registry
   - Runs deployment scripts
   - Deploys to Cloud Run
   - Runs health checks after deployment

**Build Status Badges**:
Add to README.md using shields.io:

```markdown
![CI](https://github.com/USERNAME/github-scraper-infra/workflows/CI/badge.svg)
![Deploy](https://github.com/USERNAME/github-scraper-infra/workflows/Deploy/badge.svg)
```

**Benefits**:

- Shows CI/CD awareness at a glance
- Demonstrates that shell scripts are a conscious choice, not oversight
- Provides validation and testing before manual deployments
- Can evolve to fully automated deployments later

**Example Workflow: Build and Push Images** (`.github/workflows/build-and-push.yml` in **main repo**):

```yaml
name: Build and Push Images

on:
  push:
    tags:
      - 'api-v*.*.*' # api-v1.2.3
      - 'commit-worker-v*.*.*' # commit-worker-v1.2.3
      - 'user-worker-v*.*.*' # user-worker-v1.2.3

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Extract service and version
        id: extract
        run: |
          TAG=${GITHUB_REF#refs/tags/}
          # Extract service name and version from tag
          # api-v1.2.3 -> service=api, version=1.2.3
          if [[ $TAG =~ ^api-v(.+)$ ]]; then
            echo "SERVICE=api" >> $GITHUB_OUTPUT
            echo "VERSION=${BASH_REMATCH[1]}" >> $GITHUB_OUTPUT
            echo "DOCKERFILE=backend/Dockerfile.prod" >> $GITHUB_OUTPUT
          elif [[ $TAG =~ ^commit-worker-v(.+)$ ]]; then
            echo "SERVICE=commit-worker" >> $GITHUB_OUTPUT
            echo "VERSION=${BASH_REMATCH[1]}" >> $GITHUB_OUTPUT
            echo "DOCKERFILE=backend/Dockerfile.cloudrun-commit-worker" >> $GITHUB_OUTPUT
          elif [[ $TAG =~ ^user-worker-v(.+)$ ]]; then
            echo "SERVICE=user-worker" >> $GITHUB_OUTPUT
            echo "VERSION=${BASH_REMATCH[1]}" >> $GITHUB_OUTPUT
            echo "DOCKERFILE=backend/Dockerfile.cloudrun-user-worker" >> $GITHUB_OUTPUT
          else
            echo "❌ Error: Invalid tag format"
            exit 1
          fi

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Configure Docker
        run: |
          gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Build and push image
        run: |
          docker buildx build \
            --platform linux/amd64 \
            -f ${{ steps.extract.outputs.DOCKERFILE }} \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.PROJECT_ID }}/github-scraper/${{ steps.extract.outputs.SERVICE }}:${{ steps.extract.outputs.VERSION }} \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.PROJECT_ID }}/github-scraper/${{ steps.extract.outputs.SERVICE }}:latest \
            --push \
            ./backend

      - name: Trigger deployment in infra repo
        run: |
          # Automatically trigger deployment in infra repo (Option C)
          curl -X POST https://api.github.com/repos/USERNAME/github-scraper-infra/dispatches \
            -H "Authorization: token ${{ secrets.DEPLOY_TOKEN }}" \
            -H "Accept: application/vnd.github.v3+json" \
            -d '{
              "event_type":"deploy",
              "client_payload":{
                "service":"${{ steps.extract.outputs.SERVICE }}",
                "version":"${{ steps.extract.outputs.VERSION }}"
              }
            }'
          echo "✅ Deployment triggered for ${{ steps.extract.outputs.SERVICE }}:${{ steps.extract.outputs.VERSION }}"
```

**⚠️ Setup Required: DEPLOY_TOKEN Secret**

To enable automatic deployment triggering, you need to create a GitHub Personal Access Token (PAT) with `repo` scope:

1. **Create GitHub Personal Access Token**:

   - Go to: https://github.com/settings/tokens
   - Click "Generate new token" → "Generate new token (classic)"
   - Name: `github-scraper-deploy-token`
   - Expiration: Choose appropriate (90 days, 1 year, or no expiration)
   - Scopes: Check `repo` (Full control of private repositories)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again)

2. **Add Secret to Main Repository**:

   - Go to: `https://github.com/USERNAME/github-scraper/settings/secrets/actions`
   - Click "New repository secret"
   - Name: `DEPLOY_TOKEN`
   - Value: Paste the token you copied
   - Click "Add secret"

3. **Verify Token Permissions**:
   - The token needs `repo` scope to trigger `repository_dispatch` events
   - If you have organization-level restrictions, ensure the token has access to both repositories

**Security Note**: This token allows triggering workflows in the infra repo. Keep it secure and rotate it periodically.

````

**Example Workflow: Deploy** (`.github/workflows/deploy.yml` in **infra repo**):

```yaml
name: Deploy

on:
  # Option 1: Manual trigger via GitHub UI
  workflow_dispatch:
    inputs:
      service:
        description: 'Service to deploy (api, commit-worker, user-worker)'
        required: true
        type: choice
        options:
          - api
          - commit-worker
          - user-worker
      version:
        description: 'Version to deploy (e.g., 1.2.3)'
        required: true

  # Option 2: Automated trigger from main repo (via repository_dispatch)
  repository_dispatch:
    types: [deploy]

  # Option 3: Trigger on tag push (if tags are pushed to infra repo)
  # Note: Usually tags are in main repo, but this allows flexibility
  push:
    tags:
      - 'api-v*.*.*'
      - 'commit-worker-v*.*.*'
      - 'user-worker-v*.*.*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3

      - name: Extract service and version
        id: extract
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            # Manual trigger: Get from inputs
            echo "SERVICE=${{ github.event.inputs.service }}" >> $GITHUB_OUTPUT
            echo "VERSION=${{ github.event.inputs.version }}" >> $GITHUB_OUTPUT
          elif [ "${{ github.event_name }}" == "repository_dispatch" ]; then
            # Automated trigger: Get from payload
            echo "SERVICE=${{ github.event.client_payload.service }}" >> $GITHUB_OUTPUT
            echo "VERSION=${{ github.event.client_payload.version }}" >> $GITHUB_OUTPUT
          else
            # Tag push: Extract from tag (api-v1.2.3)
            TAG=${GITHUB_REF#refs/tags/}
            if [[ $TAG =~ ^(.+)-v(.+)$ ]]; then
              echo "SERVICE=${BASH_REMATCH[1]}" >> $GITHUB_OUTPUT
              echo "VERSION=${BASH_REMATCH[2]}" >> $GITHUB_OUTPUT
            else
              echo "❌ Error: Invalid tag format"
              exit 1
            fi
          fi

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Verify image exists
        run: |
          REGION=${{ secrets.GCP_REGION }}
          PROJECT_ID=${{ secrets.PROJECT_ID }}
          REPOSITORY=github-scraper
          SERVICE=${{ steps.extract.outputs.SERVICE }}
          VERSION=${{ steps.extract.outputs.VERSION }}

          if ! gcloud artifacts docker images describe \
            ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${VERSION} \
            --project=${PROJECT_ID} &>/dev/null; then
            echo "❌ Error: Image ${SERVICE}:${VERSION} not found in registry"
            echo "   Build it first in github-scraper repo:"
            echo "   git tag ${SERVICE}-v${VERSION} && git push origin ${SERVICE}-v${VERSION}"
            exit 1
          fi
          echo "✅ Found ${SERVICE}:${VERSION}"

      - name: Deploy
        run: |
          export PROJECT_ID=${{ secrets.GCP_PROJECT_ID }}
          export REGION=${{ secrets.GCP_REGION }}
          ./scripts/deploy/deploy.sh ${{ steps.extract.outputs.SERVICE }} ${{ steps.extract.outputs.VERSION }}

      # Note: Health checks are implemented in deploy.sh script
      # For API service, it checks /health endpoint after deployment
      # For workers, health checks aren't applicable (they run on schedule)
````

**Build Status Badges** (Add to README.md in infra repo):

```markdown
# GitHub Scraper Infrastructure

[![Deploy](https://github.com/USERNAME/github-scraper-infra/workflows/Deploy/badge.svg)](https://github.com/USERNAME/github-scraper-infra/actions)

> **Note**: This repository handles **deployment only**. Images are built and published
> in the [main repository](https://github.com/USERNAME/github-scraper) via GitHub Actions.
>
> **Workflow**:
>
> 1. Tag created in main repo → Images built and pushed to registry
> 2. Infra repo deploys → References published images from registry
>
> While we use shell scripts for deployment, we maintain GitHub Actions workflows
> for validation and CI/CD best practices. This demonstrates awareness that shell
> scripts alone aren't ideal, but are a conscious choice for our current needs.
```

**Build Status Badges** (Add to README.md in main repo):

```markdown
# GitHub Repository Scraper

[![Build](https://github.com/USERNAME/github-scraper/workflows/Build%20and%20Push%20Images/badge.svg)](https://github.com/USERNAME/github-scraper/actions)

> **Deployment**: Images are built here and deployed via [infrastructure repository](https://github.com/USERNAME/github-scraper-infra)
```

**Getting Badge URLs**:

- Visit https://shields.io/
- Or use GitHub's built-in badges: `https://github.com/USERNAME/REPO/workflows/WORKFLOW_NAME/badge.svg`
- Replace `USERNAME`, `REPO`, and `WORKFLOW_NAME` with your values

---

## 🎯 Future Enhancements

### Short-term (Phase 1)

- ✅ Extract all files
- ✅ Update scripts
- ✅ Add GitHub Actions workflows
- ✅ Add build status badges
- ✅ Create documentation

### Medium-term (Phase 2)

- [ ] Add Kubernetes manifests (if migrating from Cloud Run)
- [ ] Add Terraform/Infrastructure as Code
- [ ] Support multiple environments (dev/staging/prod)
- [ ] Automated tag-based CI/CD pipelines

### Long-term (Phase 3)

- [ ] Automated deployment pipelines
- [ ] Multi-cloud support (GCP, AWS, Azure)
- [ ] Monitoring and observability configs

---

## 🏷️ Git Tags Deployment Strategy

### Current Deployment Process (Problems)

**Current Flow**:

1. Read version from `package.json`
2. Automatically bump version (patch/minor/major)
3. Update `package.json` files
4. Build Docker images with new version
5. Deploy to Cloud Run
6. **Manual step**: Commit version changes

**Issues**:

- ❌ Version stored in application code (`package.json`)
- ❌ Automatic bumping can be error-prone
- ❌ Version can drift between deployments
- ❌ No clear connection between git commits and deployments
- ❌ Requires manual commits after deployment
- ❌ Hard to rollback to specific versions

### New Git Tags Approach

**New Flow**:

1. Developer creates git tag: `git tag v1.2.3`
2. Push tag: `git push origin v1.2.3`
3. Deploy script reads tag: `./deploy.sh v1.2.3`
   - Or auto-detect: `./deploy.sh` (uses latest tag)
4. Build Docker images with tag version
5. Deploy to Cloud Run
6. **No file modifications needed**

**Benefits**:

- ✅ **Single source of truth**: Git tags define versions
- ✅ **Better traceability**: Know exactly which commit is deployed
- ✅ **No file modifications**: Don't modify `package.json` during deployment
- ✅ **CI/CD friendly**: Easy to trigger deployments from tags
- ✅ **Rollback support**: Can deploy any previous tag
- ✅ **Semantic versioning**: Natural fit for `v1.2.3` format
- ✅ **Audit trail**: Git history shows all deployments

### Implementation Details

#### Tag Format

- Use semantic versioning: `v<major>.<minor>.<patch>`
- Examples: `v1.0.0`, `v1.2.3`, `v2.0.0-beta.1`
- Prefixed with `v` for clarity

#### Deploy Script Changes

**Current** (`deploy.sh`):

```bash
# Reads from package.json
CURRENT_BACKEND_VERSION=$(cd backend && node -p "require('./package.json').version")
NEW_BACKEND_VERSION=$(increment_version $CURRENT_BACKEND_VERSION $VERSION_BUMP_TYPE)
# Updates package.json
```

**New** (`deploy.sh` in infra repo):

```bash
#!/bin/bash
set -e

# Service and version come from arguments
SERVICE=$1  # e.g., "api", "commit-worker", "user-worker"
VERSION=$2  # e.g., "1.2.3"

if [ -z "$SERVICE" ] || [ -z "$VERSION" ]; then
  echo "❌ Error: Service and version required"
  echo "Usage: ./deploy.sh <service> <version>"
  echo "Example: ./deploy.sh api 1.2.3"
  echo "Example: ./deploy.sh commit-worker 1.2.3"
  echo ""
  echo "Valid services: api, commit-worker, user-worker"
  exit 1
fi

# Validate service name
VALID_SERVICES=("api" "commit-worker" "user-worker")
if [[ ! " ${VALID_SERVICES[@]} " =~ " ${SERVICE} " ]]; then
  echo "❌ Error: Invalid service name: ${SERVICE}"
  echo "Valid services: ${VALID_SERVICES[*]}"
  exit 1
fi

# Validate version format (semantic versioning)
if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "❌ Error: Invalid version format. Use semantic versioning: 1.2.3"
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
REPOSITORY="${REPOSITORY:-github-scraper}"

# Verify image exists in registry before deploying
echo "🔍 Verifying image exists in registry..."
if ! gcloud artifacts docker images describe \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${VERSION} \
  --project=${PROJECT_ID} &>/dev/null; then
  echo "❌ Error: Image ${SERVICE}:${VERSION} not found in registry"
  echo "   Build it first in github-scraper repo:"
  echo "   git tag ${SERVICE}-v${VERSION} && git push origin ${SERVICE}-v${VERSION}"
  exit 1
fi
echo "✅ Found ${SERVICE}:${VERSION}"

# Deploy specific service using published image
export PROJECT_ID REGION REPOSITORY SERVICE VERSION
export IMAGE_TAG=${VERSION}  # Templates use IMAGE_TAG variable
export IMAGE_NAME=${SERVICE}  # For job templates

# Deploy based on service type
case $SERVICE in
  api)
    envsubst < cloudrun/cloudrun.yaml.template > cloudrun.yaml
    gcloud run services replace cloudrun.yaml --project=${PROJECT_ID} --region=${REGION}

    # Health check for API service
    echo "🔍 Waiting for service to be ready..."
    sleep 15  # Wait for Cloud Run to update

    # Get service URL
    SERVICE_URL=$(gcloud run services describe api \
      --project=${PROJECT_ID} \
      --region=${REGION} \
      --format='value(status.url)')

    echo "🔍 Running health check on ${SERVICE_URL}/health..."
    if curl -f -s "${SERVICE_URL}/health" > /dev/null; then
      echo "✅ Health check passed - Service is responding"
    else
      echo "⚠️  Warning: Health check failed - Service may not be ready yet"
      echo "   Check logs: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=api' --limit=50 --project=${PROJECT_ID}"
      # Don't fail deployment - service might need more time to start
      # Manual verification recommended
    fi
    ;;
  commit-worker|user-worker)
    # JOB_NAME and IMAGE_NAME already exported above
    envsubst < cloudrun/cloudrun-job.yaml.template > cloudrun-job-${SERVICE}.yaml
    gcloud run jobs replace cloudrun-job-${SERVICE}.yaml --project=${PROJECT_ID} --region=${REGION}
    echo "✅ Job configuration updated - Will run on next scheduled execution"
    ;;
esac

echo "✅ Deployed ${SERVICE}:${VERSION}"
```

#### Usage Examples

```bash
# Deploy specific service and version
./deploy.sh api 1.2.3
./deploy.sh commit-worker 1.5.0
./deploy.sh user-worker 2.0.1

# Deploy from CI/CD (extract service and version from tag)
# Tag: api-v1.2.3
TAG=${GITHUB_REF#refs/tags/}  # api-v1.2.3
SERVICE=$(echo $TAG | cut -d'-' -f1)  # api
VERSION=$(echo $TAG | sed 's/.*-v//')  # 1.2.3
./deploy.sh $SERVICE $VERSION

# Manual deployment workflow:
# 1. In main repo: git tag api-v1.2.3 && git push origin api-v1.2.3
# 2. Wait for image to build (check GitHub Actions)
# 3. In infra repo: ./deploy.sh api 1.2.3

# Deploy multiple services (independent versions)
./deploy.sh api 1.2.3
./deploy.sh commit-worker 1.5.0  # Different version!
./deploy.sh user-worker 2.0.1    # Different version!
```

#### CI/CD Integration

**Chosen Approach: Option C - Fully Automated Deployment**

**Two-Step Automated Process**:

1. **Main Repo** (builds images):

   ```yaml
   # .github/workflows/build-and-push.yml
   on:
     push:
       tags:
         - 'api-v*.*.*'
         - 'commit-worker-v*.*.*'
         - 'user-worker-v*.*.*'
   # Builds and pushes specific service image to registry
   # Then triggers deployment in infra repo
   ```

2. **Infra Repo** (deploys images automatically):

   ```yaml
   # .github/workflows/deploy.yml
   on:
     repository_dispatch:
       types: [deploy]
     # Triggered automatically by main repo after image build
   # Deploys pre-built image from registry with safety checks
   ```

**Automated Flow**:

1. Tag pushed → Main repo builds image → Pushes to registry
2. Main repo triggers infra repo deployment via `repository_dispatch`
3. Infra repo validates image exists → Deploys to production
4. Health checks run (for API service) → Manual rollback available if needed

**Safety Nets Included**:

- ✅ Image existence validation before deployment
- ✅ Health checks after deployment (for API service)
- ✅ Manual rollback capability (deploy previous version instantly)
- ✅ Monitoring via Cloud Run logs and GCP Console

**Note on Rollback**: Automatic rollback is not implemented initially. If deployment fails or health checks fail, you can manually rollback by deploying a previous version:

```bash
./deploy.sh api 1.2.2  # Deploy previous version
```

This is instant since images are already in the registry. Automatic rollback can be added later if needed.

**📝 Future Improvement - Staging Environment**:

- When resources allow, consider adding a staging environment (~$0-5/month, 2-4 hours setup)
- Staging would allow testing before production deployment
- See "Staging Environment: Cost & Effort Analysis" section for details

### Initial Migration Strategy

**How to Handle Existing Production Deployments**

When migrating from the current setup to the new two-repository structure:

**Step 1: Tag Current Production Versions** (Before Migration)

1. **Identify current production versions**:

   ```bash
   # Check what's currently deployed
   gcloud run services describe api --region=${REGION} --project=${PROJECT_ID} --format='value(spec.template.spec.containers[0].image)'
   gcloud run jobs describe commit-worker --region=${REGION} --project=${PROJECT_ID} --format='value(spec.template.spec.containers[0].image)'
   gcloud run jobs describe user-worker --region=${REGION} --project=${PROJECT_ID} --format='value(spec.template.spec.containers[0].image)'
   ```

2. **Tag current production state**:

   ```bash
   # Tag the current commit with production versions
   git tag api-v1.0.0
   git tag commit-worker-v1.0.0
   git tag user-worker-v1.0.0
   git push origin --tags
   ```

3. **Build images for current versions** (if not already in registry):
   - Images should already exist if you've deployed before
   - If not, build them using the old deploy script before migration

**Step 2: Zero-Downtime Migration**

1. **Set up new infrastructure** (infra repo) **without removing old**:

   - Create infra repo
   - Migrate configs and scripts
   - Test deployment with a test tag first

2. **Test new deployment process**:

   ```bash
   # Create a test tag
   git tag api-v1.0.1-test
   git push origin api-v1.0.1-test
   # Verify new workflow builds and deploys correctly
   ```

3. **Switch to new process**:
   - Once verified, use new process for all future deployments
   - Old deploy script can remain as backup initially

**Step 3: Cleanup (After Verification)**

1. **Remove old deployment files** from main repo:

   - Cloud Run configs (moved to infra repo)
   - Deployment scripts (moved to infra repo)
   - Update README

2. **Keep old scripts as backup** for a few weeks, then remove

**Important Notes**:

- ✅ **No downtime**: Old deployment process continues working during migration
- ✅ **Rollback ready**: Can rollback to old process if needed
- ✅ **Gradual migration**: Migrate one service at a time if preferred
- ✅ **Test first**: Always test with a non-production tag first

### Migration Path

**Phase 1: Setup Image Building in Main Repo**

- Add `.github/workflows/build-and-push.yml` to main repo
- Configure GCP Artifact Registry access
- Test: Create tag → Verify images build and push
- Document image building process

**Phase 2: Update Deploy Script in Infra Repo**

- Rewrite `deploy.sh` to accept service name + version: `./deploy.sh <service> <version>`
- Add image existence validation for specific service
- Remove Docker build commands
- Update Cloud Run configs to use service-specific version tags
- Support deploying individual services independently

**Phase 3: Create Initial Tags**

- Tag current production versions per service:
  - `git tag api-v1.0.0`
  - `git tag commit-worker-v1.0.0`
  - `git tag user-worker-v1.0.0`
- Build images for each service version
- Verify images exist in registry
- Document tag creation process (service-specific tags)

**Phase 4: Update CI/CD**

- Main repo: Build workflow triggers on tags
- Infra repo: Deploy workflow validates images exist
- Remove automatic version bumping from scripts
- Add tag validation

**Phase 5: Documentation**

- Update deployment docs with new workflow
- Document: Build in main repo → Deploy in infra repo
- Add tag management guide
- Document rollback procedures (deploy previous image)

### Tag Management Best Practices

1. **Create tags on main branch**: `git tag api-v1.2.3 && git push origin api-v1.2.3`
2. **Use semantic versioning**: Follow `MAJOR.MINOR.PATCH` format
3. **Tag format**: `<service>-v<version>` (e.g., `api-v1.2.3`, `commit-worker-v1.5.0`)
4. **Tag before deploying**: Create tag, then deploy
5. **Tag releases**: Tag every production deployment per service
6. **Don't delete tags**: Keep history for rollback
7. **Use annotated tags**: `git tag -a api-v1.2.3 -m "Release API v1.2.3"`
8. **Independent versioning**: Each service can have different version numbers

### Rollback Strategy

**With Published Images, Rollback is Instant**:

```bash
# List available image versions for a specific service
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api \
  --project=${PROJECT_ID}

# Deploy previous version of specific service (image already exists, no rebuild needed)
./deploy.sh api 1.2.2  # Instant rollback for API only!

# Or deploy any version that exists in registry
./deploy.sh api 1.0.0  # Can deploy any historical version

# Rollback one service without affecting others
./deploy.sh commit-worker 1.4.0  # Only rollback commit-worker
```

**Benefits**:

- ✅ No rebuild needed (images already in registry)
- ✅ Instant rollback (just deploy different image)
- ✅ Can rollback to any version (not just recent)
- ✅ **Service-specific rollback**: Rollback one service without affecting others
- ✅ No risk of build failures during rollback
- ✅ Independent versioning: Each service can be at different versions

---

## ❓ Questions to Discuss

1. **Build Strategy**: ✅ **DECIDED - Published Images**

   - ✅ Main repo builds and publishes images to registry
   - ✅ Infra repo references published images (no building)
   - ✅ Industry best practice: Separate CI (build) from CD (deploy)

2. **Git Tags**: ✅ **DECIDED - Tags in Main Repo**

   - ✅ Tags created in main repo (`github-scraper`)
   - ✅ Tags trigger image building in main repo
   - ✅ Infra repo receives version as parameter (from tag or manual)
   - ✅ Single source of truth: Application versions = Image versions

3. **Script Updates**: ✅ **DECIDED - Reference Published Images**

   - ✅ Scripts validate images exist in registry
   - ✅ Scripts reference images by version tag
   - ✅ No source code access needed (images pre-built)
   - ✅ Environment variables for GCP config (PROJECT_ID, REGION, etc.)

4. **Tag Strategy**: ✅ **DECIDED - Separate Tags Per Service**

   - ✅ Separate tags per service: `api-v1.2.3`, `commit-worker-v1.2.3`, `user-worker-v1.2.3`
   - ✅ Each service can be versioned independently
   - ✅ Build workflow triggers only for the specific service being tagged
   - ✅ Deploy script accepts service name + version: `./deploy.sh api 1.2.3`
   - ✅ Benefits: Independent releases, faster builds (only build what changed)

5. **CI/CD**: ✅ **DECIDED - Two-Repository CI/CD Strategy**

   **Main Repository (`github-scraper`)**:

   - ✅ `.github/workflows/build-and-push.yml` - Triggers on service-specific tags (`api-v*.*.*`, `commit-worker-v*.*.*`, `user-worker-v*.*.*`)
   - ✅ Builds and pushes Docker images to GCP Artifact Registry
   - ✅ Automatically triggers deployment in infra repo via `repository_dispatch`
   - ✅ No validation workflows needed (builds happen on tags, which are intentional)

   **Infra Repository (`github-scraper-infra`)**:

   - ✅ `.github/workflows/deploy.yml` - Receives `repository_dispatch` from main repo
   - ✅ Validates image exists in registry before deployment
   - ✅ Runs health checks after deployment
   - ✅ Supports manual trigger via `workflow_dispatch` (for testing/debugging)

   **Workflow Integration**:

   - ✅ Main repo builds → Triggers infra repo deploy (fully automated)
   - ✅ Infra repo can also be triggered manually (for rollbacks, testing)
   - ✅ Both repos have build status badges in READMEs
   - ✅ Clear separation: CI (build) in main repo, CD (deploy) in infra repo

6. **Documentation**: ✅ **DECIDED - Comprehensive Documentation**

   **Infra Repository Documentation**:

   - ✅ **README.md** - Main overview with badges, workflow explanation, quick reference
   - ✅ **docs/DEPLOYMENT.md** - Comprehensive deployment guide (migrated from main repo)
   - ✅ **docs/DEPLOYMENT_QUICK_REFERENCE.md** - Quick reference for common tasks
   - ✅ **docs/DEPLOYMENT_PATTERNS.md** - Configuration patterns and best practices
   - ✅ **docs/OAUTH_SETUP.md** - OAuth setup guide (deployment-related)
   - ✅ **cloudrun/README.md** - Template usage and configuration guide
   - ✅ **Migration guide** - Included in main README or separate doc explaining how to migrate existing deployments

   **Main Repository Documentation**:

   - ✅ **README.md** - Updated to reference infra repo, explain image building workflow
   - ✅ **docs/ARCHITECTURE.md** - Stays in main repo (application architecture, not deployment)

   **Documentation Principles**:

   - ✅ **Comprehensive but organized** - Detailed guides for complex topics, quick references for common tasks
   - ✅ **Clear separation** - Deployment docs in infra repo, application docs in main repo
   - ✅ **Migration-friendly** - Guide for moving from current setup to new structure
   - ✅ **Badge visibility** - Build status badges prominently displayed in both READMEs

---

## 📋 Next Steps

1. ✅ **Review this plan** - Revised with industry best practices
2. ✅ **Build strategy decided** - Published images (main repo builds, infra repo deploys)
3. ✅ **Git tags strategy decided** - Separate tags per service (e.g., `api-v1.2.3`)
4. ✅ **Deployment approach decided** - Option C: Fully automated deployment with safety nets
5. ✅ **CI/CD strategy decided** - Two-repository approach (build in main, deploy in infra)
6. ✅ **Documentation strategy decided** - Comprehensive documentation with clear separation
7. **Create repository** `github-scraper-infra` on GitHub
8. **Add build workflow** to main repo (`.github/workflows/build-and-push.yml`) with `repository_dispatch` trigger
9. **Add deploy workflow** to infra repo (`.github/workflows/deploy.yml`) with safety checks
10. **Test image building** - Create tag `api-v1.0.0`, verify image builds and pushes
11. **Test automated deployment** - Verify infra repo receives trigger and deploys automatically
12. **Migrate deployment files** to infra repo (configs, scripts, docs)
13. **Update deploy script** to reference published images and include health checks
14. **Create comprehensive documentation** in infra repo (README, deployment guides, migration guide)
15. **Update main repo README** to reference infra repo and explain image building workflow
16. **Add build status badges** to both READMEs
17. 📝 **Future**: Consider adding staging environment when resources allow

---

## 🚀 Benefits After Migration

- ✅ **Cleaner main repository**: Focus on application code + image building
- ✅ **Industry best practice**: Separate CI (build) from CD (deploy)
- ✅ **Faster deployments**: No build time, just deploy existing images
- ✅ **Instant rollbacks**: Deploy any previous image version
- ✅ **Better traceability**: Immutable images in registry
- ✅ **Independent deployment evolution**: Deploy configs can change without touching app code
- ✅ **Better organization**: All deployment artifacts in one place
- ✅ **Easier onboarding**: Clear separation of concerns
- ✅ **Multi-environment support**: Same image, different configs
- ✅ **Future-ready**: Structure supports Helm, Terraform, etc.
- ✅ **Security**: Images scanned in registry, no source code needed for deploy

---

## 📚 References

- Current deployment files in `github-scraper` repository
- Deployment documentation in `docs/DEPLOYMENT.md`
- Script documentation in `scripts/README.md`
