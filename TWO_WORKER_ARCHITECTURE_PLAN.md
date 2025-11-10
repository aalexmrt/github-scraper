# Two-Worker Architecture Plan

## Overview

Split the current monolithic worker into two specialized workers:

1. **Commit Worker**: Clones repos and processes commits (no API calls)
2. **User Worker**: Processes user lookups via GitHub API (rate-limited operations)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Fastify)                      │
│  POST /leaderboard → Create repo → Enqueue to commit queue   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Commit Queue (Bull Queue)                      │
│  Job Type: 'commit_processing'                              │
│  Payload: { repositoryId, url, pathName, token }            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Commit Worker (Worker 1)                        │
│  • Clone/Fetch repository                                   │
│  • Process all commits                                       │
│  • Extract unique author emails                              │
│  • Count commits per email                                   │
│  • Save commit data to DB                                    │
│  • Enqueue user lookup jobs                                  │
│  NO API CALLS - No rate limit issues                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ Creates user lookup jobs
┌─────────────────────────────────────────────────────────────┐
│              User Queue (Bull Queue)                        │
│  Job Type: 'user_processing'                                │
│  Payload: { repositoryId, emails: string[] }               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              User Worker (Worker 2)                          │
│  • Batch process emails                                      │
│  • Lookup users via GitHub API                              │
│  • Create/Update Contributor records                        │
│  • Link contributors to repository                            │
│  • Update repository state                                   │
│  HANDLES ALL API CALLS - Rate limit managed here           │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### New Table: CommitData (Intermediate Storage)

```prisma
model CommitData {
  id              Int       @id @default(autoincrement())
  repositoryId    Int
  repository      Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  authorEmail     String
  commitCount     Int       @default(0)
  processed       Boolean   @default(false) // Whether user lookup completed
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([repositoryId, authorEmail])
  @@index([repositoryId, processed])
}
```

### Updated Repository Model

```prisma
model Repository {
  id                      Int                      @id @default(autoincrement())
  url                     String                   @unique
  pathName                String
  state                   String                   @default("pending")
  // New states: "commits_processing", "users_processing", "completed", "failed"
  lastAttempt             DateTime?
  lastProcessedAt         DateTime?
  commitsProcessedAt      DateTime?  // When commit processing completed
  usersProcessedAt        DateTime?  // When user processing completed
  totalCommits            Int?       // Total commits found
  uniqueContributors      Int?       // Unique contributor emails found
  createdAt               DateTime                 @default(now())
  updatedAt               DateTime                 @updatedAt
  contributors            RepositoryContributor[]
  commitData              CommitData[]             // New relation
}
```

## Queue Structure

### Two Separate Queues

```typescript
// commitQueue: For clone and commit processing
export const commitQueue = new Queue('commit-processing', {
  redis: redisConfig,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
  },
});

// userQueue: For user API lookups
export const userQueue = new Queue('user-processing', {
  redis: redisConfig,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
  },
});
```

### Job Types

**Commit Job:**

```typescript
{
  type: 'commit_processing',
  data: {
    repositoryId: number,
    url: string,
    pathName: string,
    token: string | null  // For git clone auth
  }
}
```

**User Job:**

```typescript
{
  type: 'user_processing',
  data: {
    repositoryId: number,
    emails: string[],  // Batch of emails to process
    token: string | null  // For GitHub API
  }
}
```

## Worker Implementation Plan

### Phase 1: Database Migration

1. **Create migration for CommitData table**

   - Add `CommitData` model
   - Add fields to `Repository` model
   - Update state enum values

2. **Migration script**

   ```sql
   CREATE TABLE "CommitData" (
     id SERIAL PRIMARY KEY,
     repositoryId INTEGER NOT NULL,
     authorEmail TEXT NOT NULL,
     commitCount INTEGER DEFAULT 0,
     processed BOOLEAN DEFAULT false,
     createdAt TIMESTAMP DEFAULT NOW(),
     updatedAt TIMESTAMP DEFAULT NOW(),
     UNIQUE(repositoryId, authorEmail)
   );

   ALTER TABLE "Repository"
   ADD COLUMN "commitsProcessedAt" TIMESTAMP,
   ADD COLUMN "usersProcessedAt" TIMESTAMP,
   ADD COLUMN "totalCommits" INTEGER,
   ADD COLUMN "uniqueContributors" INTEGER;
   ```

### Phase 2: Queue Service Updates

**File: `backend/src/services/queueService.ts`**

```typescript
// Add two queues
export const commitQueue = new Queue('commit-processing', {
  redis: redisConfig,
});
export const userQueue = new Queue('user-processing', { redis: redisConfig });

// Helper to add commit job
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
}

// Helper to add user job
export async function enqueueUserJob(
  repositoryId: number,
  emails: string[],
  token: string | null
) {
  return userQueue.add(
    'user_processing',
    {
      repositoryId,
      emails,
      token,
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    }
  );
}
```

### Phase 3: Commit Worker Implementation

**File: `backend/src/workers/commitWorker.ts`**

```typescript
import { commitQueue } from '../services/queueService';
import { syncRepository, processCommits } from '../services/repoService';
import { enqueueUserJob } from '../services/queueService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

commitQueue.process('commit_processing', async (job) => {
  const { repositoryId, url, pathName, token } = job.data;

  try {
    // Update state: pending → commits_processing
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        state: 'commits_processing',
        lastAttempt: new Date(),
      },
    });

    // Step 1: Clone/Fetch repository
    const dbRepository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });
    await syncRepository(dbRepository, token);

    // Step 2: Process commits and extract email data
    const commitData = await processCommits(dbRepository);

    // Step 3: Save commit data to CommitData table
    await prisma.$transaction(
      commitData.map(({ email, count }) =>
        prisma.commitData.upsert({
          where: {
            repositoryId_authorEmail: {
              repositoryId,
              authorEmail: email,
            },
          },
          update: { commitCount: count },
          create: {
            repositoryId,
            authorEmail: email,
            commitCount: count,
            processed: false,
          },
        })
      )
    );

    // Step 4: Update repository with commit stats
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        state: 'users_processing',
        commitsProcessedAt: new Date(),
        totalCommits: commitData.reduce((sum, d) => sum + d.count, 0),
        uniqueContributors: commitData.length,
      },
    });

    // Step 5: Enqueue user lookup jobs (batch emails)
    const BATCH_SIZE = 50; // Process 50 emails per user job
    const emails = commitData.map((d) => d.email);

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      await enqueueUserJob(repositoryId, batch, token);
    }

    logger.info(
      `[COMMIT_WORKER] Processed ${commitData.length} unique contributors for repo ${url}`
    );

    return { success: true, contributors: commitData.length };
  } catch (error: any) {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { state: 'failed' },
    });
    logger.error(`[COMMIT_WORKER] Failed: ${error.message}`);
    throw error;
  }
});
```

**New Service Function: `processCommits`**

**File: `backend/src/services/repoService.ts`**

```typescript
export async function processCommits(
  dbRepository: DbRepository
): Promise<Array<{ email: string; count: number }>> {
  const repoPath = await storage.getLocalPath(dbRepository.pathName);
  const git = simpleGit(repoPath);

  const emailToCount = new Map<string, number>();

  try {
    const log = await git.log();

    // Count commits per email
    for (const { author_email } of log.all) {
      if (!author_email) continue;

      const currentCount = emailToCount.get(author_email) || 0;
      emailToCount.set(author_email, currentCount + 1);
    }

    // Convert to array format
    return Array.from(emailToCount.entries()).map(([email, count]) => ({
      email,
      count,
    }));
  } catch (error: any) {
    logger.error(`Error processing commits: ${error.message}`);
    throw new Error(`Failed to process commits: ${error.message}`);
  }
}
```

### Phase 4: User Worker Implementation

**File: `backend/src/workers/userWorker.ts`**

```typescript
import { userQueue } from '../services/queueService';
import { batchProcessUsers } from '../services/userService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

userQueue.process('user_processing', async (job) => {
  const { repositoryId, emails, token } = job.data;

  try {
    // Process batch of emails
    const results = await batchProcessUsers(repositoryId, emails, token);

    // Update CommitData records as processed
    await prisma.commitData.updateMany({
      where: {
        repositoryId,
        authorEmail: { in: emails },
      },
      data: { processed: true },
    });

    // Check if all commits for this repo are processed
    const remainingUnprocessed = await prisma.commitData.count({
      where: {
        repositoryId,
        processed: false,
      },
    });

    if (remainingUnprocessed === 0) {
      // All users processed, update repository state
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          state: 'completed',
          usersProcessedAt: new Date(),
          lastProcessedAt: new Date(),
        },
      });

      logger.info(
        `[USER_WORKER] Completed all user processing for repo ${repositoryId}`
      );
    }

    return {
      success: true,
      processed: results.processed,
      rateLimitHit: results.rateLimitHit,
    };
  } catch (error: any) {
    logger.error(`[USER_WORKER] Failed: ${error.message}`);

    // Don't mark repo as failed, just log - other batches might succeed
    // The repo will remain in 'users_processing' state
    throw error;
  }
});
```

**New Service Function: `batchProcessUsers`**

**File: `backend/src/services/userService.ts`** (new file)

```typescript
import axios from 'axios';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { rateLimitHandler } from '../utils/rateLimitHandler';

export async function batchProcessUsers(
  repositoryId: number,
  emails: string[],
  token: string | null
): Promise<{ processed: number; rateLimitHit: boolean }> {
  let processed = 0;
  let rateLimitHit = false;

  // Get commit data for these emails
  const commitData = await prisma.commitData.findMany({
    where: {
      repositoryId,
      authorEmail: { in: emails },
    },
  });

  // Process each email
  for (const { authorEmail, commitCount } of commitData) {
    try {
      // Check rate limits before each request
      await rateLimitHandler.checkAndWait();

      // Get or create contributor
      const contributor = await getOrCreateContributor(authorEmail, token);

      // Link contributor to repository
      await prisma.repositoryContributor.upsert({
        where: {
          repositoryId_contributorId: {
            repositoryId,
            contributorId: contributor.id,
          },
        },
        update: { commitCount },
        create: {
          repositoryId,
          contributorId: contributor.id,
          commitCount,
        },
      });

      processed++;
    } catch (error: any) {
      if (rateLimitHandler.isRateLimitError(error)) {
        rateLimitHit = true;
        logger.warn(`[USER_SERVICE] Rate limit hit, stopping batch processing`);
        break; // Stop processing this batch
      } else {
        logger.error(
          `[USER_SERVICE] Failed to process ${authorEmail}: ${error.message}`
        );
        // Continue with next email
      }
    }
  }

  return { processed, rateLimitHit };
}

async function getOrCreateContributor(
  email: string,
  token: string | null
): Promise<any> {
  // Check if no-reply email
  const isNoReply = email.endsWith('@users.noreply.github.com');
  const username = isNoReply
    ? email.split('@')[0].split('+')[1] || email.split('@')[0]
    : null;

  // Check database first
  let contributor = await prisma.contributor.findFirst({
    where: {
      OR: [{ email }, ...(username ? [{ username }] : [])],
    },
  });

  if (contributor) {
    // Check if needs refresh (>24h old)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const needsRefresh =
      !isNoReply &&
      contributor.updatedAt.getTime() < Date.now() - TWENTY_FOUR_HOURS;

    if (needsRefresh && token) {
      try {
        await rateLimitHandler.checkAndWait();
        const response = await axios.get(
          `https://api.github.com/search/users?q=${email}+in:email`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        rateLimitHandler.updateFromResponse(response);

        if (response.data.items.length > 0) {
          const { login, html_url } = response.data.items[0];
          contributor = await prisma.contributor.update({
            where: { id: contributor.id },
            data: {
              username: login,
              profileUrl: html_url,
              updatedAt: new Date(),
            },
          });
        }
      } catch (error: any) {
        // If rate limit or error, use existing contributor
        if (!rateLimitHandler.isRateLimitError(error)) {
          logger.warn(`Failed to refresh ${email}: ${error.message}`);
        }
      }
    }

    return contributor;
  }

  // Create new contributor
  if (isNoReply) {
    return prisma.contributor.create({
      data: {
        username,
        profileUrl: `https://github.com/${username}`,
      },
    });
  }

  // Try to lookup via API
  if (token) {
    try {
      await rateLimitHandler.checkAndWait();
      const response = await axios.get(
        `https://api.github.com/search/users?q=${email}+in:email`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      rateLimitHandler.updateFromResponse(response);

      if (response.data.items.length > 0) {
        const { login, html_url } = response.data.items[0];
        return prisma.contributor.upsert({
          where: { username: login },
          update: { email, profileUrl: html_url },
          create: {
            username: login,
            email,
            profileUrl: html_url,
          },
        });
      }
    } catch (error: any) {
      if (rateLimitHandler.isRateLimitError(error)) {
        // Rate limit hit - create with email only
        return prisma.contributor.create({
          data: { email },
        });
      }
      logger.error(`Failed to lookup ${email}: ${error.message}`);
    }
  }

  // Fallback: create with email only
  return prisma.contributor.create({
    data: { email },
  });
}
```

### Phase 5: Update API Endpoints

**File: `backend/src/index.ts`**

```typescript
// Update POST /leaderboard endpoint
app.post('/leaderboard', async (request, reply) => {
  // ... validation ...

  if (!dbRepository) {
    // Create repository
    dbRepository = await prisma.repository.create({
      data: {
        url: normalizedUrl,
        pathName: repoName,
        state: 'pending',
        lastAttempt: new Date(),
      },
    });

    // Enqueue commit processing job (not user job)
    await enqueueCommitJob(dbRepository.id, normalizedUrl, repoName, token);
  }

  // Return appropriate status based on state
  switch (dbRepository.state) {
    case 'pending':
    case 'commits_processing':
      return reply.status(202).send({
        message: 'Repository is being processed.',
        stage: 'commits',
      });
    case 'users_processing':
      return reply.status(202).send({
        message: 'Processing user data.',
        stage: 'users',
      });
    // ... other cases ...
  }
});
```

### Phase 6: Cloud Run Worker Updates

**File: `backend/src/workers/cloudrunCommitWorker.ts`** (new)

```typescript
// Similar to cloudrunWorker.ts but processes commit jobs
async function processOneCommitJob() {
  const waitingJobs = await commitQueue.getWaiting();
  if (waitingJobs.length === 0) {
    process.exit(0);
  }

  const job = waitingJobs[0];
  // Process commit job...
}
```

**File: `backend/src/workers/cloudrunUserWorker.ts`** (new)

```typescript
// Similar to cloudrunWorker.ts but processes user jobs
async function processOneUserJob() {
  const waitingJobs = await userQueue.getWaiting();
  if (waitingJobs.length === 0) {
    process.exit(0);
  }

  const job = waitingJobs[0];
  // Process user job...
}
```

## Deployment Configuration

### Dockerfiles

**`backend/Dockerfile.commit-worker`**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/workers/cloudrunCommitWorker.js"]
```

**`backend/Dockerfile.user-worker`**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/workers/cloudrunUserWorker.js"]
```

### Cloud Run Jobs

**`cloudrun-commit-job.yaml`**

```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: commit-worker
spec:
  template:
    spec:
      parallelism: 1
      taskCount: 1
      template:
        spec:
          containers:
            - image: us-east1-docker.pkg.dev/.../commit-worker:latest
              # ... env vars ...
```

**`cloudrun-user-job.yaml`**

```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: user-worker
spec:
  template:
    spec:
      parallelism: 1
      taskCount: 1
      template:
        spec:
          containers:
            - image: us-east1-docker.pkg.dev/.../user-worker:latest
              # ... env vars ...
```

### Cloud Scheduler Configuration

Both workers are triggered via Google Cloud Scheduler to stay within the free tier:

**Commit Worker Scheduler:**

- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Job Name**: `commit-worker`
- **Scheduler Name**: `commit-worker-scheduler`
- **Purpose**: Process repository commits frequently (no API rate limits)

**User Worker Scheduler:**

- **Schedule**: Every 4 hours (`0 */4 * * *`)
- **Job Name**: `user-worker`
- **Scheduler Name**: `user-worker-scheduler`
- **Purpose**: Sync user data via GitHub API (rate-limited operations)

**Setup Script**: Use `setup-two-worker-schedulers.sh` to configure both schedulers.

**Deployment Steps:**

1. Deploy both Cloud Run Jobs (`commit-worker` and `user-worker`)
2. Run `./setup-two-worker-schedulers.sh` to create schedulers
3. Verify schedulers are running: `gcloud scheduler jobs list --location=us-east1`

### Free Tier Analysis

With the configured schedules, the system stays **within Google Cloud Run free tier limits**:

**Monthly Execution Count:**

- Commit Worker: 8,640 executions/month (30 days × 24 hours × 60 minutes ÷ 5)
- User Worker: 180 executions/month (30 days × 24 hours ÷ 4)
- **Total**: 8,820 executions/month

**Resource Usage** (assuming ~15 seconds per execution, 1 CPU, 512Mi memory):

- **vCPU-seconds**: ~132,300/month ✅ (within 180,000 free tier limit)
- **GB-seconds**: ~66,150/month ✅ (within 360,000 free tier limit)
- **Cloud Scheduler**: 2 jobs ✅ (within 3 free tier limit)

**Cost**: $0/month (stays within free tier)

**Rationale:**

- **Commit Worker** runs frequently (every 5 minutes) because it processes git operations locally without API calls, so there are no rate limit concerns
- **User Worker** runs less frequently (every 4 hours) because it makes GitHub API calls and needs to respect rate limits
- This separation allows commit processing to proceed quickly while user lookups happen asynchronously without blocking

## Migration Strategy

### Step 1: Add New Tables (Non-Breaking)

- Add `CommitData` table
- Add new fields to `Repository` (nullable)
- Keep existing code working

### Step 2: Deploy New Workers (Parallel)

- Deploy commit worker
- Deploy user worker
- Keep old worker running for existing jobs

### Step 3: Update API (Gradual)

- Update API to use new queue
- Old repos continue with old flow
- New repos use new flow

### Step 4: Migrate Existing Jobs

- Script to migrate pending repos to new flow
- Process existing `completed_partial` repos

### Step 5: Remove Old Worker

- Once all jobs migrated, remove old worker code

## Benefits

1. **No Rate Limit Blocking**: Commit processing never blocked by API limits
2. **Better Scalability**: Can scale user workers independently
3. **Faster Commit Processing**: No waiting for API calls
4. **Better Error Handling**: User lookup failures don't affect commit data
5. **Batch Processing**: User worker can batch emails efficiently
6. **Progress Tracking**: Can see commit processing vs user processing stages
7. **Retry Strategy**: Can retry user lookups without re-processing commits

## Monitoring

- Track queue sizes: `commitQueue.getWaiting().length`, `userQueue.getWaiting().length`
- Monitor state distribution: Count repos by state
- Track processing times: `commitsProcessedAt - createdAt`, `usersProcessedAt - commitsProcessedAt`
- Alert on stuck repos: Repos in `commits_processing` or `users_processing` for >1 hour
