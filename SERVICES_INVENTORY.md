# Services Inventory - GitHub Repository Scraper

Complete list of all services and components in the application.

---

## 🎯 Application Services

### 1. **Frontend Service** (Next.js)

- **Type**: Web Application
- **Technology**: Next.js 15, React 19, TypeScript
- **Port**: 3001 (development), 3000 (production)
- **Purpose**: User interface for submitting repositories and viewing leaderboards
- **Dependencies**:
  - Backend API (via `/api/*` proxy)
  - Environment: `NEXT_PUBLIC_API_URL`
- **Key Features**:
  - Repository submission form
  - Repository list/table view
  - Leaderboard display
  - Real-time status updates (polling)
  - GitHub OAuth authentication UI
- **Deployment**: Can be deployed separately (Vercel, static hosting, or containerized)

---

### 2. **Backend API Service** (Fastify)

- **Type**: REST API Server
- **Technology**: Fastify, Node.js, TypeScript
- **Port**: 3000
- **Purpose**: Main API server handling HTTP requests
- **Dependencies**:
  - PostgreSQL database
  - Redis (for queue)
  - GitHub API (for user profile resolution)
- **API Endpoints**:

  #### Health & Status

  - `GET /health` - Health check endpoint

  #### Repository Management

  - `POST /leaderboard?repoUrl=<url>` - Submit repository for processing
  - `GET /leaderboard?repoUrl=<url>` - Get leaderboard for a repository
  - `GET /repositories` - List all repositories
  - `POST /repositories/retry?repoUrl=<url>` - Retry failed repository processing

  #### Authentication (OAuth)

  - `GET /auth/github` - Initiate GitHub OAuth flow
  - `GET /auth/github/callback` - OAuth callback handler
  - `GET /auth/me` - Get current authenticated user
  - `POST /auth/logout` - Logout user
  - `GET /auth/token` - Get user's GitHub token (protected)

- **Environment Variables**:
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_HOST` - Redis hostname
  - `REDIS_PORT` - Redis port (default: 6379)
  - `GITHUB_CLIENT_ID` - GitHub OAuth client ID
  - `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
  - `GITHUB_TOKEN` - Default GitHub token (optional)
  - `FRONTEND_URL` - Frontend URL for CORS and redirects
  - `BACKEND_URL` - Backend URL for OAuth callback
  - `SESSION_SECRET` - Session encryption secret
  - `PORT` - Server port (default: 3000)
  - `NODE_ENV` - Environment (development/production)
  - `POPULATE_DEMO_REPOS` - Auto-populate demo repos on startup (optional)
  - `USE_R2_STORAGE` - Use Cloudflare R2 for storage (true/false)
  - `R2_ACCOUNT_ID` - R2 account ID (if using R2)
  - `R2_ACCESS_KEY_ID` - R2 access key (if using R2)
  - `R2_SECRET_ACCESS_KEY` - R2 secret key (if using R2)
  - `R2_BUCKET_NAME` - R2 bucket name (if using R2)

---

### 3. **Worker Service** (Background Job Processor)

- **Type**: Background Worker
- **Technology**: Node.js, TypeScript, Bull Queue
- **Port**: None (background service)
- **Purpose**: Process repository jobs asynchronously from Redis queue
- **Dependencies**:
  - PostgreSQL database
  - Redis (for job queue)
  - GitHub API (for contributor resolution)
  - Storage adapter (filesystem or R2)
- **Responsibilities**:
  1. Listen for jobs from Redis queue
  2. Clone/fetch Git repositories
  3. Analyze commit history
  4. Generate leaderboard data
  5. Update repository state in database
- **Environment Variables**:
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_HOST` - Redis hostname
  - `REDIS_PORT` - Redis port (default: 6379)
  - `GITHUB_TOKEN` - GitHub token for API calls
  - `USE_R2_STORAGE` - Use Cloudflare R2 for storage
  - `R2_*` - R2 configuration (if using R2)
- **Scaling**: Can run multiple worker instances for parallel processing

---

## 🗄️ Data Services

### 4. **PostgreSQL Database**

- **Type**: Relational Database
- **Technology**: PostgreSQL 15
- **Port**: 5432
- **Purpose**: Persistent storage for repositories, contributors, and users
- **Database Name**: `github_scraper`
- **Schema Models** (via Prisma):
  - `Repository` - Repository metadata and state
  - `Contributor` - GitHub user information
  - `RepositoryContributor` - Join table (repository ↔ contributor with commit counts)
  - `User` - Authenticated users (OAuth)
- **Migrations**: Managed by Prisma (`prisma migrate deploy`)
- **Connection**: Via `DATABASE_URL` environment variable

---

### 5. **Redis Service**

- **Type**: In-Memory Cache & Message Queue
- **Technology**: Redis 6 (Alpine)
- **Port**: 6379
- **Purpose**:
  - Job queue (Bull queue) for asynchronous processing
  - Job state management
  - Potential caching (future enhancement)
- **Connection**: Via `REDIS_HOST` and `REDIS_PORT` environment variables
- **Queue Name**: `repository-processing`

---

## 📦 Storage Services

### 6. **Repository Storage** (Filesystem or Object Storage)

- **Type**: Persistent Storage
- **Options**:

  1. **Filesystem Storage** (Development/Default)

     - Path: `/data/repos`
     - Docker Volume: `repo_volume`
     - Format: Bare Git repositories

  2. **Cloudflare R2 Storage** (Production)
     - S3-compatible object storage
     - Stores repositories as tar.gz archives
     - Downloads to temp location for Git operations
     - Configuration via `USE_R2_STORAGE=true` and R2 credentials

- **Purpose**: Store cloned Git repositories (bare format)
- **Used By**: Worker service for Git operations

---

## 🔐 External Services

### 7. **GitHub API**

- **Type**: External API
- **Purpose**:
  - Resolve contributor profiles from email addresses
  - OAuth authentication
  - Fetch user information
- **Endpoints Used**:
  - `GET /search/users?q={email}+in:email` - Search users by email
  - `GET /user` - Get authenticated user info
  - `GET /user/emails` - Get user email addresses
- **Authentication**:
  - Personal Access Token (for private repos)
  - OAuth token (for authenticated users)
- **Rate Limits**:
  - Unauthenticated: 60 requests/hour
  - Authenticated: 5,000 requests/hour

---

## 📊 Service Dependencies Graph

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│                      Port: 3001                          │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP (via /api/* proxy)
                     │
┌────────────────────▼─────────────────────────────────────┐
│              Backend API (Fastify)                        │
│                    Port: 3000                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Endpoints:                                          │ │
│  │ - GET /health                                       │ │
│  │ - POST /leaderboard                                 │ │
│  │ - GET /leaderboard                                  │ │
│  │ - GET /repositories                                 │ │
│  │ - POST /repositories/retry                          │ │
│  │ - GET /auth/github                                  │ │
│  │ - GET /auth/github/callback                         │ │
│  │ - GET /auth/me                                      │ │
│  │ - POST /auth/logout                                 │ │
│  │ - GET /auth/token                                   │ │
│  └─────────────────────────────────────────────────────┘ │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
     │              │              │
┌────▼────┐  ┌──────▼──────┐  ┌───▼──────────────────────┐
│PostgreSQL│  │   Redis     │  │   GitHub API             │
│ Port:5432│  │  Port:6379   │  │  (External)              │
│          │  │             │  │                          │
│ - Repos  │  │ - Job Queue │  │ - User Profiles          │
│ - Users  │  │ - Metadata  │  │ - OAuth                  │
│ - Contrib│  └─────────────┘  └──────────────────────────┘
└──────────┘
     │
     │
┌────▼─────────────────────────────────────────────────────┐
│              Worker Service                               │
│            (Background Process)                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Responsibilities:                                    │ │
│  │ 1. Process jobs from Redis queue                    │ │
│  │ 2. Clone/fetch repositories                         │ │
│  │ 3. Analyze commits                                  │ │
│  │ 4. Generate leaderboard                             │ │
│  │ 5. Update database                                  │ │
│  └─────────────────────────────────────────────────────┘ │
└────┬──────────────────────────────────────────────────────┘
     │
     │
┌────▼─────────────────────────────────────────────────────┐
│         Storage (Filesystem or R2)                       │
│  - Filesystem: /data/repos (Docker volume)              │
│  - R2: S3-compatible object storage                      │
└───────────────────────────────────────────────────────────┘
```

---

## 🔄 Service Communication Flow

### Repository Submission Flow

```
User → Frontend → Backend API → PostgreSQL (create record)
                              → Redis Queue (add job)
                              → Response (202 Accepted)

Worker ← Redis Queue (consume job)
      → Storage (clone/fetch repo)
      → GitHub API (resolve contributors)
      → PostgreSQL (update state, save leaderboard)
```

### Authentication Flow

```
User → Frontend → Backend API → GitHub OAuth
                              → GitHub API (get user info)
                              → PostgreSQL (save user)
                              → Session (store user ID)
                              → Redirect to Frontend
```

### Leaderboard Retrieval Flow

```
User → Frontend → Backend API → PostgreSQL (query leaderboard)
                              → Response (leaderboard data)
```

---

## 📋 Deployment Checklist

### Required Services (Minimum)

- [ ] Frontend (Next.js)
- [ ] Backend API (Fastify)
- [ ] Worker (Background processor)
- [ ] PostgreSQL Database
- [ ] Redis (Queue)

### Optional Services

- [ ] Object Storage (R2/S3) - Alternative to filesystem
- [ ] Load Balancer - For production (if multiple instances)
- [ ] Monitoring/Logging - For production observability

### Environment Variables Summary

#### Frontend

- `NEXT_PUBLIC_API_URL` - Backend API URL

#### Backend API

- `DATABASE_URL` - PostgreSQL connection
- `REDIS_HOST` - Redis hostname
- `REDIS_PORT` - Redis port
- `GITHUB_CLIENT_ID` - OAuth client ID
- `GITHUB_CLIENT_SECRET` - OAuth client secret
- `FRONTEND_URL` - Frontend URL for CORS
- `BACKEND_URL` - Backend URL for OAuth callback
- `SESSION_SECRET` - Session encryption
- `PORT` - Server port
- `USE_R2_STORAGE` - Storage adapter choice
- `R2_*` - R2 credentials (if using R2)

#### Worker

- `DATABASE_URL` - PostgreSQL connection
- `REDIS_HOST` - Redis hostname
- `REDIS_PORT` - Redis port
- `GITHUB_TOKEN` - GitHub API token
- `USE_R2_STORAGE` - Storage adapter choice
- `R2_*` - R2 credentials (if using R2)

---

## 🚀 Scaling Considerations

### Horizontal Scaling

- **Frontend**: Stateless, can scale horizontally
- **Backend API**: Stateless, can scale horizontally (share Redis/DB)
- **Worker**: Can run multiple instances (process jobs in parallel)
- **PostgreSQL**: Can use read replicas for read-heavy workloads
- **Redis**: Can use Redis Cluster for high availability

### Vertical Scaling

- **Worker**: Most resource-intensive (Git operations, commit analysis)
- **PostgreSQL**: May need more resources as data grows
- **Redis**: Usually fine with default resources

### Resource Requirements (Estimated)

| Service     | CPU       | Memory    | Storage | Notes           |
| ----------- | --------- | --------- | ------- | --------------- |
| Frontend    | 0.5 CPU   | 512MB     | Minimal | Static assets   |
| Backend API | 0.5 CPU   | 512MB     | Minimal | Stateless       |
| Worker      | 1 CPU     | 1GB       | Varies  | Git operations  |
| PostgreSQL  | 0.5-2 CPU | 512MB-2GB | Varies  | Depends on data |
| Redis       | 0.25 CPU  | 256MB     | Minimal | In-memory       |

---

## 📝 Notes

- All services are containerized (Docker)
- Services communicate via Docker network (development) or service discovery (Kubernetes)
- Storage can be shared between Backend and Worker (filesystem) or external (R2)
- Worker can be scaled independently based on queue depth
- Frontend can be deployed separately (CDN, Vercel, etc.)
