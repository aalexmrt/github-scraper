# Environment Variables for Local Development

## Overview

For local development using `docker-compose.services.yml` (recommended setup), you need:

1. **Root `.env` file** - Used by docker-compose to pass variables to containers
2. **Frontend `.env.local` file** - Used by Next.js frontend (runs locally)

## Required Files

### 1. Root `.env` file (project root)

This file is read by `docker-compose.services.yml` and provides environment variables to the backend and worker containers.

**Location**: `/Users/alexmartinez/personal_ws/github-scraper/.env`

**Required Variables**:

```bash
# GitHub OAuth Configuration (REQUIRED for authentication)
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# Session Configuration (REQUIRED)
SESSION_SECRET=your-random-session-secret-string-min-32-characters

# Application URLs (REQUIRED)
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000

# GitHub Personal Access Token (OPTIONAL but recommended)
# Used for better API rate limits and user profile data
GITHUB_TOKEN=your_github_personal_access_token

# Demo Repository Population (OPTIONAL)
# Set to 'true' to automatically populate demo repos on startup
POPULATE_DEMO_REPOS=false
```

**Note**: Database and Redis connection strings are hardcoded in `docker-compose.services.yml`:
- `DATABASE_URL=postgresql://user:password@db:5432/github_scraper`
- `REDIS_HOST=redis`
- `REDIS_PORT=6379`

### 2. Frontend `.env.local` file

This file is used by Next.js when running the frontend locally.

**Location**: `/Users/alexmartinez/personal_ws/github-scraper/frontend/.env.local`

**Required Variables**:

```bash
# Backend API URL (REQUIRED)
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Optional Files

### `backend/.env.example` (Reference Only)

This file serves as documentation for backend-specific variables. It's **not used** when running with `docker-compose.services.yml` because:
- Database/Redis URLs are provided by docker-compose
- Other variables come from the root `.env` file

**Note**: If you run the backend directly (not in Docker), you would need `backend/.env`, but that's not the recommended setup.

## Variable Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `Ov23lint0kSRlkOLamUu` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `7af33e8cd5e1d55e5421fb0c1fd4653b255846aa` |
| `SESSION_SECRET` | Secret for session encryption (min 32 chars) | `8Eb94mds3N/EgoxpZyYH1eYY4DerlBCyKT4zEa3bX/M=` |
| `FRONTEND_URL` | Frontend application URL | `http://localhost:3001` |
| `BACKEND_URL` | Backend API URL | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Backend API URL (for frontend) | `http://localhost:3000` |

### Optional Variables

| Variable | Description | Default | Recommended |
|----------|-------------|---------|-------------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | `null` | ✅ Yes (for better rate limits) |
| `POPULATE_DEMO_REPOS` | Auto-populate demo repos on startup | `false` | No (run manually) |

## Setup Instructions

1. **Create root `.env` file**:
   ```bash
   cp .env.example .env  # If you have a template
   # Or create manually with required variables
   ```

2. **Create frontend `.env.local` file**:
   ```bash
   cd frontend
   cp .env.example .env.local
   # Edit NEXT_PUBLIC_API_URL if needed
   ```

3. **Generate SESSION_SECRET**:
   ```bash
   openssl rand -base64 32
   ```

4. **Get GitHub OAuth credentials**:
   - See [OAUTH_SETUP.md](./OAUTH_SETUP.md) for detailed instructions

5. **Get GitHub Personal Access Token** (optional):
   - Go to [GitHub Developer Settings](https://github.com/settings/tokens)
   - Generate new token (classic)
   - Scopes: `read:user` (and `repo` for private repos)

## Quick Start Checklist

- [ ] Root `.env` file created with all required variables
- [ ] Frontend `.env.local` file created with `NEXT_PUBLIC_API_URL`
- [ ] `SESSION_SECRET` generated (32+ characters)
- [ ] GitHub OAuth credentials configured
- [ ] `GITHUB_TOKEN` set (optional but recommended)
- [ ] `POPULATE_DEMO_REPOS` set to `false` (for local dev)

## Notes

- **Never commit `.env` or `.env.local` files** - they contain secrets
- The `.env.example` files are safe to commit (they contain no secrets)
- Docker Compose reads from root `.env` automatically
- Next.js reads from `frontend/.env.local` automatically
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser

