# Docker Image Cleanup Strategy

## Overview

This plan outlines a strategy to automatically clean up old Docker images in GCP Artifact Registry, keeping only the **last 3 versions** per service to manage storage costs while maintaining rollback capability.

## Goals

- ✅ **Keep last 3 versions** per service (api, commit-worker, user-worker)
- ✅ **Always keep `latest` tag** (for convenience)
- ✅ **Never delete currently deployed images** (safety)
- ✅ **Automated cleanup** after new image builds
- ✅ **Manual cleanup option** for maintenance
- ✅ **Dry-run mode** for testing

## Image Naming Convention

**Current Format**:
```
${REGION}-docker.pkg.dev/${PROJECT_ID}/github-scraper/${SERVICE}:${VERSION}
```

**Examples**:
- `us-east1-docker.pkg.dev/personal-gcp-477623/github-scraper/api:1.2.3`
- `us-east1-docker.pkg.dev/personal-gcp-477623/github-scraper/api:latest`
- `us-east1-docker.pkg.dev/personal-gcp-477623/github-scraper/commit-worker:1.5.0`

**Services**: `api`, `commit-worker`, `user-worker`

## Cleanup Strategy

### What to Keep

1. **Last 3 semantic versions** per service (sorted by version number)
2. **`latest` tag** (always kept)
3. **Currently deployed version** (safety check)

### What to Delete

- All versions older than the last 3 (per service)
- Exception: Never delete currently deployed version (even if older than 3)

### Version Sorting Logic

Versions are semantic (MAJOR.MINOR.PATCH), so we need proper sorting:
- `1.0.0` < `1.0.1` < `1.1.0` < `1.2.3` < `2.0.0`
- Use semantic version comparison, not string comparison

## Implementation Options

### Option A: Cleanup Script in Build Workflow (Recommended)

**When**: After successfully pushing new image

**Pros**:
- ✅ Automatic cleanup after each build
- ✅ No separate workflow needed
- ✅ Keeps registry clean continuously

**Cons**:
- ⚠️ Runs on every build (but fast)
- ⚠️ Need to check currently deployed version

**Implementation**:
- Add cleanup step to `.github/workflows/build-and-push.yml`
- Run cleanup script after image push
- Cleanup only affects the service that was just built

### Option B: Scheduled Cleanup Workflow

**When**: Run periodically (e.g., daily or weekly)

**Pros**:
- ✅ Runs independently of builds
- ✅ Can clean up all services at once
- ✅ More predictable cleanup schedule

**Cons**:
- ⚠️ Requires separate workflow
- ⚠️ May accumulate images between runs

**Implementation**:
- Create `.github/workflows/cleanup-images.yml`
- Trigger on schedule (cron)
- Cleanup all services

### Option C: Manual Cleanup Script

**When**: Run manually when needed

**Pros**:
- ✅ Full control
- ✅ Can run with dry-run first
- ✅ Good for initial testing

**Cons**:
- ❌ Requires manual intervention
- ❌ Easy to forget

**Implementation**:
- Create `scripts/utils/cleanup-old-images.sh`
- Can be run manually or via GitHub Actions

## Recommended Approach: Hybrid (Option A + Option C)

**Primary**: Option A - Automatic cleanup after build
**Fallback**: Option C - Manual cleanup script for maintenance

This gives us:
- ✅ Automatic cleanup (no manual work)
- ✅ Manual option for emergencies or bulk cleanup
- ✅ Safety through dry-run capability

## Implementation Details

### Cleanup Script Logic

```bash
#!/bin/bash
# cleanup-old-images.sh

# For each service:
# 1. List all images (excluding 'latest')
# 2. Sort by semantic version (newest first)
# 3. Get currently deployed version from Cloud Run
# 4. Keep: latest 3 + currently deployed + latest tag
# 5. Delete: everything else
```

### Safety Checks

1. **Never delete `latest` tag**
2. **Never delete currently deployed version**
3. **Always keep at least 3 versions** (even if older)
4. **Dry-run mode** by default (require `--execute` flag)
5. **Confirmation prompt** before deletion

### Getting Currently Deployed Version

```bash
# For API service
gcloud run services describe api \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format='value(spec.template.spec.containers[0].image)' \
  | grep -oP ':\K[^:]+$'  # Extract version from image URL

# For worker jobs
gcloud run jobs describe ${SERVICE} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format='value(spec.template.spec.containers[0].image)' \
  | grep -oP ':\K[^:]+$'
```

## Script Structure

### Location

**Main repo**: `scripts/utils/cleanup-old-images.sh` (for manual use)
**Infra repo**: `scripts/utils/cleanup-old-images.sh` (for deployment context)

### Usage

```bash
# Dry-run (default - shows what would be deleted)
./scripts/utils/cleanup-old-images.sh api

# Execute cleanup for specific service
./scripts/utils/cleanup-old-images.sh api --execute

# Cleanup all services
./scripts/utils/cleanup-old-images.sh --all --execute

# Dry-run for all services
./scripts/utils/cleanup-old-images.sh --all
```

## Integration with Build Workflow

### Add to `.github/workflows/build-and-push.yml`

```yaml
- name: Cleanup old images
  if: success()  # Only run if build succeeded
  run: |
    # Run cleanup script for the service that was just built
    ./scripts/utils/cleanup-old-images.sh ${{ steps.extract.outputs.SERVICE }} --execute
  env:
    PROJECT_ID: ${{ secrets.PROJECT_ID }}
    REGION: ${{ secrets.GCP_REGION }}
    REPOSITORY: github-scraper
```

## Cost Impact

### Storage Costs (GCP Artifact Registry)

- **Free tier**: 0.5 GB storage
- **After free tier**: $0.10 per GB per month

### Example Calculation

**Assumptions**:
- Average image size: ~200 MB
- 3 services × 3 versions = 9 images
- Plus `latest` tags = 12 images total

**Storage**: 12 images × 200 MB = 2.4 GB

**Cost**: 
- First 0.5 GB: Free
- Remaining 1.9 GB: $0.19/month

**With cleanup** (keeping only 3 versions):
- Storage: ~2.4 GB
- Cost: ~$0.19/month

**Without cleanup** (keeping all versions):
- After 10 versions per service: 30 images = 6 GB
- Cost: ~$0.55/month
- After 20 versions: 60 images = 12 GB
- Cost: ~$1.15/month

**Savings**: Prevents unbounded growth, saves ~$0.36-0.96/month as versions accumulate

## Edge Cases & Safety

### Edge Case 1: Currently Deployed Version is Old

**Scenario**: Currently deployed version is older than last 3 versions

**Solution**: Always keep currently deployed version, even if it's older than 3

**Example**:
- Versions: 1.0.0, 1.1.0, 1.2.0, 1.2.1, 1.2.2, 1.2.3
- Currently deployed: 1.1.0
- Keep: 1.2.1, 1.2.2, 1.2.3, **1.1.0** (deployed), latest
- Delete: 1.0.0, 1.2.0

### Edge Case 2: Less Than 3 Versions Exist

**Scenario**: Service has fewer than 3 versions

**Solution**: Keep all versions (nothing to delete)

### Edge Case 3: Failed Cleanup

**Scenario**: Cleanup script fails

**Solution**: 
- Script should fail gracefully (don't fail build)
- Log errors but continue
- Use `|| true` or proper error handling

### Edge Case 4: Concurrent Builds

**Scenario**: Multiple services building simultaneously

**Solution**: 
- Cleanup runs per-service (no conflicts)
- Each service cleans up its own images independently

## Rollback Considerations

**Question**: What if we need to rollback to version older than last 3?

**Answer**: 
- If version is older than last 3, it will be deleted
- **Mitigation**: Before rolling back to old version, check if it exists
- If it doesn't exist, you'll need to rebuild from git tag
- **Recommendation**: Keep important versions tagged in git (they can be rebuilt)

**Alternative**: Increase retention to 5 versions if rollback frequency is high

## Monitoring & Alerts

### Metrics to Track

1. **Number of images per service**
2. **Storage usage**
3. **Cleanup execution frequency**
4. **Failed cleanup attempts**

### Alerts

- Alert if storage exceeds threshold (e.g., 5 GB)
- Alert if cleanup fails multiple times
- Alert if number of images grows unexpectedly

## Implementation Steps

### Phase 1: Create Cleanup Script

1. ✅ Create `scripts/utils/cleanup-old-images.sh`
2. ✅ Implement semantic version sorting
3. ✅ Add safety checks (dry-run, deployed version check)
4. ✅ Test with dry-run mode

### Phase 2: Test Script

1. ✅ Test with manual execution
2. ✅ Verify it correctly identifies images to delete
3. ✅ Verify it never deletes deployed version
4. ✅ Test with edge cases

### Phase 3: Integrate with Build Workflow

1. ✅ Add cleanup step to `.github/workflows/build-and-push.yml`
2. ✅ Test with a new tag build
3. ✅ Verify cleanup runs automatically
4. ✅ Monitor for issues

### Phase 4: Documentation

1. ✅ Document cleanup strategy in README
2. ✅ Add usage examples
3. ✅ Document rollback considerations

## Script Implementation Details

### Required Functions

1. **`get_currently_deployed_version(service)`**
   - Query Cloud Run to get deployed version
   - Return version string or empty if not found

2. **`list_image_versions(service)`**
   - List all image versions for service (excluding 'latest')
   - Return sorted list (newest first)

3. **`sort_versions(versions)`**
   - Sort semantic versions properly
   - Handle edge cases (pre-release versions, etc.)

4. **`get_versions_to_keep(versions, deployed_version)`**
   - Determine which versions to keep
   - Return list of versions to keep

5. **`delete_image(service, version)`**
   - Delete specific image version
   - Handle errors gracefully

### Dependencies

- `gcloud` CLI (for querying Cloud Run and Artifact Registry)
- `jq` or similar (for parsing JSON, optional)
- Bash 4+ (for associative arrays, if needed)

## Alternative: GCP Artifact Registry Lifecycle Policies

**GCP Feature**: Artifact Registry supports lifecycle policies

**Pros**:
- ✅ Native GCP feature
- ✅ No custom scripts needed
- ✅ Automatic enforcement

**Cons**:
- ⚠️ Less flexible (can't check deployed versions)
- ⚠️ May delete currently deployed images
- ⚠️ Requires GCP console configuration

**Recommendation**: Use custom script for now (more control), consider lifecycle policies later if needed

## Questions to Resolve

1. **Retention count**: Keep 3 versions? (Adjustable)
2. **Cleanup timing**: After build? Scheduled? Both?
3. **Dry-run default**: Should dry-run be default? (Yes, for safety)
4. **Notification**: Should we notify on cleanup? (Optional)
5. **Logging**: Where to log cleanup actions? (GitHub Actions logs)

## Next Steps

1. **Review this plan** - Confirm approach and retention count
2. **Implement cleanup script** - Create `cleanup-old-images.sh`
3. **Test script** - Dry-run with existing images
4. **Integrate with workflow** - Add to build-and-push.yml
5. **Monitor** - Watch for issues in first few runs

---

## Summary

**Strategy**: Keep last 3 versions per service + latest tag + currently deployed version

**Implementation**: 
- Cleanup script in `scripts/utils/cleanup-old-images.sh`
- Integrated into build workflow (runs after successful image push)
- Manual option available for maintenance

**Safety**:
- Dry-run by default
- Never delete deployed version
- Never delete latest tag
- Always keep at least 3 versions

**Cost Savings**: Prevents unbounded storage growth, saves ~$0.36-0.96/month as versions accumulate


