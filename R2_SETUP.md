# Cloudflare R2 Setup Guide

## Overview

This guide explains how to set up Cloudflare R2 for production storage while keeping Docker volumes for local development.

---

## Architecture

- **Local Development**: Uses Docker volumes (`/data/repos`) - no changes needed
- **Production**: Uses Cloudflare R2 - repositories stored as tar.gz archives

The storage adapter automatically switches based on the `USE_R2_STORAGE` environment variable.

---

## Step 1: Create Cloudflare R2 Bucket

1. **Sign up/Login** to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Go to R2** → "Create bucket"
3. **Name your bucket** (e.g., `github-repos`)
4. **Choose location** (closest to your Railway deployment)
5. **Create bucket**

---

## Step 2: Generate API Tokens

1. **Go to R2** → "Manage R2 API Tokens"
2. **Create API Token**:
   - **Token name**: `github-scraper-production`
   - **Permissions**: Object Read & Write
   - **TTL**: No expiration (or set expiration date)
3. **Copy credentials**:
   - **Account ID** (found in R2 dashboard URL or sidebar)
   - **Access Key ID**
   - **Secret Access Key**

---

## Step 3: Configure Environment Variables

### For Production (Railway)

Add these environment variables to your Railway backend and worker services:

```env
# Enable R2 storage
USE_R2_STORAGE=true

# R2 Configuration
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=github-repos
```

### For Local Development (Docker Compose)

**Don't set `USE_R2_STORAGE`** or set it to `false`:

```env
# Use filesystem storage (Docker volume)
USE_R2_STORAGE=false

# Or simply omit USE_R2_STORAGE (defaults to false)
```

---

## Step 4: Update Docker Compose (Local)

No changes needed! Local development continues to use Docker volumes.

Your `docker-compose.yml` already has:
```yaml
volumes:
  repo_volume:/data/repos
```

This will continue to work for local development.

---

## Step 5: Update Railway Configuration

### Backend Service

1. **Remove volume mount** (no longer needed for R2)
2. **Add environment variables** (from Step 3)
3. **Keep Dockerfile** (no changes needed)

### Worker Service

1. **Remove volume mount** (no longer needed for R2)
2. **Add same environment variables** (from Step 3)
3. **Keep Dockerfile** (no changes needed)

**Note**: You can keep a small volume for `/tmp/repos` if you want, but it's not required.

---

## How It Works

### Local Development (USE_R2_STORAGE=false or unset)

```
Repository → Docker Volume (/data/repos) → Direct Git Operations
```

- Repositories stored directly in Docker volume
- No compression/decompression
- Fast local access
- Simple filesystem operations

### Production (USE_R2_STORAGE=true)

```
Repository → Clone to /tmp/repos → Compress to tar.gz → Upload to R2
                                                              ↓
Git Operations ← Extract from tar.gz ← Download from R2 ← R2 Storage
```

- Repositories stored as tar.gz archives in R2
- Downloaded to `/tmp/repos` for Git operations
- Compressed and uploaded back after operations
- Unlimited storage capacity

---

## Storage Operations

### Cloning a Repository

1. Clone repository to `/tmp/repos/{repoName}` (bare format)
2. Compress directory to `{repoName}.tar.gz`
3. Upload tar.gz to R2 bucket
4. (Optional) Clean up local copy

### Fetching Updates

1. Check if repository exists in R2
2. Download tar.gz from R2
3. Extract to `/tmp/repos/{repoName}`
4. Run `git fetch`
5. Compress and upload back to R2

### Generating Leaderboard

1. Get local path (downloads from R2 if needed)
2. Use Git operations on local copy
3. Repository stays in temp location for faster subsequent access

---

## Cost Estimation

### Free Tier (First 10GB)
- **Storage**: FREE
- **Operations**: FREE (1M Class A, 10M Class B/month)
- **Egress**: FREE
- **Total**: **$0/month**

### After Free Tier (Example: 20GB)
- **Storage**: 10GB free + 10GB × $0.015 = **$0.15/month**
- **Operations**: FREE (likely within limits)
- **Egress**: FREE
- **Total**: **~$0.15/month**

**Much cheaper than Railway volume upgrades!**

---

## Troubleshooting

### Issue: "R2 credentials not configured"

**Solution**: Ensure all R2 environment variables are set:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

### Issue: "Failed to upload to R2"

**Possible causes**:
1. Invalid credentials
2. Bucket doesn't exist
3. Network issues

**Solution**: 
- Verify credentials in Cloudflare dashboard
- Check bucket name matches
- Verify network connectivity

### Issue: "Tar command not found"

**Solution**: Ensure `tar` is available in Docker image. Alpine images include it by default.

### Issue: Slow operations in production

**Expected**: R2 operations involve download/upload, so they're slower than local filesystem.

**Optimization**:
- Keep frequently accessed repos in `/tmp/repos` (not cleaned up)
- Implement caching strategy
- Consider keeping active repos local longer

---

## Migration from Docker Volume to R2

If you have existing repositories in Railway volumes:

1. **Export repositories** from Railway volume
2. **Upload to R2** manually or via script
3. **Update environment** to use R2
4. **Deploy** - system will use R2 going forward

---

## Monitoring

### R2 Dashboard
- Monitor storage usage
- Track operations
- View access logs

### Application Logs
- Check for R2 upload/download errors
- Monitor temp directory usage
- Track operation times

---

## Best Practices

1. **Set up alerts** for R2 usage approaching free tier limits
2. **Monitor temp directory** size (`/tmp/repos`)
3. **Implement cleanup** for old temp files
4. **Keep frequently accessed repos** in temp longer
5. **Use R2 lifecycle policies** to archive old repos (optional)

---

## Environment Variable Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `USE_R2_STORAGE` | No | Enable R2 storage (set to `true` for production) | `true` |
| `R2_ACCOUNT_ID` | Yes (if R2 enabled) | Cloudflare account ID | `abc123def456` |
| `R2_ACCESS_KEY_ID` | Yes (if R2 enabled) | R2 API access key | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | Yes (if R2 enabled) | R2 API secret key | `xyz789...` |
| `R2_BUCKET_NAME` | No | R2 bucket name (defaults to `github-repos`) | `github-repos` |

---

## Next Steps

1. ✅ Create R2 bucket
2. ✅ Generate API tokens
3. ✅ Set environment variables in Railway
4. ✅ Deploy and test
5. ✅ Monitor usage

For deployment instructions, see `DEPLOYMENT.md`.

