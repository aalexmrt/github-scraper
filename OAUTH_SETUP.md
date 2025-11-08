# GitHub OAuth Authentication Setup

This document explains how to set up GitHub OAuth authentication for the GitHub Scraper application.

## Overview

The application now supports GitHub OAuth authentication, allowing users to sign in with their GitHub account and automatically use their GitHub token for API requests. This provides:

- ✅ Better rate limits (5,000/hour vs 60/hour unauthenticated)
- ✅ Access to private repositories
- ✅ Secure token storage (tokens never exposed to frontend)
- ✅ Seamless user experience

**Architecture Note:** The backend runs in Docker containers, while the frontend runs locally on your machine. This setup allows for faster frontend development while keeping backend services containerized.

## Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: `GitHub Scraper` (or your preferred name)
   - **Homepage URL**:
     - Development: `http://localhost:3001` (frontend runs locally on port 3001)
     - Production: Your production frontend URL
   - **Authorization callback URL**:
     - Development: `http://localhost:3000/auth/github/callback` (backend runs in Docker on port 3000)
     - Production: `https://your-backend-domain.com/auth/github/callback`
4. Click **"Register application"**
5. Copy the **Client ID** and generate a **Client Secret**

## Step 2: Environment Variables

Create a `.env` file in the **root directory** of the project:

```env
# GitHub OAuth App Credentials
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# Application URLs
# Frontend runs locally on port 3001, backend runs in Docker on port 3000
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000

# Session Secret (generate a random string)
SESSION_SECRET=your-random-session-secret-string-min-32-characters

# Optional: Fallback GitHub Token
GITHUB_TOKEN=your_github_personal_access_token

# Frontend API URL (used by Next.js frontend)
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Important Notes:**

- Docker Compose will automatically pass these variables to the backend container
- `SESSION_SECRET` should be a long, random string (at least 32 characters)
- Generate it using: `openssl rand -base64 32`
- The **frontend runs locally** on port **3001** (not in Docker)
- The **backend runs in Docker** on port **3000**

**For Production:**

Update the URLs in your `.env` file:

- `FRONTEND_URL=https://your-frontend-domain.com`
- `BACKEND_URL=https://your-backend-domain.com`
- `NEXT_PUBLIC_API_URL=https://your-backend-domain.com`

## Step 3: Database Migration

Run the Prisma migration inside the Docker container:

```bash
docker-compose -f docker-compose.services.yml exec backend npx prisma migrate dev --name add_user_model
```

Or if the containers aren't running yet, start them first:

```bash
docker-compose -f docker-compose.services.yml up -d db
docker-compose -f docker-compose.services.yml exec backend npx prisma migrate dev --name add_user_model
```

**Note:** The backend runs inside Docker, so all migrations must be run using `docker-compose -f docker-compose.services.yml exec backend`.

## Step 4: Install Dependencies

### Backend Dependencies

Backend dependencies will be installed automatically when Docker builds the containers. If you need to manually install:

```bash
docker-compose -f docker-compose.services.yml exec backend npm install
```

The following packages are installed in the backend:

- `@fastify/cookie` - Cookie handling
- `@fastify/cors` - CORS support
- `@fastify/oauth2` - OAuth2 integration
- `@fastify/session` - Session management

### Frontend Dependencies

Install frontend dependencies locally (frontend runs outside Docker):

```bash
cd frontend
pnpm install
```

## Step 5: Start the Application

### Start Backend Services (Docker)

1. Make sure your `.env` file is in the root directory with all required variables
2. Start backend services using Docker Compose:

```bash
# Using docker-compose.services.yml (recommended)
docker-compose -f docker-compose.services.yml up -d

# Or using the start script
./start-services.sh
```

This will start:

- PostgreSQL database (port 5432)
- Redis (port 6379)
- Backend API (port 3000)
- Worker service

### Start Frontend (Local)

3. In a separate terminal, start the frontend locally:

```bash
cd frontend
pnpm run dev
```

The frontend will start on **http://localhost:3001**

4. Access the application:

   - Frontend: http://localhost:3001 (runs locally)
   - Backend API: http://localhost:3000 (runs in Docker)

5. The application should now be running with OAuth authentication enabled!

**Note:**

- Backend services run in Docker containers
- Frontend runs locally for faster development
- All backend operations (migrations, npm commands, etc.) must be performed using `docker-compose -f docker-compose.services.yml exec backend`

## How It Works

### Authentication Flow

1. User clicks **"Sign in with GitHub"** button
2. User is redirected to GitHub OAuth authorization page
3. User authorizes the application
4. GitHub redirects back to backend callback URL (`/auth/github/callback`)
5. Backend exchanges authorization code for access token
6. Backend stores user info and token in database
7. Backend creates a session and redirects to frontend
8. Frontend detects successful authentication and fetches user info

### Token Usage

- **Authenticated users**: Their GitHub token is automatically used for all API requests
- **Unauthenticated users**: Can still manually enter tokens (backward compatible)
- **Fallback**: If no user token and no manual token, uses `GITHUB_TOKEN` env variable

### Security Features

- ✅ Tokens stored encrypted in database
- ✅ Tokens never exposed to frontend
- ✅ Session-based authentication with secure cookies
- ✅ CORS configured for secure cross-origin requests
- ✅ HttpOnly cookies prevent XSS attacks

## Troubleshooting

### "Not authenticated" error

- Check that cookies are enabled in your browser
- Verify `SESSION_SECRET` is set correctly
- Check browser console for CORS errors
- Ensure `FRONTEND_URL` matches your actual frontend URL

### OAuth callback fails

- Verify callback URL in GitHub OAuth App settings matches backend URL
- Check that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Ensure backend is accessible at the callback URL

### CORS errors

- Verify `FRONTEND_URL` in root `.env` file matches your frontend URL (`http://localhost:3001`)
- Check that `credentials: true` is set in CORS config (already configured)
- Ensure frontend uses `withCredentials: true` in axios requests (already configured)
- Restart Docker containers after changing environment variables: `docker-compose -f docker-compose.services.yml restart backend`

### Session not persisting

- Check that cookies are being set (inspect browser DevTools → Application → Cookies)
- Verify `SESSION_SECRET` is set and consistent
- In production, ensure `secure: true` is set for HTTPS (already configured)

## Production Deployment

### Additional Considerations

1. **HTTPS Required**: OAuth requires HTTPS in production
2. **Session Storage**: Consider using Redis for session storage in production:
   ```env
   REDIS_URL=redis://your-redis-url:6379
   ```
3. **Environment Variables**: Use secure secret management (e.g., AWS Secrets Manager, HashiCorp Vault)
4. **Rate Limiting**: Consider adding rate limiting to OAuth endpoints
5. **Token Refresh**: GitHub tokens don't expire, but consider implementing token refresh logic

### Docker Deployment

The `docker-compose.services.yml` file has already been updated with the necessary environment variables. Make sure your root `.env` file contains all the required values (see Step 2).

**Quick Setup Summary:**

1. Create `.env` file in root directory with all required variables (set `FRONTEND_URL=http://localhost:3001`)
2. Start backend services: `docker-compose -f docker-compose.services.yml up -d` or `./start-services.sh`
3. Run migrations: `docker-compose -f docker-compose.services.yml exec backend npx prisma migrate dev --name add_user_model`
4. Start frontend locally: `cd frontend && pnpm run dev`
5. Access frontend at http://localhost:3001

**Important:**

- Backend runs in Docker, frontend runs locally
- All backend operations (migrations, npm commands, etc.) must be run inside the Docker container using `docker-compose -f docker-compose.services.yml exec backend`

## API Endpoints

### Authentication Endpoints

- `GET /auth/github` - Initiates OAuth flow (redirects to GitHub)
- `GET /auth/github/callback` - OAuth callback handler
- `GET /auth/me` - Get current authenticated user
- `POST /auth/logout` - Logout current user
- `GET /auth/token` - Get user's GitHub token (internal use)

### Updated Endpoints

- `POST /leaderboard` - Now uses authenticated user's token automatically if available
- All endpoints support session-based authentication via cookies

## Testing

1. Start the application
2. Click "Sign in with GitHub"
3. Authorize the application on GitHub
4. You should be redirected back and see your GitHub username in the top right
5. Try submitting a private repository - it should work without entering a token manually
