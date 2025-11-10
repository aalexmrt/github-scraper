# Repository Analysis Flow & Rate Limiting Optimization

## Current Flow Analysis

### 1. Repository Submission Flow

```
User Request (POST /leaderboard?repoUrl=...)
    ↓
Validate & Normalize URL
    ↓
Check Database (findUnique by URL)
    ↓
If New: Create DB Record (state='pending')
    ↓
Add Job to Bull Queue {dbRepository, token}
    ↓
Return 202 Accepted
```

**Key Points:**
- Token is extracted from user session, Authorization header, or env var
- Job payload includes full repository object and optional token
- No duplicate job prevention (relies on Bull's default behavior)

### 2. Worker Processing Flow

```
Worker picks job from queue
    ↓
Update repo state: 'pending' → 'in_progress'
    ↓
syncRepository() - Clone/Fetch Git Repo
    ↓
generateLeaderboard() - Process Commits
    ↓
For each commit author_email:
    ├─ Check in-memory cache (Map)
    ├─ Check database
    ├─ If not found or stale (>24h):
    │   ├─ Check rate limits (await rateLimitHandler.checkAndWait())
    │   ├─ Call GitHub API: search/users?q={email}+in:email
    │   ├─ Update rate limit state from response
    │   └─ Create/Update contributor in DB
    └─ Track commit count
    ↓
Bulk upsert RepositoryContributor records
    ↓
Update repo state: 'completed' or 'completed_partial'
```

**Key Points:**
- Sequential processing of commits (one at a time)
- Each API call is made individually
- Rate limit check happens before each API call
- Rate limit state is tracked per worker instance (not shared)

### 3. Rate Limiting Implementation

**Current RateLimitHandler:**
- Tracks `remaining`, `reset`, `limit` from response headers
- Waits when `remaining <= 10` (MIN_REMAINING_THRESHOLD)
- Adds 5 second buffer before reset time
- Singleton instance per worker process

**Limitations:**
- No shared state across workers
- No token rotation/pooling
- No exponential backoff
- No request deduplication
- Simple wait strategy (blocks entire worker)

## Current Issues & Bottlenecks

### 1. **Sequential API Calls**
- **Problem**: Each commit author requires a separate API call, processed one-by-one
- **Impact**: For repos with 1000+ unique contributors, this means 1000+ sequential API calls
- **Rate Limit**: GitHub allows 30 requests/minute for unauthenticated, 5000/hour for authenticated
- **Time**: At 30 req/min, 1000 contributors = ~33 minutes minimum

### 2. **No Request Deduplication**
- **Problem**: Multiple workers might look up the same user simultaneously
- **Impact**: Wasted API calls, faster rate limit exhaustion
- **Example**: Two repos with same contributor = duplicate API calls

### 3. **No Batching Strategy**
- **Problem**: Can't batch multiple user lookups in single request
- **Impact**: GitHub Search API doesn't support batching, but we could batch our processing logic
- **Opportunity**: Group emails and process in chunks with delays

### 4. **No Token Pooling**
- **Problem**: Single token used for all requests
- **Impact**: Limited to one token's rate limit (5000/hour)
- **Opportunity**: Rotate between multiple tokens to increase capacity

### 5. **No Pre-filtering**
- **Problem**: Process all commits even if we already have complete user data
- **Impact**: Unnecessary processing for known contributors
- **Current**: Checks cache/DB but still processes commit even if user exists

### 6. **No Shared Rate Limit State**
- **Problem**: Each worker instance has its own rate limit handler
- **Impact**: Workers can't coordinate, leading to race conditions
- **Example**: Worker A thinks 10 remaining, Worker B also thinks 10 remaining → both proceed → rate limit hit

### 7. **No Job Prioritization**
- **Problem**: All repos processed equally
- **Impact**: Failed/partial repos wait behind new repos
- **Opportunity**: Priority queue for retries

### 8. **Inefficient Refresh Strategy**
- **Problem**: Refresh service processes all incomplete contributors sequentially
- **Impact**: Slow refresh, no prioritization
- **Opportunity**: Batch refresh, prioritize by repository importance

## Proposed Optimizations

### Optimization 1: Batch Processing with Chunking

**Strategy**: Group user lookups into batches, process with controlled delays

```typescript
// Pseudo-code
async function generateLeaderboardOptimized(dbRepository, token) {
  const commits = await git.log();
  const uniqueEmails = new Set(commits.map(c => c.author_email));
  
  // Pre-filter: Get all known users from DB in one query
  const knownUsers = await prisma.contributor.findMany({
    where: { email: { in: Array.from(uniqueEmails) } }
  });
  
  const knownEmailSet = new Set(knownUsers.map(u => u.email));
  const emailsToLookup = Array.from(uniqueEmails).filter(e => !knownEmailSet.has(e));
  
  // Process in batches of 10 with 2-second delay between batches
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 2000;
  
  for (let i = 0; i < emailsToLookup.length; i += BATCH_SIZE) {
    const batch = emailsToLookup.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(email => lookupUser(email, token)));
    
    if (i + BATCH_SIZE < emailsToLookup.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}
```

**Benefits:**
- Reduces API calls by pre-filtering known users
- Controlled rate limiting through batching
- Parallel processing within batches

### Optimization 2: Shared Rate Limit State (Redis)

**Strategy**: Store rate limit state in Redis for coordination across workers

```typescript
class SharedRateLimitHandler {
  private redis: Redis;
  
  async checkAndWait(token: string): Promise<void> {
    const key = `rate_limit:${token}`;
    const state = await this.redis.get(key);
    
    if (state) {
      const { remaining, reset } = JSON.parse(state);
      if (remaining <= 10) {
        const waitTime = reset - Date.now() / 1000 + 5;
        if (waitTime > 0) {
          await sleep(waitTime * 1000);
        }
      }
    }
  }
  
  async updateFromResponse(response: AxiosResponse, token: string): Promise<void> {
    const key = `rate_limit:${token}`;
    const state = {
      remaining: response.headers['x-ratelimit-remaining'],
      reset: response.headers['x-ratelimit-reset'],
      limit: response.headers['x-ratelimit-limit'],
    };
    await this.redis.setex(key, 3600, JSON.stringify(state)); // 1 hour TTL
  }
}
```

**Benefits:**
- Workers coordinate rate limit usage
- Prevents race conditions
- Better utilization of rate limits

### Optimization 3: Token Pooling & Rotation

**Strategy**: Maintain pool of tokens, rotate based on rate limit availability

```typescript
class TokenPool {
  private tokens: string[];
  private rateLimitStates: Map<string, RateLimitState>;
  
  async getAvailableToken(): Promise<string | null> {
    // Find token with highest remaining requests
    const available = this.tokens
      .map(token => ({
        token,
        state: this.rateLimitStates.get(token)
      }))
      .filter(t => t.state && t.state.remaining > 10)
      .sort((a, b) => b.state!.remaining - a.state!.remaining);
    
    return available[0]?.token || null;
  }
  
  async rotateToken(): Promise<string | null> {
    // If current token exhausted, switch to next available
    return this.getAvailableToken();
  }
}
```

**Benefits:**
- Scales rate limit capacity (5000/hour × N tokens)
- Automatic failover when token exhausted
- Better throughput

### Optimization 4: Request Deduplication Cache

**Strategy**: Use Redis to track in-flight requests, prevent duplicates

```typescript
class DeduplicationCache {
  private redis: Redis;
  
  async acquireLock(email: string, ttl: number = 60): Promise<boolean> {
    const key = `lookup:${email}`;
    const result = await this.redis.set(key, '1', 'EX', ttl, 'NX');
    return result === 'OK';
  }
  
  async releaseLock(email: string): Promise<void> {
    await this.redis.del(`lookup:${email}`);
  }
  
  async getCachedResult(email: string): Promise<any | null> {
    const key = `result:${email}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  async setCachedResult(email: string, result: any, ttl: number = 3600): Promise<void> {
    const key = `result:${email}`;
    await this.redis.setex(key, ttl, JSON.stringify(result));
  }
}
```

**Benefits:**
- Prevents duplicate API calls
- Short-term caching of API results
- Reduces rate limit consumption

### Optimization 5: Two-Phase Processing

**Strategy**: Phase 1: Process commits without API calls, Phase 2: Batch API lookups

```typescript
async function generateLeaderboardTwoPhase(dbRepository, token) {
  // Phase 1: Process all commits, collect unknown emails
  const commits = await git.log();
  const emailToCommits = new Map();
  
  for (const commit of commits.all) {
    if (!commit.author_email) continue;
    
    const user = await getDbUserFromCacheOrDB(commit.author_email);
    if (user && user.username && user.profileUrl) {
      // Known user, count commits immediately
      incrementCommitCount(user.id);
    } else {
      // Unknown user, collect for Phase 2
      const emails = emailToCommits.get(commit.author_email) || [];
      emails.push(commit);
      emailToCommits.set(commit.author_email, emails);
    }
  }
  
  // Phase 2: Batch lookup unknown users
  const unknownEmails = Array.from(emailToCommits.keys());
  await batchLookupUsers(unknownEmails, token);
  
  // Phase 3: Process remaining commits with newly fetched users
  for (const [email, commits] of emailToCommits) {
    const user = await getDbUser(email);
    for (const commit of commits) {
      incrementCommitCount(user.id);
    }
  }
}
```

**Benefits:**
- Separates fast operations (DB lookups) from slow operations (API calls)
- Better error handling (can retry Phase 2 independently)
- More predictable processing time

### Optimization 6: Smart Caching Strategy

**Strategy**: Multi-level caching with intelligent invalidation

```typescript
class UserCache {
  private memoryCache: Map<string, CachedUser>; // L1: In-memory
  private redisCache: Redis; // L2: Redis
  private db: PrismaClient; // L3: Database
  
  async getUser(email: string): Promise<User | null> {
    // L1: Check memory cache
    const memCached = this.memoryCache.get(email);
    if (memCached && !this.isStale(memCached)) {
      return memCached.user;
    }
    
    // L2: Check Redis cache
    const redisCached = await this.redisCache.get(`user:${email}`);
    if (redisCached) {
      const user = JSON.parse(redisCached);
      this.memoryCache.set(email, { user, timestamp: Date.now() });
      return user;
    }
    
    // L3: Check database
    const dbUser = await this.db.contributor.findFirst({ where: { email } });
    if (dbUser) {
      await this.redisCache.setex(`user:${email}`, 3600, JSON.stringify(dbUser));
      this.memoryCache.set(email, { user: dbUser, timestamp: Date.now() });
      return dbUser;
    }
    
    return null;
  }
  
  private isStale(cached: CachedUser): boolean {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    return Date.now() - cached.timestamp > TWENTY_FOUR_HOURS;
  }
}
```

**Benefits:**
- Reduces database queries
- Faster lookups
- Shared cache across workers (Redis)

### Optimization 7: Job Prioritization

**Strategy**: Use Bull's priority feature for retries and partial repos

```typescript
// High priority for retries
await repoQueue.add(
  { dbRepository, token },
  { 
    priority: dbRepository.state === 'failed' ? 10 : 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000 // Start with 1 minute
    }
  }
);
```

**Benefits:**
- Failed repos retry faster
- Better user experience for retries
- Exponential backoff prevents hammering

### Optimization 8: Incremental Processing

**Strategy**: Process commits incrementally, save progress

```typescript
async function generateLeaderboardIncremental(dbRepository, token) {
  const lastProcessedCommit = dbRepository.lastProcessedCommit || null;
  const commits = await git.log({ 
    from: lastProcessedCommit,
    maxCount: 1000 // Process in chunks
  });
  
  // Process chunk
  await processCommits(commits, token);
  
  // Save progress
  await prisma.repository.update({
    where: { id: dbRepository.id },
    data: { 
      lastProcessedCommit: commits[0]?.hash,
      processingProgress: commits.length
    }
  });
  
  // If more commits, re-queue job
  if (commits.length === 1000) {
    await repoQueue.add({ dbRepository, token }, { priority: 1 });
  }
}
```

**Benefits:**
- Handles very large repos without timeout
- Can resume after rate limit hit
- Better progress tracking

## Recommended Implementation Priority

### Phase 1: Quick Wins (Low effort, High impact)
1. **Batch Processing with Chunking** - Reduces API calls, better rate limit management
2. **Pre-filtering Known Users** - Single DB query instead of N queries
3. **Request Deduplication** - Prevents duplicate API calls

### Phase 2: Infrastructure (Medium effort, High impact)
4. **Shared Rate Limit State** - Critical for multi-worker deployments
5. **Smart Caching Strategy** - Reduces DB load, faster lookups
6. **Job Prioritization** - Better UX for retries

### Phase 3: Advanced (High effort, High impact)
7. **Token Pooling** - Scales rate limit capacity
8. **Two-Phase Processing** - Better separation of concerns
9. **Incremental Processing** - Handles very large repos

## Implementation Considerations

### Redis Requirements
- Need Redis for shared state, deduplication, caching
- Consider Redis memory usage for caching
- Set appropriate TTLs to prevent memory bloat

### Token Management
- Need secure storage for multiple tokens
- Consider token rotation policies
- Monitor token usage and rate limits

### Monitoring
- Track API call counts per token
- Monitor rate limit exhaustion
- Alert on repeated failures
- Track processing times and bottlenecks

### Backward Compatibility
- Ensure optimizations don't break existing functionality
- Gradual rollout with feature flags
- Maintain fallback to current implementation

