# Repository Size Limits Testing Guide

## 🧪 Complete Testing Checklist

### Prerequisites

1. ✅ **Deployment Complete**: Commit worker is deployed with new limits
2. ✅ **Environment Variables Set**: `MAX_REPO_SIZE_MB=250`, `MAX_COMMIT_COUNT=2500`
3. ✅ **GitHub Token Available**: For API size checks

---

## Test 1: Verify Configuration ✅

**Goal**: Confirm limits are properly configured

```bash
# Check environment variables in Cloud Run Job
PROJECT_ID=your-project-id
gcloud run jobs describe commit-worker \
  --region=us-east1 \
  --project=${PROJECT_ID} \
  --format="value(spec.template.spec.containers[0].env)" | grep -E "MAX_REPO_SIZE_MB|MAX_COMMIT_COUNT"
```

**Expected Output**:
```
MAX_REPO_SIZE_MB=250
MAX_COMMIT_COUNT=2500
```

---

## Test 2: Normal Repository (Should Pass) ✅

**Goal**: Verify normal-sized repos process successfully

### Option A: Via Frontend
1. Go to your frontend URL
2. Submit a small repository (e.g., `https://github.com/aalexmrt/github-scraper`)
3. Watch for success message

### Option B: Via API
```bash
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
```

**Expected Behavior**:
- ✅ Repository accepted
- ✅ Processing starts
- ✅ Completes successfully

**Check Logs**:
```bash
./view-prod-logs.sh commit-worker | grep -E "size check|validated|cloned successfully"
```

**Expected Log Messages**:
```
[REPO_SERVICE] Repository owner/repo size: X.XXMB (from API)
[REPO_SERVICE] Repository size check passed via API: X.XXMB
[REPO_SERVICE] Repository validated: X.XXMB, X commits
```

---

## Test 3: Oversized Repository (Should Reject via API) ❌

**Goal**: Verify repos > 250MB are rejected immediately via GitHub API

### Find a Large Repository
You can use GitHub's search to find large repos, or use known large repos like:
- `https://github.com/torvalds/linux` (very large)
- `https://github.com/microsoft/vscode` (large)

### Submit via API
```bash
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/torvalds/linux"
```

**Expected Behavior**:
- ❌ Repository rejected immediately
- ❌ No cloning occurs
- ❌ Error message returned

**Check Logs**:
```bash
./view-prod-logs.sh commit-worker | grep -i "too large"
```

**Expected Log Messages**:
```
[REPO_SERVICE] Repository owner/repo size: XXX.XXMB (from API)
[REPO_SERVICE] Repository too large: XXX.XXMB exceeds limit of 250MB
```

**Check Repository State**:
```bash
./debug-commit-worker.sh repos | grep -i "failed\|too large"
```

**Expected Error Message** (in API response):
```json
{
  "error": "Repository too large: XXX.XXMB exceeds limit of 250MB"
}
```

---

## Test 4: Repository with Too Many Commits ❌

**Goal**: Verify repos with > 2,500 commits are rejected

### Find a Repository with Many Commits
You can check commit count via GitHub API:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.github.com/repos/torvalds/linux" | jq '.size, .default_branch'
```

Or use known repos with many commits:
- `https://github.com/torvalds/linux` (100k+ commits)
- `https://github.com/microsoft/vscode` (50k+ commits)

### Submit via API
```bash
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/torvalds/linux"
```

**Expected Behavior**:
- If size check passes but commits > 2,500: Rejected after clone
- Repository deleted automatically
- Error message returned

**Check Logs**:
```bash
./view-prod-logs.sh commit-worker | grep -i "too many commits"
```

**Expected Log Messages**:
```
[REPO_SERVICE] Repository validated: X.XXMB, XXXX commits
[REPO_SERVICE] Repository has too many commits: XXXX exceeds limit of 2,500
```

**Expected Error Message**:
```json
{
  "error": "Repository has too many commits: XXXX exceeds limit of 2,500"
}
```

---

## Test 5: API Fallback (No Token) 🔄

**Goal**: Verify fallback works when GitHub API unavailable

### Test Without Token
Temporarily remove or invalidate GitHub token, then submit a repo:

```bash
# Submit repo (will fallback to post-clone check)
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/some/repo"
```

**Expected Behavior**:
- ⚠️ API check skipped (no token)
- ✅ Clone proceeds
- ✅ Post-clone validation runs
- ✅ Rejects if exceeds limits

**Check Logs**:
```bash
./view-prod-logs.sh commit-worker | grep -E "API.*unavailable|fallback|will check after clone"
```

**Expected Log Messages**:
```
[REPO_SERVICE] No token available for API size check
[REPO_SERVICE] API size check unavailable, will check after clone
[REPO_SERVICE] Cloning repository...
[REPO_SERVICE] Repository validated: X.XXMB, X commits
```

---

## Test 6: Existing Repository Updates 🔄

**Goal**: Verify size checks work for existing repos during updates

### Steps
1. Submit a normal repo (should pass)
2. Wait for it to complete
3. Trigger a refresh/update
4. Verify size check runs again

**Check Logs**:
```bash
./view-prod-logs.sh commit-worker | grep -E "already exists|fetching updates|validated"
```

**Expected Log Messages**:
```
[REPO_SERVICE] Repository already exists, fetching updates...
[REPO_SERVICE] Repository validated: X.XXMB, X commits
```

---

## Test 7: Monitor Queue and Processing 📊

**Goal**: Verify parallel batch processing works with size limits

### Check Queue Status
```bash
./debug-commit-worker.sh queue
```

### Check Repository States
```bash
./debug-commit-worker.sh repos
```

### Trigger Worker Manually
```bash
./debug-commit-worker.sh trigger
```

### Monitor Real-time Logs
```bash
./view-prod-logs.sh commit-worker --tail
```

**What to Look For**:
- ✅ Size checks happening before cloning
- ✅ Parallel processing of multiple repos
- ✅ Clear error messages for rejected repos
- ✅ Successful processing for valid repos

---

## Test 8: Error Message Verification 📝

**Goal**: Verify users see clear error messages

### Test Cases

1. **Oversized Repo**:
   ```bash
   curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/large/repo"
   ```
   **Expected**: `Repository too large: XXX.XXMB exceeds limit of 250MB`

2. **Too Many Commits**:
   ```bash
   curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/many-commits/repo"
   ```
   **Expected**: `Repository has too many commits: XXXX exceeds limit of 2,500`

3. **Normal Repo**:
   ```bash
   curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/small/repo"
   ```
   **Expected**: `Repository is being processed.` or `Repository processed successfully.`

---

## Test 9: Performance Verification ⚡

**Goal**: Verify size checks don't slow down processing

### Measure API Check Time
```bash
# Submit repo and watch logs
./view-prod-logs.sh commit-worker --tail | grep -E "size check|cloning"
```

**Expected**:
- API check: < 1 second
- Clone (if needed): 2-5 minutes
- Total processing: Similar to before (size checks are fast)

---

## Test 10: Edge Cases 🔍

### Test Invalid URLs
```bash
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=not-a-url"
```
**Expected**: `Invalid GitHub repository URL.`

### Test Non-Existent Repos
```bash
curl -X POST "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/nonexistent/repo"
```
**Expected**: `Repository not found: https://github.com/nonexistent/repo`

### Test Private Repos (with token)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-api-url.run.app/leaderboard?repoUrl=https://github.com/private/repo"
```
**Expected**: Size check works with token, processes if within limits

---

## Quick Test Script 🚀

Create a test script to run all tests:

```bash
#!/bin/bash
# Quick test script for size limits

API_URL="https://your-api-url.run.app"
PROJECT_ID="your-project-id"

echo "🧪 Testing Repository Size Limits"
echo "=================================="
echo ""

# Test 1: Normal repo
echo "Test 1: Normal repository..."
curl -X POST "${API_URL}/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
echo ""
sleep 5

# Test 2: Large repo (should reject)
echo "Test 2: Large repository (should reject)..."
curl -X POST "${API_URL}/leaderboard?repoUrl=https://github.com/torvalds/linux"
echo ""
sleep 5

# Check logs
echo "📋 Checking logs..."
./view-prod-logs.sh commit-worker | tail -20

# Check repository states
echo ""
echo "📊 Repository states:"
./debug-commit-worker.sh repos
```

---

## Monitoring Commands 📊

### View All Size-Related Logs
```bash
./view-prod-logs.sh commit-worker | grep -E "size|limit|too large|too many commits"
```

### View Error Logs Only
```bash
./debug-commit-worker.sh errors
```

### Check Failed Repositories
```bash
./debug-commit-worker.sh repos | grep -i "failed"
```

### Monitor Real-time
```bash
./view-prod-logs.sh commit-worker --tail | grep -E "REPO_SERVICE|size|limit"
```

---

## Success Criteria ✅

All tests pass if:

- ✅ Normal repos process successfully
- ✅ Oversized repos rejected immediately (via API)
- ✅ Repos with too many commits rejected
- ✅ Clear error messages shown to users
- ✅ Fallback works when API unavailable
- ✅ Existing repos validated on update
- ✅ No performance degradation
- ✅ Logs show size checks happening

---

## Troubleshooting 🔧

### Issue: Size checks not happening
**Check**: Environment variables are set
```bash
gcloud run jobs describe commit-worker --format="value(spec.template.spec.containers[0].env)"
```

### Issue: API checks failing
**Check**: GitHub token is valid
```bash
gcloud secrets versions access latest --secret="github-token" --project=${PROJECT_ID}
```

### Issue: Repos not being rejected
**Check**: Limits are correct
- Verify `MAX_REPO_SIZE_MB=250`
- Verify `MAX_COMMIT_COUNT=2500`

### Issue: Error messages not clear
**Check**: Logs for error format
```bash
./view-prod-logs.sh commit-worker | grep -i "error\|too large\|too many"
```

---

## Next Steps After Testing 🎯

1. ✅ **Document Results**: Note which tests passed/failed
2. ✅ **Adjust Limits**: If needed, update `MAX_REPO_SIZE_MB` or `MAX_COMMIT_COUNT`
3. ✅ **Monitor Production**: Watch for rejected repos in production
4. ✅ **Optimize**: Fine-tune limits based on actual usage patterns



