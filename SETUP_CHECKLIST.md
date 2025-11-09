# 🚀 Deployment Setup Checklist

## Phase 1: Prerequisites & Setup

### Current Status Check

Please provide the following information:

#### 1. Tools Installation Status

- [ ] **gcloud CLI**: ✅ Installed (detected)
- [ ] **Docker**: ✅ Installed (detected)
- [ ] **Node.js**: ✅ Installed v20.19.0 (detected)
- [ ] **firebase-tools**: ❓ Need to install
- [ ] **npm/pnpm/yarn**: ✅ npm v10.8.2 (detected)

**Action needed**: Install firebase-tools

```bash
npm install -g firebase-tools
```

#### 2. GCP Project Information

- **Current Project**: `openq-429113` (detected)
- [ ] Is this the project you want to use? (Yes/No)
- [ ] Do you have billing enabled? (Yes/No)
- [ ] What region do you want to use? (Default: `us-east1`)

#### 3. Account Setup Status

Please check which accounts you already have:

- [ ] **Google Cloud Project**: ✅ `openq-429113`
- [ ] **Firebase account**: ❓ (linked to GCP project?)
- [ ] **Neon account**: ❓ (for Postgres)
- [ ] **Upstash account**: ❓ (for Redis)
- [ ] **Cloudflare account**: ❓ (for R2 storage)

#### 4. Environment Variables

We'll need to set these. Please confirm:

- **PROJECT_ID**: `openq-429113` (use this or different?)
- **REGION**: `us-east1` (or your preference?)
- **SERVICE**: `api` (or your preference?)
- **JOB_NAME**: `github-scraper-worker` (or your preference?)

---

## What I Need From You

1. **Confirm GCP Project**: Use `openq-429113` or create/use a different one?
2. **Billing Status**: Is billing enabled on your GCP project?
3. **Region Preference**: Which region? (us-east1)
4. **Account Status**: Which accounts do you already have? (Firebase, Neon, Upstash, Cloudflare)
5. **Service Names**: Any preferences for service names, or use defaults?

Once you provide this info, I'll guide you through:

- Installing missing tools (firebase-tools)
- Setting up accounts you don't have
- Configuring environment variables
- Moving to Phase 2 (Database setup)

---

## Quick Start (If You Want to Proceed Now)

If you want to use defaults and proceed:

1. **Install firebase-tools**:

   ```bash
   npm install -g firebase-tools
   ```

2. **Confirm these defaults**:

   - PROJECT_ID: `openq-429113`
   - REGION: `us-east1`
   - SERVICE: `api`
   - JOB_NAME: `github-scraper-worker`

3. **Create accounts** (if you don't have them):
   - Firebase: https://console.firebase.google.com
   - Neon: https://neon.tech
   - Upstash: https://upstash.com
   - Cloudflare: https://dash.cloudflare.com

Let me know what you'd like to do!
