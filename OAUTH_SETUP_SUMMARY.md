# GitHub OAuth Setup Summary

## Quick Setup Guide

### 1. Create Two GitHub OAuth Apps

**Development App:**

- Callback URL: `http://localhost:3000/auth/github/callback`
- Use credentials in local `.env` file

**Production App:**

- Callback URL: `https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback`
- Use credentials in GCP Secret Manager

### 2. Set Up Production Secrets

Run the setup script:

```bash
./create-secrets.sh
```

The script will prompt you for:

- ✅ GitHub OAuth Client ID (Production)
- ✅ GitHub OAuth Client Secret (Production)
- ✅ Frontend URL (Your Vercel URL)
- ✅ Backend URL (Cloud Run URL - defaults to correct value)

### 3. Get Your Vercel Production URL

Find your Vercel production URL:

- Check Vercel dashboard: https://vercel.com/dashboard
- Or run: `vercel ls` (if you have Vercel CLI)
- Or check your latest deployment output

**Example:** `https://github-scraper-xxx.vercel.app`

### 4. Deploy Updated Configuration

After setting secrets, redeploy:

```bash
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1
```

### 5. Verify Everything Works

1. Visit your Vercel frontend URL
2. Click "Sign in with GitHub"
3. Should redirect to GitHub, then back to your app
4. You should be authenticated!

## Troubleshooting

**If OAuth fails:**

- Verify callback URL in GitHub OAuth App matches exactly: `https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback`
- Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=api" --limit=50`
- Verify secrets are set: `gcloud secrets list --project=personal-gcp-477623`

**If secrets aren't accessible:**

- Grant permissions: See output from `create-secrets.sh` script

## Files Updated

- ✅ `create-secrets.sh` - Now includes OAuth credentials and URLs
- ✅ `cloudrun.yaml` - Uses secrets for OAuth and URLs
- ✅ `OAUTH_SETUP.md` - Updated with two-app strategy
