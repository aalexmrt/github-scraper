# Two-Worker Architecture - Implementation Summary

## ✅ Completed Implementation

### Database
- ✅ Updated Prisma schema with `CommitData` model
- ✅ Updated `Repository` model with new fields
- ✅ Created migration file: `20250101000000_add_commit_data_and_two_worker_states/migration.sql`

### Code
- ✅ Created `commitQueue` and `userQueue` in `queueService.ts`
- ✅ Created `processCommits()` function in `repoService.ts`
- ✅ Created `commitWorker.ts` - processes commits, saves to CommitData, enqueues user jobs
- ✅ Created `userWorker.ts` - processes user lookups via GitHub API
- ✅ Created `userService.ts` - batch processes users with rate limiting
- ✅ Created `cloudrunCommitWorker.ts` - Cloud Run compatible commit worker
- ✅ Created `cloudrunUserWorker.ts` - Cloud Run compatible user worker
- ✅ Updated API endpoints to use `enqueueCommitJob()`

### Scripts
- ✅ Added npm scripts for all workers (dev and production)

## 🚀 Next Steps

### 1. Run Database Migration

```bash
cd backend
# Set DATABASE_URL if not already set
export DATABASE_URL="your_database_url"

# Run migration
npx prisma migrate deploy
# OR for development:
npx prisma migrate dev
```

### 2. Test Locally

**Terminal 1 - Start API Server:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Start Commit Worker:**
```bash
cd backend
npm run dev:commit-worker
```

**Terminal 3 - Start User Worker:**
```bash
cd backend
npm run dev:user-worker
```

**Terminal 4 - Test:**
```bash
# Submit a repository
curl -X POST "http://localhost:3000/leaderboard?repoUrl=https://github.com/vercel/next.js"

# Check status
curl "http://localhost:3000/leaderboard?repoUrl=https://github.com/vercel/next.js"
```

### 3. Monitor Queues

You can check queue status:
```bash
cd backend
npm run check-queue
```

Or create a script to check both queues:
```typescript
// Check commit queue
const commitWaiting = await commitQueue.getWaiting();
const commitActive = await commitQueue.getActive();

// Check user queue
const userWaiting = await userQueue.getWaiting();
const userActive = await userQueue.getActive();
```

## 📊 Architecture Flow

```
1. API Request → POST /leaderboard
   ↓
2. Create Repository (state: 'pending')
   ↓
3. enqueueCommitJob() → commitQueue
   ↓
4. commitWorker processes:
   - Clone/Fetch repo
   - Process commits
   - Save to CommitData table
   - Update Repository state: 'commits_processing' → 'users_processing'
   - Enqueue user jobs (batches of 50 emails)
   ↓
5. userQueue receives batches
   ↓
6. userWorker processes:
   - Lookup users via GitHub API (with rate limiting)
   - Create/Update Contributors
   - Link to Repository via RepositoryContributor
   - Mark CommitData as processed
   - When all processed: Update Repository state: 'completed'
```

## 🔍 Testing Checklist

- [ ] Run database migration successfully
- [ ] Start commit worker - verify it processes jobs
- [ ] Start user worker - verify it processes jobs
- [ ] Submit a repository via API
- [ ] Verify commit worker processes it
- [ ] Verify user worker processes batches
- [ ] Verify repository state transitions correctly
- [ ] Verify contributors are created/linked correctly
- [ ] Test with a repository that has many contributors
- [ ] Test rate limiting behavior in user worker

## 🐛 Troubleshooting

### Migration Issues
- Ensure DATABASE_URL is set
- Check database connection
- Verify Prisma schema is valid: `npx prisma validate`

### Worker Issues
- Check Redis connection (REDIS_HOST, REDIS_PORT, etc.)
- Verify queues are created: Check Redis keys
- Check worker logs for errors

### Queue Issues
- Verify jobs are being added: Check queue size
- Check for stuck jobs: `getActive()` should be empty
- Verify job data structure matches expected format

## 📝 Notes

- Commit worker processes one repo at a time
- User worker processes batches of 50 emails per job
- Rate limiting is handled in `userService.ts` via `rateLimitHandler`
- Both workers can run independently and scale separately
- Legacy `repoWorker.ts` still exists for backward compatibility

