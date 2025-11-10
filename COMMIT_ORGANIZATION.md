# Commit Organization Guide

This document helps organize your commits into logical, reviewable groups.

## Recommended Commit Structure

### Option 1: Single Feature Commit (Recommended for this PR)

All OAuth/token auth changes in one commit:

```bash
git add .
git commit -m "feat: Implement GitHub OAuth with JWT token authentication

- Add OAuth2 flow with GitHub integration
- Implement JWT token generation and validation
- Add secure token storage in frontend (sessionStorage)
- Support both token and session-based auth (backward compatible)
- Update Cloud Run configs with OAuth secrets
- Add comprehensive documentation and setup scripts
- Reduce console.log verbosity with logger utility
- Fix image name consistency (use 'worker' instead of 'repo-worker')"
```

### Option 2: Multiple Logical Commits

If you prefer smaller, focused commits:

#### Commit 1: Core OAuth Backend Implementation
```bash
git add backend/src/routes/auth.ts \
        backend/src/utils/tokenUtils.ts \
        backend/src/utils/logger.ts \
        backend/src/types/fastify.d.ts \
        backend/package.json \
        backend/start.sh

git commit -m "feat(backend): Add GitHub OAuth with JWT token authentication

- Implement OAuth2 flow with @fastify/oauth2
- Add JWT token generation and validation utilities
- Create logger utility to reduce console.log verbosity
- Support both token and session-based auth for backward compatibility"
```

#### Commit 2: Frontend Token Handling
```bash
git add frontend/src/utils/tokenStorage.ts \
        frontend/src/utils/logger.ts \
        frontend/src/context/AuthContext.tsx \
        frontend/src/services/apiClient.ts \
        frontend/src/components/*.tsx

git commit -m "feat(frontend): Add token-based authentication

- Implement secure token storage using sessionStorage
- Update AuthContext to handle JWT tokens
- Add axios interceptor for automatic token injection
- Create logger utility for reduced console verbosity
- Update components to use new auth flow"
```

#### Commit 3: Infrastructure Configuration
```bash
git add cloudrun.yaml \
        cloudrun-job.yaml \
        firebase.json \
        frontend/vercel.json \
        frontend/next.config.ts \
        .firebaserc \
        .gitignore

git commit -m "chore: Update infrastructure configs for OAuth

- Add OAuth secrets to Cloud Run service config
- Update Firebase Hosting config with API rewrites
- Add Vercel rewrites for API proxy
- Update .gitignore to exclude .vercel directory"
```

#### Commit 4: Deployment Scripts
```bash
git add create-secrets.sh \
        set-oauth-secrets.sh \
        setup-cloud-scheduler.sh \
        setup-cicd.sh

git commit -m "chore: Add deployment and setup scripts

- Add script to create GCP secrets (including OAuth)
- Add quick OAuth secrets setup script
- Update Cloud Scheduler setup script
- Add CI/CD setup script for GitHub Actions"
```

#### Commit 5: Documentation
```bash
git add *.md \
        PRE_COMMIT_CHECKLIST.md \
        pre-commit.sh

git commit -m "docs: Add comprehensive OAuth and deployment documentation

- Add OAuth setup guides and verification checklist
- Add security audit report
- Add CI/CD deployment strategy documentation
- Add pre-commit checklist and script
- Fix image name consistency in docs (worker vs repo-worker)"
```

## Current Changes Summary

### Modified Files (24)
- Configuration: `.firebaserc`, `.gitignore`, `firebase.json`, `cloudrun.yaml`, `cloudrun-job.yaml`, `frontend/next.config.ts`, `frontend/.eslintrc.json`, `frontend/vercel.json`
- Backend: `backend/package.json`, `backend/Dockerfile.prod`, `backend/src/index.ts`, `backend/src/routes/auth.ts`, `backend/src/types/fastify.d.ts`
- Frontend: `frontend/src/app/repo/[owner]/[repoName]/leaderboard/page.tsx`, `frontend/src/components/*.tsx` (6 files), `frontend/src/context/AuthContext.tsx`
- Scripts: `create-secrets.sh`, `setup-cloud-scheduler.sh`

### New Files (15)
- Backend: `backend/src/utils/tokenUtils.ts`, `backend/src/utils/logger.ts`, `backend/start.sh`
- Frontend: `frontend/src/utils/tokenStorage.ts`, `frontend/src/utils/logger.ts`, `frontend/src/services/apiClient.ts`
- Scripts: `set-oauth-secrets.sh`, `setup-cicd.sh`, `pre-commit.sh`
- Documentation: `CICD_DEPLOYMENT_STRATEGY.md`, `DEPLOYMENT_QUICK_REFERENCE.md`, `OAUTH_DEBUGGING_GUIDE.md`, `OAUTH_SETUP_SUMMARY.md`, `OAUTH_VERIFICATION_CHECKLIST.md`, `SECURITY_AUDIT_REPORT.md`, `TOKEN_AUTH_IMPLEMENTATION_PLAN.md`, `TOKEN_AUTH_IMPLEMENTATION_SUMMARY.md`, `PRE_COMMIT_CHECKLIST.md`

### Deleted Files (2)
- `OCI_K8S_ANALYSIS.md`, `R2_SETUP.md`

## Quick Commit Commands

### Single Commit (Recommended)
```bash
# Review changes
git status

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Implement GitHub OAuth with JWT token authentication

- Add OAuth2 flow with GitHub integration
- Implement JWT token generation and validation
- Add secure token storage in frontend (sessionStorage)
- Support both token and session-based auth (backward compatible)
- Update Cloud Run configs with OAuth secrets
- Add comprehensive documentation and setup scripts
- Reduce console.log verbosity with logger utility
- Fix image name consistency (use 'worker' instead of 'repo-worker')"
```

### Multiple Commits (If Preferred)
```bash
# Follow the structure above, committing each group separately
# See "Option 2: Multiple Logical Commits" section
```

## Before Committing

1. ✅ Run pre-commit checks: `./pre-commit.sh`
2. ✅ Review `PRE_COMMIT_CHECKLIST.md`
3. ✅ Test locally (if possible)
4. ✅ Verify no secrets in code
5. ✅ Check git status: `git status`

## After Committing

1. Review commit message: `git log -1`
2. Verify changes: `git diff HEAD~1`
3. Push to remote: `git push origin feature/deployment`

