# Pre-Commit Checklist

Use this checklist before committing changes to ensure code quality and consistency.

## 🔍 Code Quality

- [ ] **No linter errors** - Run `npm run lint` (or equivalent) in both backend and frontend
- [ ] **TypeScript compiles** - Run `npm run build` or `tsc --noEmit` to check for type errors
- [ ] **No console.log in production code** - Use logger utility instead
- [ ] **No hardcoded secrets** - All secrets should be in environment variables or GCP Secret Manager
- [ ] **No TODO comments** - Unless documented as acceptable (e.g., Redis migration)

## 🧪 Testing

- [ ] **Backend starts successfully** - Test locally: `docker-compose up` or `npm run dev`
- [ ] **Frontend builds** - Test: `cd frontend && npm run build`
- [ ] **OAuth flow works** - Test login/logout end-to-end
- [ ] **Token storage works** - Verify tokens are stored/retrieved correctly
- [ ] **API endpoints work** - Test critical endpoints (`/auth/me`, `/leaderboard`, etc.)

## 📝 Documentation

- [ ] **Updated README** - If adding new features or changing setup
- [ ] **Updated deployment docs** - If changing infrastructure configs
- [ ] **Code comments** - Complex logic has explanatory comments
- [ ] **Commit message** - Clear, descriptive commit message

## 🔐 Security

- [ ] **No secrets in code** - Verify no API keys, tokens, or passwords in committed files
- [ ] **Environment variables** - All sensitive values use env vars or secrets
- [ ] **Token handling** - Tokens never logged or exposed unnecessarily
- [ ] **CORS configured** - Only allowed origins in CORS config
- [ ] **Input validation** - User inputs are validated and sanitized

## 🏗️ Infrastructure

- [ ] **Docker images** - Dockerfiles build successfully
- [ ] **Cloud Run configs** - `cloudrun.yaml` and `cloudrun-job.yaml` are valid YAML
- [ ] **Secrets referenced** - All required secrets are referenced in configs
- [ ] **Image names consistent** - Use `worker` (not `repo-worker`) for worker image
- [ ] **Project IDs** - All references use correct GCP project ID

## 📦 Dependencies

- [ ] **package.json updated** - New dependencies added if needed
- [ ] **package-lock.json** - Updated and committed (if using npm)
- [ ] **No unused dependencies** - Remove any unused packages
- [ ] **Version pins** - Critical dependencies have version pins

## 🎨 Frontend Specific

- [ ] **No console errors** - Check browser console for errors
- [ ] **Responsive design** - Test on mobile/tablet/desktop
- [ ] **Accessibility** - Basic a11y checks (alt text, ARIA labels)
- [ ] **Performance** - No obvious performance issues

## 🔄 Backend Specific

- [ ] **Database migrations** - New migrations tested and documented
- [ ] **Error handling** - All errors are caught and logged appropriately
- [ ] **Rate limiting** - Consider if rate limiting is needed
- [ ] **Logging** - Important events are logged (auth, errors, etc.)

## 🚀 Deployment Readiness

- [ ] **Environment variables** - All required env vars documented
- [ ] **Secrets setup** - GCP secrets are created/updated if needed
- [ ] **Migration strategy** - Database migrations can run safely
- [ ] **Rollback plan** - Know how to rollback if deployment fails

## 📋 Quick Commands

```bash
# Backend linting
cd backend && npm run lint

# Frontend linting  
cd frontend && npm run lint

# TypeScript check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Build check
cd backend && npm run build
cd frontend && npm run build

# Check for secrets (run from repo root)
grep -r "password\|secret\|token\|key" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules backend/src frontend/src | grep -v "process.env" | grep -v "TOKEN_KEY"

# Check for console.log (should use logger instead)
grep -r "console\.log\|console\.warn\|console\.error" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules backend/src frontend/src | grep -v "logger\."

# Validate YAML files
yamllint cloudrun.yaml cloudrun-job.yaml firebase.json
```

## ✅ Final Checks

- [ ] **Git status clean** - No unintended files staged
- [ ] **Branch name** - Using appropriate branch (feature/, fix/, etc.)
- [ ] **Commit size** - Changes are logically grouped
- [ ] **Review ready** - Code is ready for review (if applicable)

---

**Note:** This checklist is a guide. Not all items may apply to every commit. Use your judgment!

