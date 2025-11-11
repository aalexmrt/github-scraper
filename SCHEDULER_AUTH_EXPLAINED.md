# Cloud Scheduler Authentication Error - Deep Dive

## The Core Problem

When Cloud Scheduler tries to trigger your Cloud Run Job, it needs to prove its identity. Think of it like:

```
Cloud Scheduler → "I want to run this job"
Cloud Run API → "Who are you?"
Cloud Scheduler → "I'm service account X, here's my proof" (sends OIDC token)
Cloud Run API → "Your proof doesn't match what I expect" ❌ 401 UNAUTHENTICATED
```

---

## How Authentication Works in Google Cloud

### Current Flow (What's Breaking)

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud Scheduler (Every 1 minute)                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ 1. Creates OIDC Token with:
                   │    - Service Account: 543333616568-compute@...
                   │    - Audience: "https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/..."
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloud Run Jobs API                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Receives Token & Validates:                            ││
│  │ - "Is this from a real service account?" ✓ YES         ││
│  │ - "Does the audience match?" ✗ NO MATCH               ││
│  │   Expected: ??? (unclear what it expects)              ││
│  │   Got: "...jobs/commit-worker:run"                     ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
              ❌ 401 Error
          "UNAUTHENTICATED"
```

### The Key Issue: Wrong Token Type

**🔍 Root Cause Found in Official Documentation:**

According to [Google Cloud's official documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth):

> "An OIDC token is generally used _except_ for Google APIs hosted on `*.googleapis.com` as these APIs expect an OAuth token."

**Cloud Run Jobs API is hosted on `run.googleapis.com`** (which matches `*.googleapis.com`), so it **requires OAuth tokens, not OIDC tokens**.

The issue isn't an audience mismatch - **OIDC tokens simply don't work for this API**. You must use OAuth tokens instead.

```
OIDC Token (What you're currently using - WRONG):
{
  "iss": "https://accounts.google.com",
  "aud": "https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/personal-gcp-477623/jobs/commit-worker:run",
  "sub": "543333616568-compute@developer.gserviceaccount.com",
  "iat": 1731347000,
  "exp": 1731350600
}

Cloud Run Jobs API Response:
  "This API expects OAuth tokens, not OIDC tokens" ❌
  "Use --oauth-service-account-email instead" ✅
```

---

## Understanding Each Option

### Option 1: OAuth 2.0 Bearer Token ✅ REQUIRED (Official Solution)

**How It Works:**

```
┌──────────────────────────────────────────────────┐
│  Cloud Scheduler                                 │
│  Stores: Service Account Email & Key Info        │
└────────────────┬─────────────────────────────────┘
                 │
                 │ 1. Requests token from Google OAuth Server
                 │    "Give me a token for this service account"
                 │
                 ▼
        ┌────────────────────┐
        │ Google OAuth       │
        │ (Authorization)    │
        │ Server             │
        └────────┬───────────┘
                 │
                 │ 2. Returns Bearer Token
                 │    (Not OIDC, simpler format)
                 │
                 ▼
        ┌──────────────────────────────┐
        │ Bearer Token                 │
        │ (OAuth 2.0 Access Token)     │
        │ - Valid for: 1 hour          │
        │ - No audience claim issues   │
        │ - Just says: "Valid token"   │
        └────────┬─────────────────────┘
                 │
                 │ 3. Sends token to Cloud Run API
                 │    "Here's my access token"
                 │
                 ▼
        ┌──────────────────────────────────┐
        │ Cloud Run Jobs API               │
        │ Validates Bearer Token:          │
        │ - "Is this real?" ✓ YES         │
        │ - No audience mismatch          │
        │ - Simple validation ✓ PASS      │
        └────────┬─────────────────────────┘
                 │
                 ▼
            ✅ Job Executes!
```

**Real Example:**

```
Authorization: Bearer ya29.a0AfH6SMBxyz...
(This token just proves the service account is real, no audience issues)
```

**Why This Works:**

- **According to [Google's official documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth):** Google APIs hosted on `*.googleapis.com` (including Cloud Run Jobs API) **require OAuth tokens, not OIDC tokens**
- OAuth 2.0 bearer tokens don't have audience validation issues
- Cloud Run Jobs API is designed to accept OAuth tokens
- ✅ Service account has `roles/run.invoker` → ALLOWED

**Implementation:**

```bash
# Use --oauth-service-account-email instead of --oidc-service-account-email
gcloud scheduler jobs create http JOB_ID \
    --schedule="FREQUENCY" \
    --uri=URI \
    --oauth-service-account-email=SERVICE_ACCOUNT_EMAIL
```

**Pros:**

- ✅ **Required by Google Cloud for APIs on `*.googleapis.com`**
- ✅ Official solution per [Google Cloud documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth)
- ✅ No audience mismatch issues (OAuth doesn't use audience claims)
- ✅ Standard Google Cloud approach
- ✅ Guaranteed to work with Cloud Run Jobs API

**Cons:**

- ❌ Slightly less "proof of identity" (but still very secure)
- ❌ Token expires every hour (but scheduler handles refresh automatically)

---

### Option 2: Use OAuth 2.0 with OAuthToken (Alternative)

Instead of OIDC Service Account, use the simpler OAuth flow:

```
Cloud Scheduler Configuration:
  --oauth-service-account-email=SERVICE_ACCOUNT_EMAIL
  (instead of --oidc-service-account-email)
```

**How It Differs:**

```
OIDC Approach (Current - Broken):
  Scheduler → Creates proof token → Cloud Run validates audience → ❌ Fails

OAuth Approach:
  Scheduler → Requests access token → Cloud Run validates token → ✅ Works
```

**Why This Works:**

- OAuth doesn't use audience claims
- Cloud Run API is designed for OAuth tokens
- Simpler validation path

**Pros:**

- ✅ Simpler than OIDC
- ✅ No audience issues
- ✅ Standard OAuth 2.0

**Cons:**

- ❌ Less explicit proof of which service should have access
- ❌ Fewer options for fine-grained access control

---

### Option 3: Use a Service Account Key (HTTP Basic Auth)

Generate a service account key and use it for authentication:

```
┌─────────────────────────────────┐
│  Cloud Scheduler                │
│  Stores: Service Account Key    │
│  (JSON file with credentials)   │
└────────────┬────────────────────┘
             │
             │ 1. Encodes key as HTTP Basic Auth
             │    Authorization: Basic base64(key:secret)
             │
             ▼
        ┌────────────────────────────┐
        │ Cloud Run Jobs API         │
        │ Validates Basic Auth:      │
        │ - Decodes key info         │
        │ - Checks service account   │
        │ - Verifies IAM role        │
        └────────┬───────────────────┘
                 │
                 ▼
            ✅ Job Executes!
```

**Pros:**

- ✅ Very explicit authentication
- ✅ No token expiration issues
- ✅ Clear audit trail

**Cons:**

- ❌ Requires managing service account keys (security risk)
- ❌ Keys can be compromised if exposed
- ❌ More complex to set up
- ❌ Google recommends against this approach (deprecated)

---

### Option 4: Fix OIDC Audience (NOT RECOMMENDED - Won't Work)

**⚠️ This approach will NOT work** - According to [Google's official documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth), Google APIs hosted on `*.googleapis.com` (including Cloud Run Jobs API) **require OAuth tokens, not OIDC tokens**. No amount of audience tweaking will make OIDC work for this API.

**Why This Won't Work:**

- ❌ **Google explicitly states OIDC doesn't work for `*.googleapis.com` APIs**
- ❌ Cloud Run Jobs API (`run.googleapis.com`) falls under this category
- ❌ The API will reject OIDC tokens regardless of audience value
- ❌ This is not an audience issue - it's a token type issue

**Reference:**
From [Google Cloud Documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth):

> "An OIDC token is generally used _except_ for Google APIs hosted on `*.googleapis.com` as these APIs expect an OAuth token."

**Conclusion:**

- ❌ Don't waste time trying different OIDC audience values
- ✅ Use OAuth tokens instead (Option 1)

---

### Option 5: Switch to Cloud Tasks

Use Google Cloud Tasks instead of Cloud Scheduler for more control:

```
┌──────────────────────────┐
│  Cloud Tasks             │
│  (Task Queue)            │
└────────────┬─────────────┘
             │
             │ Enqueues task every minute
             │
             ▼
        ┌─────────────────────────────┐
        │ Task Executor               │
        │ (Has multiple options for   │
        │  auth: OIDC, OAuth, Keys)   │
        └────────┬────────────────────┘
                 │
                 │ Can retry with backoff
                 │ Better error handling
                 │
                 ▼
            ✅ Cloud Run Job
```

**Pros:**

- ✅ More flexible authentication options
- ✅ Better retry logic
- ✅ Better designed for Cloud Run
- ✅ Simpler authentication path

**Cons:**

- ❌ More components to manage
- ❌ Different API than Cloud Scheduler
- ❌ Slight cost difference

---

## Comparison Table

| Feature                    | OIDC (Current)      | OAuth 2.0 | Service Key | Cloud Tasks         |
| -------------------------- | ------------------- | --------- | ----------- | ------------------- |
| Works with Cloud Scheduler | ❌ No (auth issues) | ✅ Yes    | ✅ Yes      | N/A                 |
| Audience mismatch issues   | ❌ YES              | ✅ No     | ✅ No       | ✅ No               |
| Simplicity                 | Medium              | ✅ High   | Low         | Medium              |
| Security                   | High                | ✅ High   | ⚠️ Medium   | ✅ High             |
| Maintenance                | Hard                | ✅ Easy   | Medium      | ✅ Easy             |
| Requires key management    | No                  | No        | ❌ Yes      | No                  |
| Google recommended         | ⚠️ Deprecated       | ✅ Yes    | ❌ No       | ✅ Yes              |
| Can deploy today           | ❌ Unclear          | ✅ Yes    | ✅ Yes      | ❌ Requires changes |

---

## Why This Specific Error Happens

```
The OIDC Token Format:
{
  "iss": "https://accounts.google.com",
  "aud": "https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/personal-gcp-477623/jobs/commit-worker:run",
  "sub": "543333616568-compute@developer.gserviceaccount.com",
  "iat": 1731347000
}

Cloud Run Jobs API Validation:
  1. Check: Is 'iss' from Google? ✓ Yes
  2. Check: Is 'sub' service account real? ✓ Yes
  3. Check: Does 'aud' match what we expect? ❌ NO MATCH!
     - We expect: ??? (undocumented by Google)
     - We got: "...jobs/commit-worker:run"
  4. Reject with 401 UNAUTHENTICATED
```

**The Real Problem:** According to [Google's official documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth), Google APIs hosted on `*.googleapis.com` (including Cloud Run Jobs API at `run.googleapis.com`) **require OAuth tokens, not OIDC tokens**. This is not an audience issue - OIDC tokens simply don't work for this API.

---

## My Recommendation

**🎯 Use Option 1: OAuth 2.0 Bearer Token** (This is the **only** solution that will work)

**Why:**

1. ✅ **Required by Google Cloud** - [Official documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth) explicitly states Google APIs on `*.googleapis.com` require OAuth tokens
2. ✅ **Cloud Run Jobs API is on `run.googleapis.com`** - falls under the `*.googleapis.com` category
3. ✅ No audience mismatch issues (OAuth doesn't use audience claims)
4. ✅ Simplest implementation (change one flag: `--oidc-service-account-email` → `--oauth-service-account-email`)
5. ✅ Google's official approach for this exact scenario
6. ✅ Can be deployed today (5 minutes)

**Reference:**

- [Google Cloud Documentation: Use authentication with HTTP targets](https://docs.cloud.google.com/scheduler/docs/http-target-auth)

---

## Next Steps

**The solution is clear from Google's official documentation:**

1. ✅ **Implement Option 1 (OAuth 2.0)** - This is the **only** solution that will work

   - Change `--oidc-service-account-email` to `--oauth-service-account-email` in your Cloud Scheduler job configuration
   - Reference: [Google Cloud Documentation](https://docs.cloud.google.com/scheduler/docs/http-target-auth)

2. ❌ **Don't try Option 4** - OIDC tokens won't work for Cloud Run Jobs API regardless of audience value

3. ⚠️ **Option 5 (Cloud Tasks)** - Only needed if you want more advanced features, but OAuth should solve your current issue
