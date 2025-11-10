# OAuth Cookie Debugging Guide

## Current Problem

The `sessionId` cookie is not persisting between requests, causing authentication to fail.

## Debugging Steps

### 1. Check if Cookie is Being Set

**After OAuth callback redirect:**

1. Open browser DevTools (F12)
2. Go to **Application** tab → **Cookies**
3. Check cookies for domain: `api-sgmtwgzrlq-ue.a.run.app`
4. Look for:
   - ✅ `oauth2-redirect-state` (temporary, used during OAuth)
   - ❓ `sessionId` (should persist after login)

**Expected result:** You should see `sessionId` with attributes:
- `Domain`: `api-sgmtwgzrlq-ue.a.run.app`
- `Path`: `/`
- `SameSite`: `None`
- `Secure`: ✓
- `HttpOnly`: ✓

**If `sessionId` is missing:**
- Check Cloud Run logs for session creation
- Verify session is being saved

### 2. Check Cloud Run Logs

```bash
# Check if session is being created
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api AND textPayload=~"Session"' \
  --limit 10 \
  --project=personal-gcp-477623 \
  --format="value(textPayload)"
```

**Look for:**
- `[AUTH] Session created: { userId: X }`
- `[AUTH] Session saved`

**If session is not being saved:**
- Backend code issue
- Redis connection issue (if using Redis for sessions)

### 3. Check if Cookie is Being Sent

**When making `/auth/me` request:**

1. DevTools → **Network** tab
2. Click on the `/auth/me` request
3. Check **Request Headers**
4. Look for `Cookie:` header

**Expected:** `Cookie: sessionId=<some-value>`
**Actual (currently):** No Cookie header or missing `sessionId`

**If cookie is present on domain but not sent:**
- Browser is blocking third-party cookies
- Need to implement alternative auth strategy

### 4. Check Browser Cookie Settings

**Chrome:**
1. Settings → Privacy and security → Third-party cookies
2. Check current setting:
   - ❌ "Block third-party cookies" — Will block our cookies
   - ✅ "Allow third-party cookies" — Should work
   - ⚠️ "Block third-party cookies in Incognito" — May work in regular mode

**Firefox:**
1. Settings → Privacy & Security
2. Check "Enhanced Tracking Protection" setting
3. "Standard" or "Strict" may block cookies

## Why This Happens

### Third-Party Cookie Blocking

Modern browsers are phasing out third-party cookies:
- Chrome is blocking them by default (2024+)
- Firefox blocks them in "Strict" mode
- Safari blocks them by default

**Our scenario:**
- Frontend: `github-scraper-psi.vercel.app`
- Backend: `api-sgmtwgzrlq-ue.a.run.app`
- Different domains = Third-party cookies
- Even with `SameSite=None; Secure`, browsers may block

## Solutions

### Option 1: Subdomain Approach (Best for Production)

Put frontend and backend on the same root domain:
- Frontend: `app.yourdomain.com`
- Backend: `api.yourdomain.com`
- Cookies: Set for `.yourdomain.com` (shared)

**Implementation:**
1. Buy a domain (e.g., `mygithubanalyzer.com`)
2. Point subdomain to Vercel: `app.mygithubanalyzer.com`
3. Point API subdomain to Cloud Run: `api.mygithubanalyzer.com`
4. Update cookie domain to `.mygithubanalyzer.com`
5. Update CORS and OAuth callback URLs

**Pros:**
- ✅ Works in all browsers
- ✅ No third-party cookie issues
- ✅ Professional setup

**Cons:**
- ❌ Requires custom domain
- ❌ DNS configuration needed

### Option 2: Token-Based Auth (Quick Fix)

Store auth token in browser storage instead of cookies:

**Implementation:**
1. After OAuth success, backend returns token in redirect URL
2. Frontend extracts token and stores in `localStorage`
3. Frontend sends token as `Authorization: Bearer <token>` header
4. Backend validates token instead of session

**Code changes needed:**
```typescript
// Backend: Return token after OAuth
return reply.redirect(`${frontendUrl}?auth=success&token=${encryptedToken}`);

// Frontend: Store token
const params = new URLSearchParams(window.location.search);
if (params.get('auth') === 'success') {
  const token = params.get('token');
  localStorage.setItem('auth_token', token);
}

// Frontend: Send token with requests
axios.get('/auth/me', {
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Backend: Validate token
const token = request.headers.authorization?.replace('Bearer ', '');
const userId = await validateToken(token);
```

**Pros:**
- ✅ Works in all browsers
- ✅ No cookie issues
- ✅ Quick to implement

**Cons:**
- ❌ Token exposed in URL (use encrypted token)
- ❌ localStorage accessible by JavaScript (XSS risk)
- ❌ No automatic expiration (need token refresh)

### Option 3: Vercel Proxy with Rewrite (Current Setup Issues)

Use Vercel as a proxy to make requests appear same-origin:

**Current setup (partially working):**
```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api-sgmtwgzrlq-ue.a.run.app/:path*"
    }
  ]
}
```

**Problem:** Vercel rewrites don't preserve cookies from Cloud Run responses

**Solution:** Backend needs to set cookies on Vercel domain, not Cloud Run domain

**Implementation:**
1. Backend sets cookie with `Domain=.vercel.app` (won't work, not same origin)
2. OR use Vercel Serverless Functions as middleware to proxy with cookies

**Pros:**
- ✅ Same-origin requests
- ✅ No custom domain needed

**Cons:**
- ❌ Complex setup
- ❌ Vercel rewrites don't preserve Set-Cookie headers well
- ❌ May need Vercel middleware/functions

### Option 4: Session Storage in URL (Temporary Debug)

For debugging only, pass session ID in URL:

```typescript
// After OAuth
return reply.redirect(`${frontendUrl}?auth=success&sid=${sessionId}`);

// Frontend stores and sends
localStorage.setItem('sessionId', params.get('sid'));
axios.get('/auth/me', {
  withCredentials: true,
  headers: { 'X-Session-ID': localStorage.getItem('sessionId') }
});

// Backend checks header
const sessionId = request.headers['x-session-id'];
```

**Pros:**
- ✅ Quick debug solution

**Cons:**
- ❌ Not secure
- ❌ Only for testing

## Recommended Approach

### Short-term (Testing/Demo):
**Option 2: Token-Based Auth** - Quick to implement, works everywhere

### Long-term (Production):
**Option 1: Subdomain Approach** - Professional, secure, best UX

## Next Steps

1. **Verify the issue:** Run debugging steps above to confirm cookies are blocked
2. **Choose solution:** Based on your needs (quick fix vs production)
3. **Implement:** I can help implement any of these options
4. **Test:** Verify auth works in multiple browsers

## Questions to Answer

1. Do you see `sessionId` cookie in DevTools after OAuth callback?
2. Is the cookie being sent with `/auth/me` request?
3. Are you using Chrome/Firefox with default settings?
4. Do you want a quick fix (token-based) or production solution (subdomain)?

