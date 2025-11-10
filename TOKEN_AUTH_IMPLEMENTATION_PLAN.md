# Secure Token-Based Authentication Implementation Plan

## Overview

Replace cookie-based sessions with encrypted JWT tokens stored in sessionStorage.

## Security Measures

### 1. Token Generation (Backend)
- ✅ Use JWT with cryptographic signing
- ✅ Include expiration timestamp
- ✅ Include session identifier for revocation
- ✅ Sign with strong secret (min 256 bits)

### 2. Token Storage (Frontend)
- ✅ Use `sessionStorage` instead of `localStorage` (cleared on tab close)
- ✅ Never log tokens to console
- ✅ Clear tokens on logout

### 3. Token Transmission
- ✅ Send token in Authorization header (not URL)
- ✅ Only send over HTTPS
- ✅ Implement rate limiting

### 4. Token Validation (Backend)
- ✅ Verify signature
- ✅ Check expiration
- ✅ Validate user still exists
- ✅ Log suspicious activity

### 5. Additional Security
- ✅ Content Security Policy (CSP)
- ✅ Token rotation (optional)
- ✅ Revocation mechanism
- ✅ Audit logging

## Implementation Steps

### Phase 1: Backend Token Generation

**Files to modify:**
- `backend/package.json` - Add jsonwebtoken
- `backend/src/utils/tokenUtils.ts` - New file for token operations
- `backend/src/routes/auth.ts` - Modify callback to return token

**Changes:**

1. **Install JWT library:**
```bash
cd backend
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

2. **Create token utilities (`backend/src/utils/tokenUtils.ts`):**
```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'fallback-secret-change-in-prod';
const TOKEN_EXPIRATION = '7d';

export interface TokenPayload {
  userId: number;
  sessionId: string;
  iat: number;
  exp: number;
}

export function generateAuthToken(userId: number, sessionId: string): string {
  return jwt.sign(
    { userId, sessionId },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRATION }
  );
}

export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error);
    return null;
  }
}
```

3. **Update OAuth callback (`backend/src/routes/auth.ts`):**
```typescript
// After creating session, generate token
const token = generateAuthToken(user.id, request.session.id || 'session-id');

// Redirect with encrypted token (one-time use)
const redirectUrl = `${frontendUrl}?auth=success&token=${token}`;
```

4. **Create token validation middleware:**
```typescript
// backend/src/utils/authMiddleware.ts
export async function validateAuthToken(request: FastifyRequest): Promise<number | null> {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const payload = verifyAuthToken(token);
  
  if (!payload) {
    return null;
  }

  // Verify user still exists
  const user = await prisma.user.findUnique({
    where: { id: payload.userId }
  });

  if (!user) {
    console.warn('[AUTH] Token valid but user not found:', payload.userId);
    return null;
  }

  return user.id;
}
```

5. **Update auth endpoints to accept tokens:**
```typescript
// Modify /auth/me to check token OR session
fastify.get('/auth/me', async (request, reply) => {
  // Try token first
  let userId = await validateAuthToken(request);
  
  // Fall back to session (for backward compatibility)
  if (!userId) {
    userId = request.session?.userId;
  }

  if (!userId) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  // Fetch and return user...
});
```

### Phase 2: Frontend Token Storage

**Files to modify:**
- `frontend/src/utils/tokenStorage.ts` - New file
- `frontend/src/context/AuthContext.tsx` - Update to use tokens
- `frontend/src/services/repositoryService.ts` - Add token to requests

**Changes:**

1. **Create token storage utility (`frontend/src/utils/tokenStorage.ts`):**
```typescript
const TOKEN_KEY = 'github_scraper_auth_token';

export const tokenStorage = {
  set(token: string): void {
    try {
      // Use sessionStorage (cleared on tab close)
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('[AUTH] Failed to store token:', error);
    }
  },

  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('[AUTH] Failed to retrieve token:', error);
      return null;
    }
  },

  clear(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('[AUTH] Failed to clear token:', error);
    }
  },

  // Check if token exists (without exposing it)
  hasToken(): boolean {
    return !!this.get();
  }
};
```

2. **Update AuthContext to handle tokens:**
```typescript
// Extract token from URL after OAuth
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get('auth');
  const token = params.get('token');
  
  if (authStatus === 'success' && token) {
    console.log('[AUTH] Frontend: Received auth token');
    
    // Store token
    tokenStorage.set(token);
    
    // Clear URL (remove token from history)
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname);
    
    // Refetch user data
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }
}, [queryClient]);
```

3. **Add token to API requests:**
```typescript
// Update /auth/me request
queryFn: async () => {
  const backendUrl = getBackendUrl();
  const apiUrl = `${backendUrl}/auth/me`;
  const token = tokenStorage.get();
  
  const headers: any = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  const response = await axios.get(apiUrl, {
    withCredentials: true, // Keep for backward compatibility
    headers,
  });
  
  return response.data.user as User;
}
```

4. **Update logout to clear token:**
```typescript
const logoutMutation = useMutation({
  mutationFn: async () => {
    const backendUrl = getBackendUrl();
    const token = tokenStorage.get();
    
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    await axios.post(`${backendUrl}/auth/logout`, {}, {
      withCredentials: true,
      headers,
    });
    
    // Clear token
    tokenStorage.clear();
  },
  // ...
});
```

### Phase 3: Add Axios Interceptor (Global Token Handling)

**File:** `frontend/src/services/apiClient.ts` (new file)

```typescript
import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';

// Create axios instance
export const apiClient = axios.create({
  withCredentials: true,
});

// Add token to all requests automatically
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStorage.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors (token expired)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      tokenStorage.clear();
      // Optionally redirect to login
      console.log('[AUTH] Token expired, cleared storage');
    }
    return Promise.reject(error);
  }
);
```

### Phase 4: Security Enhancements

**1. Add Content Security Policy (CSP):**

`frontend/next.config.ts`:
```typescript
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
              "font-src 'self' data:",
              "connect-src 'self' https://api-sgmtwgzrlq-ue.a.run.app",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
```

**2. Add rate limiting (backend):**

```bash
npm install @fastify/rate-limit
```

```typescript
// backend/src/index.ts
await app.register(require('@fastify/rate-limit'), {
  max: 100, // 100 requests
  timeWindow: '15 minutes'
});
```

**3. Add token revocation:**

```typescript
// backend/src/utils/tokenUtils.ts
const revokedTokens = new Set<string>();

export function revokeToken(sessionId: string): void {
  revokedTokens.add(sessionId);
  // In production, store in Redis with TTL
}

export function isTokenRevoked(sessionId: string): boolean {
  return revokedTokens.has(sessionId);
}

// Check in validation
export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    
    if (isTokenRevoked(payload.sessionId)) {
      console.warn('[AUTH] Token revoked:', payload.sessionId);
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error);
    return null;
  }
}
```

**4. Implement logout token revocation:**

```typescript
fastify.post('/auth/logout', async (request, reply) => {
  const userId = await validateAuthToken(request);
  
  if (userId) {
    // Get token payload to revoke
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const token = authHeader.substring(7);
      const payload = jwt.decode(token) as TokenPayload;
      if (payload?.sessionId) {
        revokeToken(payload.sessionId);
      }
    }
  }
  
  // Also destroy session (for backward compatibility)
  await request.session.destroy();
  
  return reply.send({ message: 'Logged out successfully' });
});
```

## Testing Plan

### 1. Unit Tests
- Token generation and verification
- Token storage operations
- Middleware validation

### 2. Integration Tests
- Full OAuth flow with token
- Token expiration handling
- Logout and revocation

### 3. Security Tests
- Try using expired token
- Try using modified token
- Try XSS injection
- Try CSRF attack

## Deployment Checklist

- [ ] Add `JWT_SECRET` to GCP Secret Manager
- [ ] Update backend with token utilities
- [ ] Update frontend with token storage
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Test OAuth flow
- [ ] Test token expiration
- [ ] Monitor logs for errors
- [ ] Test logout flow
- [ ] Verify tokens are cleared

## Rollback Plan

If token auth fails:
1. Keep session-based auth code as fallback
2. Frontend tries token first, falls back to cookie
3. Can disable token auth with feature flag

## Migration Strategy

**Phase 1:** Deploy both (token + cookie) - Backend accepts both
**Phase 2:** Monitor which auth method works better
**Phase 3:** Eventually deprecate cookie-only approach

## Monitoring

Log these events:
- Token generation (userId, timestamp)
- Token validation failures (reason, timestamp)
- Token expiration
- Suspicious activity (multiple failed validations)

## Future Enhancements

1. **Token Rotation:** Refresh tokens before expiration
2. **Redis-based Revocation:** Store revoked tokens in Redis
3. **Device Tracking:** Associate tokens with device IDs
4. **Security Alerts:** Email on suspicious login

