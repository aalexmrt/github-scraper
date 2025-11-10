# Repository Size Limit Implementation Plan

## Overview

This document outlines the implementation of repository size limits using **GitHub API checks as the primary method**, with fallback to post-clone size checking. This prevents processing extremely large repositories that could:
- Exceed Cloud Run memory/disk limits
- Consume excessive free tier resources
- Cause timeouts or failures
- Impact other concurrent jobs

## Current Architecture Analysis

### Repository Processing Flow
```
1. syncRepository() → cloneFromGit() or fetchUpdates()
2. processCommits() → git.log() → process all commits
3. Store commit data → enqueue user jobs
```

### Storage Adapters
- **FilesystemStorageAdapter**: Clones to `/data/repos/{pathName}` (bare repo)
- **R2StorageAdapter**: Clones to `/tmp/repos/{pathName}`, then compresses/uploads

### Current Constraints
- Cloud Run: 512Mi memory limit (configurable)
- Cloud Run: 8GB disk limit (ephemeral)
- R2: No explicit size limit, but costs scale with storage
- Processing time: 10-minute timeout per job

## Size Limit Strategies

### Strategy 1: GitHub API Check First (PRIMARY METHOD) ⭐⭐⭐

**How it works:**
- Check repository size via GitHub API before cloning
- If exceeds limit, reject immediately without cloning
- Falls back to clone-then-check if API unavailable

**Implementation Points:**
- Use `GET /repos/{owner}/{repo}` endpoint
- Check `size` field (in KB)
- Reject before cloning if exceeds limit

**Pros:**
- ✅ **Cheapest**: No bandwidth wasted on oversized repos
- ✅ **Fastest**: Immediate feedback (~50-200ms)
- ✅ **Best UX**: Users know immediately if repo is too large
- ✅ **Saves resources**: Don't download oversized repos
- ✅ **Within rate limits**: 5,000/hour is plenty

**Cons:**
- ❌ Requires GitHub token (but falls back if unavailable)
- ❌ API might be unavailable (but has fallback)

**Status**: ✅ **IMPLEMENTED** - Primary method

---

### Strategy 2: Post-Clone Size Check (FALLBACK) ⭐

**How it works:**
- Clone repository normally
- After clone completes, check disk size
- If exceeds limit, delete repo and mark as failed with clear error

**Implementation Points:**
- Add `getSize()` method to `StorageAdapter` interface
- Check size in `syncRepository()` after clone/fetch
- Store size in database for future reference

**Pros:**
- ✅ Simple to implement
- ✅ Works with both storage adapters
- ✅ Accurate (actual disk usage)
- ✅ No API calls needed
- ✅ Can check existing repos before processing

**Cons:**
- ❌ Wastes bandwidth/time if repo is too large
- ❌ May hit disk limits before check completes

**Size Limits Recommended:**
- **Disk size**: 250MB (bare repo) - prevents disk exhaustion
- **Commit count**: 2,500 commits - prevents processing timeout
- **Compressed size (R2)**: 200MB - reasonable storage cost

---

### Strategy 2: Monitor During Clone (Early Abort)

**How it works:**
- Monitor disk usage during `git clone` operation
- Abort clone if size exceeds threshold during download
- Use `du` command or filesystem watcher

**Implementation Points:**
- Wrap `git.clone()` in monitoring function
- Check size every N seconds during clone
- Kill git process if limit exceeded

**Pros:**
- ✅ Saves bandwidth/time for oversized repos
- ✅ Prevents disk exhaustion
- ✅ Fails fast

**Cons:**
- ❌ More complex implementation
- ❌ Requires process monitoring
- ❌ May not catch all cases (git clone is atomic)
- ❌ Harder with R2 adapter (downloads happen in background)

**Complexity:** Medium-High

---

### Strategy 3: Commit Count Limit (Processing Time Protection)

**How it works:**
- After clone, check commit count before processing
- Use `git rev-list --count` to get total commits
- Skip processing if exceeds limit

**Implementation Points:**
- Add `getCommitCount()` helper function
- Check in `processCommits()` before `git.log()`
- Store commit count in database

**Pros:**
- ✅ Prevents processing timeouts
- ✅ Very fast check (git command)
- ✅ No API needed
- ✅ Can be combined with size check

**Cons:**
- ❌ Still clones large repos
- ❌ Commit count doesn't directly correlate with size

**Recommended Limit:**
- **2,500 commits** - reasonable processing time (~2-3 minutes)

---

### Strategy 4: Shallow Clone with Depth Limit

**How it works:**
- Use `git clone --depth=N` to limit history
- Process only recent commits
- Trade-off: incomplete data vs. size control

**Implementation Points:**
- Modify `cloneFromGit()` to accept depth parameter
- Add `MAX_CLONE_DEPTH` environment variable
- Update `fetchUpdates()` to handle shallow repos

**Pros:**
- ✅ Guaranteed size limit
- ✅ Faster clones
- ✅ Less storage usage

**Cons:**
- ❌ **Incomplete data** - only recent commits
- ❌ May not meet user expectations
- ❌ Harder to update shallow repos

**Recommendation:** ❌ **NOT RECOMMENDED** - violates user expectations

---

### Strategy 5: Hybrid Approach (BEST) ⭐⭐⭐

**Combine multiple strategies for comprehensive protection:**

1. **Pre-check existing repos**: If repo exists, check size before processing
2. **Post-clone size check**: After clone, verify disk size
3. **Commit count check**: Before processing commits, verify count
4. **Processing limits**: Limit commits processed if needed

**Implementation Flow:**
```
syncRepository():
  ├─ If repo exists → checkSize() → if too large → fail
  ├─ Clone repo
  ├─ checkSize() → if too large → delete & fail
  └─ getCommitCount() → if too many → delete & fail

processCommits():
  ├─ getCommitCount() → if too many → fail early
  └─ Process commits (with optional limit)
```

---

## Recommended Implementation Plan

### Phase 1: Core Size Checking (Priority: HIGH)

**1. Add size checking to StorageAdapter interface**
```typescript
interface StorageAdapter {
  // ... existing methods
  getSize(repoPath: string): Promise<number>; // Returns size in bytes
  getCommitCount(repoPath: string): Promise<number>; // Returns total commits
}
```

**2. Implement size checks in adapters**
- Filesystem: Use `du -sb` or Node.js `fs.statSync`
- R2: Check compressed file size before download

**3. Add size validation in syncRepository()**
- Check after clone/fetch
- Delete repo if exceeds limit
- Update repository state to 'failed' with error message

**4. Add commit count check in processCommits()**
- Check before processing
- Fail early if exceeds limit

### Phase 2: Configuration & Limits

**Environment Variables:**
```bash
MAX_REPO_SIZE_MB=250          # Maximum repo disk size (MB)
MAX_COMMIT_COUNT=2500         # Maximum commits to process
MAX_COMPRESSED_SIZE_MB=200     # Maximum compressed size (R2)
```

**Database Schema Addition:**
```prisma
model Repository {
  // ... existing fields
  repoSizeBytes      Int?     // Actual repo size
  commitCount        Int?     // Total commits (from git)
  sizeLimitExceeded  Boolean  @default(false)
}
```

### Phase 3: Error Handling & User Feedback

**Error Messages:**
- `Repository too large (X MB exceeds limit of Y MB)`
- `Repository has too many commits (X exceeds limit of Y)`
- `Repository size check failed: {reason}`

**User Experience:**
- Clear error messages in API response
- Repository marked as 'failed' with reason
- Option to retry with different limits (future)

### Phase 4: Monitoring & Logging

**Metrics to Track:**
- Repos rejected due to size
- Average repo sizes processed
- Commit count distribution
- Size check performance impact

**Logging:**
- Log size checks (info level)
- Log rejections (warn level)
- Log size statistics (debug level)

---

## Implementation Details

### Size Check Implementation

**FilesystemStorageAdapter:**
```typescript
async getSize(repoPath: string): Promise<number> {
  const fullPath = path.join(this.basePath, repoPath);
  return await this.calculateDirectorySize(fullPath);
}

private async calculateDirectorySize(dirPath: string): Promise<number> {
  // Use du command or recursive fs.statSync
  // Return size in bytes
}
```

**R2StorageAdapter:**
```typescript
async getSize(repoPath: string): Promise<number> {
  const key = this.getR2Key(repoPath);
  const response = await this.s3Client.send(
    new HeadObjectCommand({ Bucket: this.bucketName, Key: key })
  );
  return response.ContentLength || 0;
}
```

### Commit Count Check

```typescript
async getCommitCount(repoPath: string): Promise<number> {
  const localPath = await this.getLocalPath(repoPath);
  const git = simpleGit(localPath);
  const count = await git.raw(['rev-list', '--count', '--all']);
  return parseInt(count.trim(), 10);
}
```

### Validation Logic

```typescript
const MAX_REPO_SIZE_BYTES = (process.env.MAX_REPO_SIZE_MB || 250) * 1024 * 1024;
const MAX_COMMIT_COUNT = parseInt(process.env.MAX_COMMIT_COUNT || '2500', 10);

// In syncRepository()
const repoSize = await storage.getSize(repoPath);
if (repoSize > MAX_REPO_SIZE_BYTES) {
  await storage.delete(repoPath);
  throw new Error(
    `Repository too large: ${(repoSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${MAX_REPO_SIZE_MB}MB`
  );
}

// In processCommits()
const commitCount = await getCommitCount(repoPath);
if (commitCount > MAX_COMMIT_COUNT) {
  throw new Error(
    `Repository has too many commits: ${commitCount} exceeds limit of ${MAX_COMMIT_COUNT}`
  );
}
```

---

## Edge Cases & Considerations

### 1. Existing Repositories
- **Problem**: Repos already cloned may exceed new limits
- **Solution**: Check size before processing existing repos
- **Action**: Add size check in `syncRepository()` for existing repos

### 2. Incremental Updates (fetch)
- **Problem**: `git fetch` may push repo over limit
- **Solution**: Check size after fetch, delete if exceeded
- **Action**: Size check after `fetchUpdates()`

### 3. R2 Storage
- **Problem**: Compressed size vs. uncompressed size
- **Solution**: Check compressed size before download, uncompressed after extraction
- **Action**: Two-stage check for R2 adapter

### 4. Concurrent Processing
- **Problem**: Multiple repos processing simultaneously
- **Solution**: Size limits apply per-repo, not cumulative
- **Action**: Each repo checked independently

### 5. Partial Failures
- **Problem**: Size check passes but processing fails later
- **Solution**: Clean up repo on failure, mark as failed
- **Action**: Error handling in commitWorker

### 6. User Experience
- **Problem**: Users don't know why repo was rejected
- **Solution**: Clear error messages, store reason in database
- **Action**: Enhanced error messages, database fields

---

## Testing Strategy

### Unit Tests
- Test size calculation functions
- Test commit count retrieval
- Test size limit validation logic

### Integration Tests
- Test with small repo (< limit)
- Test with large repo (> limit)
- Test with repo at exact limit
- Test existing repo that exceeds limit

### Performance Tests
- Measure size check overhead
- Test with various repo sizes
- Test concurrent size checks

---

## Recommended Limits (Default Values)

| Limit Type | Default Value | Rationale |
|------------|---------------|-----------|
| **Max Repo Size** | 250 MB | Prevents disk exhaustion, reasonable for most repos |
| **Max Commit Count** | 2,500 | Prevents processing timeout (~2-3 min processing) |
| **Max Compressed Size (R2)** | 200 MB | Reasonable storage cost, bare repos compress well |

**Note**: These limits are configurable via environment variables for flexibility.

---

## Migration Plan

### Step 1: Add Size Checking (Non-Breaking)
- Add methods to StorageAdapter interface
- Implement in both adapters
- Add size checks but don't enforce limits yet
- Log sizes for analysis

### Step 2: Enable Limits (Breaking)
- Add environment variables
- Enable size validation
- Update error handling
- Monitor rejections

### Step 3: Database Migration
- Add size/commit count fields
- Backfill existing repos (optional)
- Add indexes for queries

### Step 4: Monitoring & Optimization
- Monitor rejection rates
- Adjust limits based on data
- Optimize size check performance

---

## Success Criteria

✅ Repos exceeding limits are rejected before processing  
✅ Clear error messages for users  
✅ No impact on valid repos  
✅ Size checks complete in < 5 seconds  
✅ No GitHub API calls required  
✅ Works with both storage adapters  
✅ Handles edge cases gracefully  

---

## Future Enhancements

1. **Dynamic Limits**: Adjust limits based on queue depth
2. **User Override**: Allow users to request higher limits
3. **Size Analytics**: Dashboard showing repo size distribution
4. **Progressive Processing**: Process commits in chunks for large repos
5. **Size Estimation**: Estimate size before clone (if possible)

---

## Questions to Answer Before Implementation

1. **Should we allow users to override limits?** → Probably not initially
2. **What happens to repos already processed that exceed limits?** → Leave as-is, only check new ones
3. **Should we store size for analytics?** → Yes, useful for monitoring
4. **Do we need different limits for different storage adapters?** → Probably not, use same limits
5. **Should limits be per-repo or cumulative?** → Per-repo (current plan)

---

## Conclusion

**Recommended Approach: Hybrid Strategy (Strategy 5)**

- ✅ Post-clone size check (primary protection)
- ✅ Commit count check (processing time protection)
- ✅ Pre-check existing repos (efficiency)
- ✅ Clear error messages (user experience)
- ✅ Configurable limits (flexibility)

This approach provides comprehensive protection without GitHub API calls, maintains good user experience, and is straightforward to implement.

