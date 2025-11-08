# Deployment Plan - GitHub Repository Scraper

## Overview

This document outlines a deployment strategy for the GitHub Repository Scraper using **free tier services**. The plan is optimized for low-to-medium traffic scenarios with cost-effective solutions.

## Architecture Overview

The application consists of:

- **Frontend**: Next.js application
- **Backend API**: Fastify server
- **Worker**: Background job processor
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Storage**: File system for Git repositories

---

## Recommended Free Tier Stack

### Option 1: Vercel + Railway + Upstash (Recommended)

**Best for**: Easiest setup, good performance, generous free tiers

| Component       | Service            | Free Tier Limits                             | Why This Choice                       |
| --------------- | ------------------ | -------------------------------------------- | ------------------------------------- |
| **Frontend**    | Vercel             | Unlimited bandwidth, 100GB bandwidth/month   | Best Next.js integration, zero config |
| **Backend API** | Railway            | $5 free credit/month (enough for small apps) | Simple deployment, good docs          |
| **Worker**      | Railway            | Same as backend                              | Can run multiple services             |
| **Database**    | Railway PostgreSQL | 1GB storage, included in free credit         | Integrated with Railway               |
| **Redis**       | Upstash            | 10K commands/day, 256MB storage              | Generous free tier, serverless        |
| **Storage**     | Railway Volumes    | 1GB included                                 | Persistent storage (~20-50 repos)     |

**Monthly Cost**: $0 (within free tier limits)

### Option 2: Vercel + Render + Upstash

**Best for**: More generous free tiers, better for scaling

| Component       | Service           | Free Tier Limits                               | Why This Choice              |
| --------------- | ----------------- | ---------------------------------------------- | ---------------------------- |
| **Frontend**    | Vercel            | Unlimited bandwidth                            | Best Next.js integration     |
| **Backend API** | Render            | 750 hours/month, sleeps after 15min inactivity | Free tier with auto-sleep    |
| **Worker**      | Render            | 750 hours/month                                | Can run as background worker |
| **Database**    | Render PostgreSQL | 90 days free trial, then $7/month              | Or use Supabase free tier    |
| **Redis**       | Upstash           | 10K commands/day                               | Serverless Redis             |
| **Storage**     | Render Disks      | 1GB free                                       | Persistent storage           |

**Monthly Cost**: $0-7 (depending on database choice)

### Option 3: All-in-One Railway (Simplest)

**Best for**: Simplest deployment, everything in one place

| Component       | Service            | Free Tier Limits     |
| --------------- | ------------------ | -------------------- |
| **Frontend**    | Railway            | $5 free credit/month |
| **Backend API** | Railway            | Same account         |
| **Worker**      | Railway            | Same account         |
| **Database**    | Railway PostgreSQL | Included             |
| **Redis**       | Railway Redis      | Included             |
| **Storage**     | Railway Volumes    | 1GB included         |

**Monthly Cost**: $0 (within free credit)

---

## Detailed Deployment Plan: Option 1 (Recommended)

### Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Vercel account (sign up at [vercel.com](https://vercel.com))
- Upstash account (sign up at [upstash.com](https://upstash.com))

### Step 1: Prepare Production Dockerfiles

#### Backend Production Dockerfile

Create `backend/Dockerfile.prod`:

```dockerfile
FROM node:22.11.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Production stage
FROM node:22.11.0-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src

# Create directory for repos
RUN mkdir -p /data/repos

EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

#### Worker Production Dockerfile

Create `backend/Dockerfile.worker`:

```dockerfile
FROM node:22.11.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production

COPY . .

RUN npx prisma generate

FROM node:22.11.0-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src

RUN mkdir -p /data/repos

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/workers/repoWorker.js"]
```

#### Update Backend package.json

Add build script:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### Step 2: Set Up Railway Services

#### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select the `github-scraper` repository

#### 2.2 Deploy PostgreSQL Database

1. In Railway dashboard, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically create a PostgreSQL instance
3. Copy the connection string (will be available as `DATABASE_URL` environment variable)

#### 2.3 Deploy Backend API

1. Click "New" → "GitHub Repo" → Select your repo
2. Railway will detect the Dockerfile
3. Configure:
   - **Root Directory**: `backend`
   - **Dockerfile**: `Dockerfile.prod`
   - **Port**: `3000`
4. Add environment variables:

   ```
   DATABASE_URL=<from PostgreSQL service>
   REDIS_HOST=<upstash-redis-host>
   REDIS_PORT=6379
   REDIS_PASSWORD=<upstash-redis-password>
   REDIS_TLS=true
   GITHUB_TOKEN=<your-github-token>
   NODE_ENV=production
   PORT=3000

   # Cloudflare R2 Storage (for production)
   USE_R2_STORAGE=true
   R2_ACCOUNT_ID=<your-r2-account-id>
   R2_ACCESS_KEY_ID=<your-r2-access-key>
   R2_SECRET_ACCESS_KEY=<your-r2-secret-key>
   R2_BUCKET_NAME=github-repos
   ```

5. **Note**: No volume needed for R2 storage (repositories stored in Cloudflare R2)
   - If you want to use Docker volumes instead, omit R2 variables and add volume: `/data/repos`
   - See `R2_SETUP.md` for R2 configuration details

#### 2.4 Deploy Worker

1. Click "New" → "GitHub Repo" → Select your repo
2. Configure:
   - **Root Directory**: `backend`
   - **Dockerfile**: `Dockerfile.worker`
3. Add same environment variables as backend (including R2 variables)
4. **Note**: No volume needed if using R2 storage
5. Set as background service (no public port)

### Step 3: Set Up Cloudflare R2 (Production Storage)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2** → **Create bucket**
3. Name your bucket (e.g., `github-repos`)
4. Choose location closest to your Railway deployment
5. Create bucket
6. Go to **Manage R2 API Tokens** → **Create API Token**
   - Token name: `github-scraper-production`
   - Permissions: Object Read & Write
   - Copy credentials:
     - **Account ID** (from dashboard URL or sidebar)
     - **Access Key ID**
     - **Secret Access Key**
7. Add R2 credentials to Railway environment variables (see Step 2.3)

**For detailed R2 setup, see `R2_SETUP.md`**

### Step 4: Set Up Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com)
2. Click "Create Database"
3. Choose "Regional" (free tier)
4. Select region closest to your Railway deployment
5. Copy connection details:
   - Endpoint URL
   - Port (usually 6379)
   - Password
6. Update Railway environment variables with Redis credentials

### Step 5: Deploy Frontend to Vercel

#### 4.1 Update Frontend Configuration

Update `frontend/next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    // Use environment variable for backend URL in production
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

#### 4.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-backend-url.up.railway.app
   ```
6. Click "Deploy"

### Step 5: Update Environment Variables

#### Backend Environment Variables (Railway)

```env
DATABASE_URL=<railway-postgres-url>
REDIS_HOST=<upstash-redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<upstash-redis-password>
GITHUB_TOKEN=<your-github-personal-access-token>
NODE_ENV=production
PORT=3000
BACKEND_URL=0.0.0.0
```

#### Frontend Environment Variables (Vercel)

```env
NEXT_PUBLIC_API_URL=https://your-backend-service.up.railway.app
```

### Step 6: Update Code for Production

#### Update Backend CORS (if needed)

Add to `backend/src/index.ts`:

```typescript
import fastifyCors from '@fastify/cors';

// Register CORS
app.register(fastifyCors, {
  origin: [
    'https://your-vercel-app.vercel.app',
    'http://localhost:3001', // for local development
  ],
  credentials: true,
});
```

Install: `npm install @fastify/cors`

#### Update Frontend API Service

Ensure `frontend/src/services/repositoryService.ts` uses relative paths (already done with `/api/*`)

---

## Alternative: All-in-One Railway Deployment

If you prefer everything in one place:

### Step 1: Create Railway Project

1. New Project → Deploy from GitHub
2. Add services:
   - PostgreSQL (Database)
   - Redis (Database)
   - Backend API (GitHub Repo)
   - Worker (GitHub Repo)
   - Frontend (GitHub Repo)

### Step 2: Configure Each Service

**Backend API**:

- Root: `backend`
- Dockerfile: `Dockerfile.prod`
- Port: `3000`
- Environment: Link PostgreSQL and Redis services
- Volume: `/data/repos` (1GB)

**Worker**:

- Root: `backend`
- Dockerfile: `Dockerfile.worker`
- Environment: Same as backend
- Volume: `/data/repos` (shared with backend)

**Frontend**:

- Root: `frontend`
- Build Command: `npm run build`
- Start Command: `npm start`
- Environment: `NEXT_PUBLIC_API_URL=<backend-url>`

---

## Storage Capacity & Management

### Storage Capacity Estimates

**1GB Railway Volume Capacity**:

- **Estimated**: ~20-50 repositories (depending on size)
- **Typical repo size**: 20-100 MB (bare clone format)
- **Small repos**: 5-20 MB each → ~50-100 repos possible
- **Medium repos**: 20-100 MB each → ~20-50 repos possible
- **Large repos**: 100-500 MB each → ~5-10 repos possible

**Storage Growth**:

- Repositories grow as commits accumulate
- Updates via `git fetch` add new objects
- Monitor usage weekly, set alerts at 80% capacity (800 MB)

### Storage Options

**Option 1: Current Setup (1GB Free)**

- Sufficient for ~20-50 repositories
- No additional cost
- Implement cleanup for old/failed repos

**Option 2: Upgrade Railway Volume**

- 5GB: ~$2-5/month → ~100-250 repos
- 10GB: ~$5-10/month → ~200-500 repos
- No code changes needed

**Option 3: External Storage (S3-Compatible)**

- Cloudflare R2: 10GB free → Unlimited with pay-as-you-go
- Backblaze B2: 10GB free → Very cheap ($0.005/GB/month)
- Requires code changes for S3 integration

**Option 4: Hybrid Approach**

- Keep active repos locally (Railway)
- Archive old repos to S3 (R2/B2)
- Best of both worlds

**Recommendation**: Start with 1GB, monitor usage, upgrade to 5GB if needed (~$2-5/month).

For Cloudflare R2 setup instructions, see `R2_SETUP.md`.

---

## Free Tier Limitations & Solutions

### Railway Free Tier ($5 credit/month)

**Limitations**:

- $5 credit (~500 hours of runtime)
- Services sleep after inactivity
- 1GB storage per volume

**Solutions**:

- Use Upstash Redis (separate free tier)
- Optimize worker to process jobs efficiently
- Consider Render for always-on services

### Vercel Free Tier

**Limitations**:

- 100GB bandwidth/month
- Serverless functions timeout after 10s (not an issue for frontend)

**Solutions**:

- Frontend only, no serverless functions needed
- Bandwidth should be sufficient for low traffic

### Upstash Redis Free Tier

**Limitations**:

- 10,000 commands/day
- 256MB storage
- Regional only (not global)

**Solutions**:

- Monitor command usage
- Cache strategically
- Upgrade if needed ($0.20 per 100K commands)

---

## Monitoring & Maintenance

### Health Checks

1. **Backend Health**: `https://your-backend.up.railway.app/health`
2. **Frontend**: Vercel provides built-in monitoring
3. **Database**: Railway dashboard shows usage

### Logs

- **Railway**: Built-in log viewer in dashboard
- **Vercel**: Logs available in dashboard
- **Upstash**: Monitor commands in console

### Cost Monitoring

- **Railway**: Dashboard shows credit usage
- **Vercel**: Dashboard shows bandwidth usage
- **Upstash**: Console shows command usage

---

## Backup Strategy

### Database Backups

Railway PostgreSQL:

- Automatic daily backups (7-day retention on free tier)
- Manual backups via Railway dashboard

### Repository Storage

- Git repositories stored in Railway volumes
- Consider periodic backups if critical
- Can export via Railway CLI

---

## Scaling Considerations

### When to Upgrade

**Railway**:

- Upgrade when approaching $5 credit limit
- Consider paid plan ($5/month) for always-on services

**Upstash**:

- Upgrade when exceeding 10K commands/day
- Pay-as-you-go pricing available

**Vercel**:

- Upgrade Pro plan ($20/month) for more bandwidth
- Usually not needed for low traffic

### Horizontal Scaling

- Add more worker instances in Railway
- Use Railway's scaling features
- Monitor Redis command limits

---

## Troubleshooting

### Common Issues

1. **Services Sleeping (Railway)**

   - Solution: Use Render for always-on services
   - Or: Upgrade Railway plan

2. **Redis Connection Errors**

   - Check Upstash credentials
   - Verify network connectivity
   - Check command limits

3. **Database Connection Issues**

   - Verify DATABASE_URL format
   - Check Railway service status
   - Ensure migrations ran successfully

4. **Frontend Can't Reach Backend**
   - Verify NEXT_PUBLIC_API_URL
   - Check CORS configuration
   - Verify Railway service is public

---

## Quick Start Checklist

- [ ] Create Railway account
- [ ] Create Vercel account
- [ ] Create Upstash account
- [ ] Set up PostgreSQL on Railway
- [ ] Set up Redis on Upstash
- [ ] Deploy backend API to Railway
- [ ] Deploy worker to Railway
- [ ] Deploy frontend to Vercel
- [ ] Configure environment variables
- [ ] Test health endpoints
- [ ] Test repository submission
- [ ] Monitor logs and usage

---

## Estimated Monthly Costs

**Free Tier (Recommended)**:

- Railway: $0 (within $5 credit)
- Vercel: $0
- Upstash: $0
- **Total: $0/month**

**If Exceeding Free Tiers**:

- Railway: $5/month (hobby plan)
- Vercel: $0 (usually sufficient)
- Upstash: ~$1-5/month (pay-as-you-go)
- **Total: ~$6-10/month**

---

## Next Steps

1. Choose deployment option (Option 1 recommended)
2. Create accounts for required services
3. Follow step-by-step deployment guide
4. Test deployment thoroughly
5. Set up monitoring and alerts
6. Document your specific configuration

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Vercel Documentation](https://vercel.com/docs)
- [Upstash Documentation](https://docs.upstash.com)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)

---

## Support

For issues specific to this deployment:

1. Check service status pages
2. Review service logs
3. Consult service documentation
4. Check GitHub issues for known problems
