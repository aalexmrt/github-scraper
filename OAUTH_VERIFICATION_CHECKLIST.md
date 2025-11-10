# OAuth Setup Verification Checklist

This checklist helps you systematically verify that GitHub OAuth is correctly configured for both local development and production.

## Environment: Local Development

### ✅ 1. GitHub OAuth App (Development)

- [ ] Go to [GitHub Developer Settings](https://github.com/settings/developers)
- [ ] Verify you have a **Development OAuth App**
- [ ] Check **Application name**: Should indicate "Dev" (e.g., `GitHub Scraper (Dev)`)
- [ ] Check **Homepage URL**: `http://localhost:3001`
- [ ] Check **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
- [ ] Verify you have both **Client ID** and **Client Secret**

### ✅ 2. Local Environment Variables

- [ ] Verify `.env` file exists in project root
- [ ] Check it contains:
  ```bash
  GITHUB_CLIENT_ID=<your_dev_client_id>
  GITHUB_CLIENT_SECRET=<your_dev_client_secret>
  FRONTEND_URL=http://localhost:3001
  BACKEND_URL=http://localhost:3000
  SESSION_SECRET=<random_32+_character_string>
  NEXT_PUBLIC_API_URL=http://localhost:3000
  ```
- [ ] Verify `GITHUB_CLIENT_ID` matches your Dev OAuth App
- [ ] Verify `SESSION_SECRET` is at least 32 characters

### ✅ 3. Local Services Running

- [ ] Backend services are running: `docker-compose up -d`
- [ ] Frontend is running: `cd frontend && npm run dev`
- [ ] Verify backend logs show correct URLs:
  ```bash
  docker-compose logs api | grep "AUTH"
  ```
  Should show:
  - `[AUTH] Backend URL: http://localhost:3000`
  - `[AUTH] Frontend URL: http://localhost:3001`
  - `[AUTH] GitHub Client ID: Set`

### ✅ 4. Test Local OAuth Flow

- [ ] Open browser: `http://localhost:3001`
- [ ] Click "Sign in with GitHub"
- [ ] Should redirect to: `https://github.com/login/oauth/authorize?client_id=...`
- [ ] After GitHub authorization, should redirect to: `http://localhost:3001/?auth=success`
- [ ] Verify you see your GitHub avatar/username in the UI

---

## Environment: Production

### ✅ 1. GitHub OAuth App (Production)

- [ ] Go to [GitHub Developer Settings](https://github.com/settings/developers)
- [ ] Verify you have a **Production OAuth App**
- [ ] Check **Application name**: Should indicate "Prod" (e.g., `GitHub Scraper (Prod)`)
- [ ] Check **Homepage URL**: Your Vercel production URL
  - Current: `https://github-scraper-psi.vercel.app`
- [ ] Check **Authorization callback URL**: Your Cloud Run backend URL
  - Current: `https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback`
- [ ] Verify you have both **Client ID** and **Client Secret**

### ✅ 2. GCP Secrets Configuration

Run these commands to verify all secrets are set correctly:

```bash
PROJECT_ID="personal-gcp-477623"

# Check all secrets exist
gcloud secrets list --project=${PROJECT_ID} --format="table(name)"

# Verify OAuth secrets
echo "GITHUB_CLIENT_ID:"
gcloud secrets versions access latest --secret=github-client-id --project=${PROJECT_ID}

echo -e "\nGITHUB_CLIENT_SECRET (first 10 chars):"
gcloud secrets versions access latest --secret=github-client-secret --project=${PROJECT_ID} | cut -c1-10

echo -e "\nFRONTEND_URL:"
gcloud secrets versions access latest --secret=frontend-url --project=${PROJECT_ID}

echo -e "\nBACKEND_URL:"
gcloud secrets versions access latest --secret=backend-url --project=${PROJECT_ID}

echo -e "\nSESSION_SECRET (first 10 chars):"
gcloud secrets versions access latest --secret=session-secret --project=${PROJECT_ID} | cut -c1-10
```

**Expected values:**

- `GITHUB_CLIENT_ID`: Should match your **Production** OAuth App Client ID
- `GITHUB_CLIENT_SECRET`: Should match your Production OAuth App Client Secret
- `FRONTEND_URL`: `https://github-scraper-psi.vercel.app` (no trailing slash)
- `BACKEND_URL`: `https://api-sgmtwgzrlq-ue.a.run.app` (no trailing slash)
- `SESSION_SECRET`: 32+ character random string

**Checklist:**

- [ ] All secrets exist in GCP Secret Manager
- [ ] `GITHUB_CLIENT_ID` matches Production OAuth App
- [ ] `GITHUB_CLIENT_SECRET` matches Production OAuth App
- [ ] `FRONTEND_URL` is correct (no trailing slash)
- [ ] `BACKEND_URL` is correct (no trailing slash)
- [ ] `SESSION_SECRET` is set and long enough

### ✅ 3. Cloud Run Configuration

Check `cloudrun.yaml` references all required secrets:

```bash
cd /Users/alexmartinez/personal_ws/github-scraper
grep -A2 "GITHUB_CLIENT_ID\|GITHUB_CLIENT_SECRET\|FRONTEND_URL\|BACKEND_URL\|SESSION_SECRET" cloudrun.yaml
```

**Checklist:**

- [ ] `GITHUB_CLIENT_ID` references `github-client-id` secret
- [ ] `GITHUB_CLIENT_SECRET` references `github-client-secret` secret
- [ ] `FRONTEND_URL` references `frontend-url` secret
- [ ] `BACKEND_URL` references `backend-url` secret
- [ ] `SESSION_SECRET` references `session-secret` secret
- [ ] All secrets use correct version (e.g., `key: latest` or specific version)

### ✅ 4. Cloud Run Service Account Permissions

Verify the Cloud Run service account has access to secrets:

```bash
PROJECT_ID="personal-gcp-477623"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

echo "Checking if service account has secretAccessor role..."
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/secretmanager.secretAccessor AND bindings.members:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

If no output, grant access:

```bash
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Checklist:**

- [ ] Service account has `roles/secretmanager.secretAccessor` role

### ✅ 5. Cloud Run Deployment

Deploy the latest configuration:

```bash
cd /Users/alexmartinez/personal_ws/github-scraper
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1
```

Wait 30 seconds for the service to start, then check logs:

```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 5 \
  --project=personal-gcp-477623 \
  --format="value(textPayload)"
```

**Expected log output:**

```
[AUTH] Initializing OAuth routes
[AUTH] Backend URL: https://api-sgmtwgzrlq-ue.a.run.app
[AUTH] Frontend URL: https://github-scraper-psi.vercel.app
[AUTH] GitHub Client ID: Set
[AUTH] OAuth2 plugin registered at /auth/github
```

**Checklist:**

- [ ] Deployment succeeded
- [ ] Logs show correct `Backend URL` (no trailing slash)
- [ ] Logs show correct `Frontend URL` (no trailing slash)
- [ ] Logs show `GitHub Client ID: Set`
- [ ] No errors in logs

### ✅ 6. Vercel Frontend Configuration

Check the Vercel configuration for API rewrites:

```bash
cd /Users/alexmartinez/personal_ws/github-scraper/frontend
cat vercel.json
```

**Expected content:**

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api-sgmtwgzrlq-ue.a.run.app/:path*"
    }
  ]
}
```

**Checklist:**

- [ ] `vercel.json` exists in `frontend/` directory
- [ ] Rewrite rule points to correct Cloud Run URL
- [ ] No trailing slashes in URLs

### ✅ 7. Vercel Deployment

Deploy the frontend to Vercel:

```bash
cd /Users/alexmartinez/personal_ws/github-scraper/frontend
vercel --prod
```

**Checklist:**

- [ ] Deployment succeeded
- [ ] Production URL is: `https://github-scraper-psi.vercel.app`
- [ ] No build errors

### ✅ 8. Test Production OAuth Flow

- [ ] Open browser: `https://github-scraper-psi.vercel.app`
- [ ] Click "Sign in with GitHub"
- [ ] Should redirect to: `https://github.com/login/oauth/authorize?client_id=...`
- [ ] Verify `client_id` parameter matches your **Production** OAuth App
- [ ] After GitHub authorization, should redirect to: `https://github-scraper-psi.vercel.app/?auth=success`
- [ ] Verify you see your GitHub avatar/username in the UI
- [ ] Open browser console, check for errors
- [ ] Verify cookies are set (check Application > Cookies in DevTools)

---

## Troubleshooting

### Issue: Redirects to `localhost:3001`

**Cause:** Cloud Run is reading an old `FRONTEND_URL` secret value.

**Solution:**

1. Verify the secret is correct:
   ```bash
   gcloud secrets versions access latest --secret=frontend-url --project=personal-gcp-477623
   ```
2. If incorrect, update it:
   ```bash
   ./set-oauth-secrets.sh
   ```
3. Force a new Cloud Run deployment by specifying an explicit secret version in `cloudrun.yaml`:
   ```yaml
   - name: FRONTEND_URL
     valueFrom:
       secretKeyRef:
         name: frontend-url
         key: '4' # Use specific version instead of 'latest'
   ```
4. Redeploy:
   ```bash
   gcloud run services replace cloudrun.yaml --project=personal-gcp-477623 --region=us-east1
   ```
5. Wait 30 seconds and check logs to verify the new URL is being used.

### Issue: "Not authenticated" errors

**Cause:** Session cookies not being set or CORS issues.

**Solution:**

1. Check Cloud Run logs for authentication flow:
   ```bash
   gcloud logging read \
     'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
     --limit 20 \
     --project=personal-gcp-477623
   ```
2. Verify `SESSION_SECRET` is set in Cloud Run
3. Check browser console for CORS errors
4. Verify cookies are being set (Application > Cookies in DevTools)

### Issue: GitHub OAuth "Application not found"

**Cause:** Using wrong OAuth App credentials (dev credentials in prod, or vice versa).

**Solution:**

1. Verify you're using the correct OAuth App for the environment
2. Check the `client_id` in the GitHub authorization URL matches your OAuth App
3. Ensure the callback URL in your GitHub OAuth App matches the environment:
   - Dev: `http://localhost:3000/auth/github/callback`
   - Prod: `https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback`

### Issue: "Redirect URI mismatch"

**Cause:** GitHub OAuth App callback URL doesn't match the actual callback URL.

**Solution:**

1. Check the error message for the actual callback URL being used
2. Update your GitHub OAuth App's Authorization callback URL to match exactly
3. Ensure no trailing slashes in URLs

---

## Quick Verification Commands

Run all verification checks at once:

```bash
#!/bin/bash
PROJECT_ID="personal-gcp-477623"

echo "=== 1. GCP Secrets ==="
echo "FRONTEND_URL:"
gcloud secrets versions access latest --secret=frontend-url --project=${PROJECT_ID}
echo -e "\nBACKEND_URL:"
gcloud secrets versions access latest --secret=backend-url --project=${PROJECT_ID}
echo -e "\nGITHUB_CLIENT_ID:"
gcloud secrets versions access latest --secret=github-client-id --project=${PROJECT_ID}

echo -e "\n=== 2. Cloud Run Logs ==="
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"AUTH"' \
  --limit 5 \
  --project=${PROJECT_ID} \
  --format="value(textPayload)"

echo -e "\n=== 3. Cloud Run URL ==="
gcloud run services describe api --region=us-east1 --project=${PROJECT_ID} --format="value(status.url)"

echo -e "\n=== 4. GitHub OAuth Apps ==="
echo "Go to: https://github.com/settings/developers"
echo "Verify callback URLs:"
echo "  Dev:  http://localhost:3000/auth/github/callback"
echo "  Prod: https://api-sgmtwgzrlq-ue.a.run.app/auth/github/callback"
```
