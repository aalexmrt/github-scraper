# Storage Capacity Quick Reference

## TL;DR

**1GB Storage Capacity**: **~20-50 repositories** (depending on size)

**Typical Repository Sizes** (bare clones):

- Small repos: 5-20 MB
- Medium repos: 20-100 MB
- Large repos: 100-500 MB+

**Realistic Estimate**: ~30-35 repositories in 1GB

---

## Quick Options

### Option 1: Stay with 1GB (Free)

- **Capacity**: ~20-50 repos
- **Cost**: $0/month
- **Action**: Implement cleanup for old/failed repos

### Option 2: Upgrade Railway Volume

- **5GB**: ~$2-5/month → ~100-250 repos
- **10GB**: ~$5-10/month → ~200-500 repos
- **No code changes needed**

### Option 3: Use Cloud Storage (S3-Compatible)

- **Cloudflare R2**: 10GB free → Unlimited with pay-as-you-go
- **Backblaze B2**: 10GB free → Very cheap ($0.005/GB/month)
- **Requires code changes**

### Option 4: Hybrid Approach

- Keep active repos locally (Railway)
- Archive old repos to S3 (R2/B2)
- **Best of both worlds**

---

## Recommendation

**For low traffic**: **Start with 1GB**, monitor usage, implement cleanup

**If you exceed 1GB**: **Upgrade to 5GB Railway volume** (~$2-5/month) - simplest solution

**For long-term scalability**: **Implement S3 archiving** for old repositories

See `R2_SETUP.md` for Cloudflare R2 setup instructions.
