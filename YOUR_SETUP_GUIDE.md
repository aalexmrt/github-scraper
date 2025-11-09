# 🚀 Personalized Deployment Setup Guide

## Your Configuration

- **GCP Project**: `personal-gcp-477623`
- **Region**: `us-east1`
- **Billing**: ✅ Enabled
- **Backend Service**: `api`
- **Worker Job**: `worker`

## Phase 1: Environment Setup

### Step 1.1: Set Environment Variables

Create a `.env.deploy` file or export these in your terminal:

```bash
export PROJECT_ID="personal-gcp-477623"
export REGION="us-east1"
export SERVICE="api"
export JOB_NAME="worker"
```

### Step 1.2: Set GCP Project

```bash
gcloud config set project personal-gcp-477623
```

### Step 1.3: Install Firebase Tools

```bash
npm install -g firebase-tools
firebase login
```

---

## Phase 2: Account Creation (Do These Now)

### Step 2.1: Firebase Setup (5 minutes)

1. Go to: https://console.firebase.google.com
2. Click **"Add project"** or **"Create a project"**
3. **Project name**: `personal-gcp-477623` (or any name)
4. **Important**: Link to your existing GCP project `personal-gcp-477623`
5. Click through setup (disable Google Analytics if you want)
6. Once created, note your **Firebase project ID** (might be different from GCP project ID)

**✅ Checkpoint**: Firebase project created and linked to GCP

### Step 2.2: Neon Postgres Setup (5 minutes)

1. Go to: https://neon.tech
2. Sign up (free account)
3. Click **"Create a project"**
4. **Project name**: `github-scraper` (or any name)
5. **Region**: Choose `US East (Ohio)` (matches GCP region)
6. **PostgreSQL version**: 15 (or latest)
7. Click **"Create project"**
8. Once created, you'll see a connection string like:
   ```
   postgres://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb
   ```
9. **Save this connection string** - you'll need it for secrets

**✅ Checkpoint**: Neon project created, connection string saved

### Step 2.3: Upstash Redis Setup (5 minutes)

1. Go to: https://upstash.com
2. Sign up (free account)
3. Click **"Create Database"**
4. **Database name**: `github-scraper-redis`
5. **Type**: Redis
6. **Region**: Choose `us-east-1` (matches GCP region)
7. **TLS**: Enable TLS (required)
8. Click **"Create"**
9. Once created, you'll see connection details:
   - **Endpoint** (host): `xxx-xxx-xxx.upstash.io`
   - **Port**: `6379` (or shown port)
   - **Password**: (shown once, save it!)
10. **Save these values** - you'll need them for secrets

**✅ Checkpoint**: Upstash Redis created, connection details saved

### Step 2.4: Cloudflare R2 Setup (5 minutes)

1. Go to: https://dash.cloudflare.com
2. Sign up (free account)
3. Add your website (or skip if just using R2)
4. Go to **R2** → **Create bucket**
5. **Bucket name**: `github-repos`
6. **Location**: Choose closest to `us-east1` (Ohio region)
7. Click **"Create bucket"**
8. Go to **Manage R2 API Tokens** → **Create API Token**
9. **Token name**: `github-scraper-production`
10. **Permissions**: Object Read & Write
11. **Bucket access**: `github-repos` (read & write)
12. Click **"Create API Token"**
13. **Save these values**:
    - **Account ID** (from dashboard URL or sidebar)
    - **Access Key ID**
    - **Secret Access Key**

**✅ Checkpoint**: Cloudflare R2 bucket created, API token saved

---

## Phase 3: Collect Your Credentials

Before proceeding, make sure you have:

### ✅ Neon Postgres

- [ ] Connection string: `postgres://...`

### ✅ Upstash Redis

- [ ] Host/Endpoint: `xxx.upstash.io`
- [ ] Port: `6379` (or shown)
- [ ] Password: `...`
- [ ] TLS enabled: Yes

### ✅ Cloudflare R2

- [ ] Account ID: `...`
- [ ] Access Key ID: `...`
- [ ] Secret Access Key: `...`
- [ ] Bucket name: `github-repos`

### ✅ GitHub Token (Optional but Recommended)

- [ ] Personal Access Token: `ghp_...` (for GitHub API access)

---

## Phase 4: Next Steps

Once you've completed all account setups above, we'll:

1. ✅ Create GCP secrets with your credentials
2. ✅ Update configuration files with your project ID
3. ✅ Build and deploy backend API
4. ✅ Build and deploy worker
5. ✅ Set up Cloud Scheduler
6. ✅ Deploy frontend to Firebase

---

## Quick Reference: Your Values

Save these for easy reference:

```bash
# GCP
PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
SERVICE="api"
JOB_NAME="worker"

# You'll fill these in after account creation:
DATABASE_URL="postgres://..." # From Neon
REDIS_HOST="xxx.upstash.io"   # From Upstash
REDIS_PORT="6379"             # From Upstash
REDIS_PASSWORD="..."          # From Upstash
R2_ACCOUNT_ID="..."           # From Cloudflare
R2_ACCESS_KEY_ID="..."        # From Cloudflare
R2_SECRET_ACCESS_KEY="..."    # From Cloudflare
R2_BUCKET_NAME="github-repos"  # From Cloudflare
```

---

**Ready?** Complete Phase 2 (account creation) and let me know when you have all the credentials saved. Then we'll move to Phase 3 (creating secrets and deploying)!
