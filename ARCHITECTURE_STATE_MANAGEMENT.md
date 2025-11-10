# State Management Architecture Analysis

## The Problem: Duplicate Jobs

**Current Situation:**

- 80 jobs waiting in Redis queue
- Only 4 repositories in `pending` state in database
- **~20 duplicate jobs per repository!**

## Root Cause Analysis

### Current Architecture: Two Sources of Truth

We have **two separate systems** managing state:

1. **PostgreSQL (Database)** - Repository state tracking

   - States: `pending`, `commits_processing`, `users_processing`, `completed`, `failed`
   - Persistent, survives restarts
   - Queried by frontend and scripts

2. **Redis (Bull Queue)** - Job queue
   - Manages job processing
   - Ephemeral (data can be lost)
   - Processed by workers

**Problem:** These two systems are NOT synchronized properly!

### Current Flow (with problems highlighted)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User adds repository via /leaderboard endpoint               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Create repo in DB           │
         │ state = 'pending'           │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ enqueueCommitJob()          │
         │ ❌ NO DEDUPLICATION!        │
         │ ❌ ALWAYS creates new job   │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Job added to Redis queue    │
         └─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. Commit worker processes job                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Pick job from Redis         │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Update DB: state =          │
         │ 'commits_processing'        │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Process commits             │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Update DB: state =          │
         │ 'users_processing'          │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Enqueue user jobs           │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ Job marked complete         │
         │ ✅ Job removed from Redis   │
         └─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. Re-enqueue script (reenqueuePendingRepos.ts)                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Find repos with             │
         │ state = 'pending'           │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ For each repo:              │
         │   enqueueCommitJob()        │
         │   ❌ NO CHECK if job exists │
         │   ❌ Creates NEW job        │
         └──────────┬──────────────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │ ❌ DUPLICATE JOBS CREATED!  │
         └─────────────────────────────┘
```

### Why We Have 80 Duplicate Jobs

**Scenario:**

1. 4 repositories got stuck in `pending` state (commit worker might have crashed/failed)
2. Re-enqueue script was run ~20 times (manually or via debugging)
3. Each run found those 4 pending repos
4. Each run created NEW jobs for those repos **without checking if jobs already exist**
5. Result: 4 repos × 20 runs = 80 jobs in Redis

**The code that causes this:**

```typescript
// queueService.ts - NO DEDUPLICATION!
export async function enqueueCommitJob(
  repositoryId: number,
  url: string,
  pathName: string,
  token: string | null
) {
  return commitQueue.add('commit_processing', {
    repositoryId,
    url,
    pathName,
    token,
  });
  // ❌ Always creates a new job
  // ❌ Doesn't check if a job already exists for this repositoryId
}
```

## Consequences of This Issue

1. **Wasted Resources**: Processing the same repo 20 times
2. **Confusion**: Hard to track what's actually being processed
3. **Free Tier Risk**: 80 jobs × 2 minutes = 160 minutes vs 4 jobs × 2 minutes = 8 minutes
4. **Data Inconsistency**: DB says "pending" but Redis has 20 jobs queued
5. **Race Conditions**: Multiple workers might process the same repo simultaneously

## Solution Options

### Option 1: Database as Single Source of Truth (Recommended for simplicity)

**Concept:** Remove Redis queue entirely, use database polling.

**How it works:**

```typescript
// Worker polls database every N seconds
setInterval(async () => {
  const pendingRepos = await prisma.repository.findMany({
    where: { state: 'pending' },
    take: 10,
  });

  for (const repo of pendingRepos) {
    await processRepository(repo);
  }
}, 30000); // Every 30 seconds
```

**Pros:**

- ✅ **Single source of truth** - DB is authoritative
- ✅ **No duplicates possible** - Can't process same repo twice
- ✅ **Simple to understand** - No queue synchronization
- ✅ **Persistent** - State survives crashes
- ✅ **Easy to debug** - Just query database

**Cons:**

- ❌ More database queries (but still very few)
- ❌ Less real-time (30-second polling interval)
- ❌ No built-in retry/backoff mechanisms
- ❌ Harder to scale (but we're on free tier anyway)

**When to use:** Small-medium scale (< 10,000 repos/month), simplicity is priority

---

### Option 2: Redis Queue with Job Deduplication (Recommended for current architecture)

**Concept:** Keep Redis queue but add deduplication using Bull's jobId feature.

**How it works:**

```typescript
// queueService.ts - WITH DEDUPLICATION
export async function enqueueCommitJob(
  repositoryId: number,
  url: string,
  pathName: string,
  token: string | null
) {
  // Use repositoryId as jobId for deduplication
  return commitQueue.add(
    'commit_processing',
    {
      repositoryId,
      url,
      pathName,
      token,
    },
    {
      jobId: `commit-${repositoryId}`, // ✅ Unique ID per repository
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  // Bull will reject duplicate jobIds automatically
}
```

**Pros:**

- ✅ **Prevents duplicates** - Bull handles deduplication
- ✅ **Keeps current architecture** - Minimal code changes
- ✅ **Fast processing** - Redis is fast
- ✅ **Built-in features** - Retry, backoff, priority
- ✅ **Scalable** - Can add more workers easily

**Cons:**

- ❌ Still two sources of truth (but synchronized)
- ❌ Redis data can be lost (use persistence)
- ❌ More complex than DB-only approach

**When to use:** Current setup, need queue features, scaling is important

---

### Option 3: Database with Redis Lock (Hybrid)

**Concept:** Use database for state, Redis only for distributed locking.

**How it works:**

```typescript
// Use Redis only to ensure one worker processes one repo
const lock = await redlock.acquire([`lock:repo:${repositoryId}`], 10000);
try {
  // Check DB state
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });
  if (repo.state === 'pending') {
    await processRepository(repo);
  }
} finally {
  await lock.release();
}
```

**Pros:**

- ✅ Database is single source of truth
- ✅ Distributed locking prevents duplicate processing
- ✅ Can use queue benefits (retry, priority)

**Cons:**

- ❌ Most complex solution
- ❌ Requires Redlock library
- ❌ Lock management overhead

**When to use:** Multiple workers, need strict consistency, can handle complexity

---

### Option 4: Event-Driven Architecture (Future-proof)

**Concept:** Use events to synchronize state changes.

**How it works:**

```typescript
// When repo is created
await eventBus.emit('repository.created', { repositoryId });

// Event handler
eventBus.on('repository.created', async ({ repositoryId }) => {
  await enqueueCommitJob(repositoryId);
});

// When job completes
eventBus.emit('commits.processed', { repositoryId });
```

**Pros:**

- ✅ Decoupled systems
- ✅ Easy to add new features
- ✅ Clear event flow
- ✅ Can replay events

**Cons:**

- ❌ Significant refactoring required
- ❌ Need event bus infrastructure
- ❌ More complex debugging

**When to use:** Large scale, many services, long-term project

---

## Comparison Table

| Feature             | DB Only      | Redis + Dedup      | DB + Lock        | Event-Driven       |
| ------------------- | ------------ | ------------------ | ---------------- | ------------------ |
| Complexity          | ⭐ Low       | ⭐⭐ Medium        | ⭐⭐⭐ High      | ⭐⭐⭐⭐ Very High |
| No Duplicates       | ✅ Yes       | ✅ Yes             | ✅ Yes           | ✅ Yes             |
| Performance         | ⭐⭐ Good    | ⭐⭐⭐ Great       | ⭐⭐ Good        | ⭐⭐⭐ Great       |
| Scalability         | ⭐⭐ Limited | ⭐⭐⭐⭐ Excellent | ⭐⭐⭐ Very Good | ⭐⭐⭐⭐ Excellent |
| Easy to Debug       | ✅ Yes       | ⭐⭐ Medium        | ❌ No            | ❌ No              |
| Implementation Time | 2 hours      | 1 hour             | 4 hours          | 8+ hours           |
| Free Tier Friendly  | ✅ Yes       | ✅ Yes             | ✅ Yes           | ✅ Yes             |

## Recommended Solution for Your Use Case

### **Go with Option 2: Redis Queue with Deduplication**

**Why:**

1. **Minimal changes** - Only modify `enqueueCommitJob()` function
2. **Solves the immediate problem** - No more duplicates
3. **Keeps current architecture** - Workers already built
4. **Still within free tier** - No additional costs
5. **Can implement in < 30 minutes**

**Implementation Plan:**

1. Add `jobId` to all enqueue operations
2. Add duplicate job checking before enqueueing (optional)
3. Clean up existing duplicate jobs in Redis
4. Test with re-enqueue script

## Immediate Fix for Current Situation

Before implementing the full solution, we need to clean up the 80 duplicate jobs:

```bash
# Option A: Clean all jobs and re-enqueue cleanly
npm run cleanup-failed-and-queued-jobs
npm run reenqueue-pending

# Option B: Process all jobs (will waste resources but will work)
./debug-commit-worker.sh process-all
```

## Next Steps

1. **Immediate (5 minutes):** Clean up duplicate jobs
2. **Short-term (30 minutes):** Implement job deduplication
3. **Medium-term (2 hours):** Add monitoring for duplicate detection
4. **Long-term (future):** Consider event-driven architecture if scaling beyond 10k repos/month
