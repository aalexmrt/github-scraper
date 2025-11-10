# Next Steps - Two-Worker Architecture

## 🎯 Immediate Next Steps

### 1. **Create Dockerfiles for New Workers** ⚠️ TODO

We need to create Dockerfiles for the new workers:

**`backend/Dockerfile.commit-worker`** - For commit worker
**`backend/Dockerfile.user-worker`** - For user worker  
**`backend/Dockerfile.cloudrun-commit-worker`** - For Cloud Run commit worker
**`backend/Dockerfile.cloudrun-user-worker`** - For Cloud Run user worker

### 2. **Update Docker Compose** ⚠️ TODO

Update `docker-compose.yml` and `docker-compose.services.yml` to include:
- `commit-worker` service
- `user-worker` service

### 3. **Run Database Migration** ✅ Ready

```bash
cd backend
npx prisma migrate deploy  # Production
# OR
npx prisma migrate dev      # Development (creates migration)
```

### 4. **Test Locally** ✅ Ready

**Terminal 1 - API:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Commit Worker:**
```bash
cd backend
npm run dev:commit-worker
```

**Terminal 3 - User Worker:**
```bash
cd backend
npm run dev:user-worker
```

**Terminal 4 - Test:**
```bash
curl -X POST "http://localhost:3000/leaderboard?repoUrl=https://github.com/vercel/next.js"
curl "http://localhost:3000/leaderboard?repoUrl=https://github.com/vercel/next.js"
```

### 5. **Update Cloud Run Configurations** ⚠️ TODO

Update `cloudrun-job.yaml` or create separate configs:
- `cloudrun-commit-job.yaml`
- `cloudrun-user-job.yaml`

### 6. **Update Deployment Scripts** ⚠️ TODO

Update deployment scripts to build and deploy both workers.

## 📋 Priority Order

1. **Test locally first** (no Docker needed)
   - Run migration
   - Start workers manually
   - Verify flow works

2. **Create Dockerfiles** (for containerization)
   - Base on existing `Dockerfile.worker` pattern
   - Update CMD to use new worker scripts

3. **Update docker-compose** (for local development)
   - Add both worker services
   - Configure environment variables

4. **Update Cloud Run configs** (for production)
   - Create separate job configs
   - Update deployment scripts

## 🔍 What to Test

- [ ] Migration runs successfully
- [ ] Commit worker processes jobs
- [ ] User worker processes batches
- [ ] State transitions work correctly
- [ ] Contributors are created/linked
- [ ] Rate limiting works in user worker
- [ ] Both workers can run simultaneously
- [ ] Jobs are properly enqueued/dequeued

## 🚨 Potential Issues to Watch

1. **Import paths** - Make sure all imports use correct file names (with hyphens)
2. **Queue names** - Verify queues are created correctly in Redis
3. **State transitions** - Ensure repository states update correctly
4. **Batch processing** - Verify user jobs are batched correctly (50 emails per job)
5. **Error handling** - Test what happens if one worker fails

