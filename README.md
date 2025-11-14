# GitHub Repository Scraper

A scalable, full-stack application that analyzes GitHub repositories by extracting commit history and generating contributor leaderboards. Built with modern technologies featuring asynchronous processing, real-time status updates, and support for both public and private repositories.

## 🎯 Overview

The GitHub Repository Scraper enables users to:

- **Analyze any GitHub repository** (public or private) to identify top contributors
- **Track commit statistics** and generate comprehensive leaderboards
- **Monitor processing status** in real-time through an intuitive web interface
- **Access historical data** with persistent storage and caching

The system uses asynchronous job processing to handle large repositories efficiently, ensuring responsive API responses while processing happens in the background.

## ✨ Features

### Backend

- **🚀 Fastify HTTP Server**

  - RESTful API with multiple endpoints for repository management
  - `/health` - Server status check
  - `/leaderboard` (GET) - Retrieve contributor leaderboard
  - `/leaderboard` (POST) - Submit repository for processing
  - `/repositories` - List all processed repositories
  - Dynamic state management (`pending`, `in_progress`, `completed`, `failed`)

- **⚡ Asynchronous Processing**

  - Bull queue system with Redis for job management
  - Non-blocking API responses
  - Horizontal scaling support for worker processes

- **🔧 Git Operations**

  - Bare repository cloning (space-efficient)
  - Incremental updates using `simple-git`
  - URL normalization (SSH/HTTPS support)

- **💾 Database Integration**

  - PostgreSQL for persistent storage
  - Prisma ORM for type-safe database queries
  - Efficient caching of contributors and repositories

- **🔐 Security & Authentication**

  - GitHub Personal Access Token support for private repositories
  - Secure token handling (not stored, only used per request)
  - Comprehensive error handling for network and permission issues

- **🌐 GitHub API Integration**
  - User profile resolution and enrichment
  - Smart handling of GitHub no-reply emails
  - Rate limit awareness

### Frontend

- **🎨 Modern UI**

  - Next.js 15 with React 19
  - Tailwind CSS for styling
  - Radix UI components for accessibility
  - Responsive design (desktop and mobile)

- **📊 Interactive Features**

  - Repository submission form with private repo support
  - Real-time status updates (automatic polling)
  - Searchable repository table
  - Detailed contributor leaderboard display

- **⚛️ State Management**
  - React Query for server state
  - Context API for local UI state
  - Automatic cache invalidation

## 🏗️ Architecture

The application follows a microservices architecture with clear separation of concerns:

```
Frontend (Next.js) → Backend API (Fastify) → Worker Process
                              ↓
                    PostgreSQL + Redis Queue
```

- **Frontend**: User interface built with Next.js
- **Backend API**: Fastify server handling HTTP requests
- **Worker**: Background process for repository analysis
- **PostgreSQL**: Persistent data storage
- **Redis**: Job queue and caching

For detailed architecture documentation, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)
- GitHub Personal Access Token (optional, for private repositories)

### Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/aalexmrt/github-scraper
   cd github-scraper
   ```

2. **Set Up Environment Variables**

   Create a `.env` file in the `backend` directory:

   ```bash
   cp backend/.env.example backend/.env
   ```

   Edit `backend/.env` with your configuration:

   ```env
   # Database connection string
   DATABASE_URL=postgresql://user:password@db:5432/github_scraper

   # Redis connection settings
   REDIS_HOST=redis
   REDIS_PORT=6379

   # GitHub API Personal Access Token (optional but recommended)
   GITHUB_TOKEN=your_github_personal_access_token
   ```

   **Getting a GitHub Token:**

   1. Go to [GitHub Developer Settings](https://github.com/settings/tokens)
   2. Click "Generate new token" (classic)
   3. Select scopes: `read:user` and `repo` (for private repositories)
   4. Copy the token and add it to `GITHUB_TOKEN` in your `.env` file

3. **Start Services**

   Build and start all services:

   ```bash
   docker-compose up --build
   ```

   This starts:

   - Backend API server (port 3000)
   - Frontend web application (port 4000)
   - PostgreSQL database
   - Redis server
   - Worker process

4. **Verify Installation**

   Check backend health:

   ```bash
   curl http://localhost:3000/health
   ```

   Expected response:

   ```json
   { "message": "Server is running." }
   ```

   Access the frontend at: `http://localhost:3001`

### Local Development (Frontend Locally, Backend in Docker)

If you prefer to run only the frontend locally while keeping the backend and services (database, Redis, worker) in Docker:

1. **Set Up Environment Variables**

   Create a `.env` file in the project root (or set environment variables):

   ```env
   # GitHub OAuth Configuration (required for authentication)
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret

   # Session Configuration
   SESSION_SECRET=your-super-secret-session-key-change-in-production

   # Application URLs
   FRONTEND_URL=http://localhost:3001
   BACKEND_URL=http://localhost:3000

   # GitHub Personal Access Token (optional)
   GITHUB_TOKEN=your_github_personal_access_token
   ```

   **Getting GitHub OAuth Credentials:**

   See [OAUTH_SETUP.md](./docs/OAUTH_SETUP.md) for detailed instructions on setting up GitHub OAuth.

2. **Start Docker Services**

   Start PostgreSQL, Redis, backend API, and worker:

   ```bash
   docker-compose -f docker-compose.services.yml up -d
   ```

   Or use the helper script:

   ```bash
   ./scripts/dev/start-services.sh
   ```

   This starts:

   - PostgreSQL database (port 5432)
   - Redis server (port 6379)
   - Backend API server (port 3000)
   - Worker process (background)

3. **Set Up Frontend Environment**

   Create a `.env.local` file in the `frontend` directory:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3000
   ```

4. **Install Frontend Dependencies**

   ```bash
   cd frontend
   pnpm install
   ```

5. **Start Frontend Server**

   ```bash
   pnpm run dev
   ```

   The frontend will start on `http://localhost:3001`

6. **Verify Installation**

   - Backend: `curl http://localhost:3000/health`
   - Frontend: Open `http://localhost:3001` in your browser

**Note**: The backend, database, Redis, and worker all run in Docker. Only the frontend runs locally. Code changes to the backend will be reflected automatically due to volume mounting.

## 📖 Usage

### Using the Web Interface

1. **Add a Repository**

   - Open `http://localhost:3001`
   - Enter a GitHub repository URL (e.g., `https://github.com/user/repo`)
   - For private repositories, check "This is a private repository" and enter your GitHub token
   - Click "Submit"

2. **Monitor Processing**

   - View all repositories in the "Processed Repositories" table
   - Status badges indicate current state:
     - 🔵 **On Queue**: Waiting for processing
     - 🟡 **Processing**: Currently being analyzed
     - 🟢 **Completed**: Successfully processed
     - 🔴 **Failed**: Processing encountered an error

3. **View Leaderboard**
   - Click the "Leaderboard" button for completed repositories
   - See contributors ranked by commit count
   - View contributor details: username, email, profile URL, and commit count

### Using the API

#### Submit a Repository for Processing

**Endpoint**: `POST /leaderboard`

**Query Parameters:**

- `repoUrl` (required): GitHub repository URL

**Headers:**

- `Authorization` (optional): `Bearer <token>` for private repositories

**Example:**

```bash
curl -X POST "http://localhost:3000/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
```

**Response (202 Accepted):**

```json
{ "message": "Repository is being processed." }
```

**Response (200 OK - Already Completed):**

```json
{
  "message": "Repository processed successfully.",
  "lastProcessedAt": "2024-11-28T12:00:00Z"
}
```

#### Retrieve Leaderboard

**Endpoint**: `GET /leaderboard`

**Query Parameters:**

- `repoUrl` (required): GitHub repository URL

**Example:**

```bash
curl "http://localhost:3000/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
```

**Response:**

```json
{
  "repository": "https://github.com/aalexmrt/github-scraper",
  "top_contributors": [
    {
      "username": "aalexmrt",
      "email": "67644735+aalexmrt@users.noreply.github.com",
      "profileUrl": "https://github.com/aalexmrt",
      "commitCount": 23
    }
  ]
}
```

#### List All Repositories

**Endpoint**: `GET /repositories`

**Example:**

```bash
curl "http://localhost:3000/repositories"
```

**Response:**

```json
[
  {
    "id": 1,
    "url": "https://github.com/aalexmrt/github-scraper",
    "pathName": "github-scraper",
    "state": "completed",
    "lastProcessedAt": "2024-11-28T12:00:00Z",
    "createdAt": "2024-11-28T10:00:00Z",
    "updatedAt": "2024-11-28T12:00:00Z"
  }
]
```

## 🛠️ Development

### Project Structure

```
github-scraper/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Fastify server
│   │   ├── services/             # Business logic
│   │   │   ├── queueService.ts  # Bull queue setup
│   │   │   └── repoService.ts   # Repository operations
│   │   ├── workers/             # Background workers
│   │   │   └── repoWorker.ts    # Repository processing worker
│   │   └── utils/               # Utilities
│   │       ├── prisma.ts        # Prisma client
│   │       ├── isValidGitHubUrl.ts
│   │       └── normalizeUrl.ts
│   └── prisma/
│       └── schema.prisma        # Database schema
├── frontend/
│   └── src/
│       ├── app/                 # Next.js app directory
│       ├── components/         # React components
│       ├── context/            # React Context providers
│       ├── services/           # API services
│       └── hooks/              # Custom React hooks
└── docker-compose.yml           # Docker orchestration
```

### Running in Development Mode

The Docker setup includes hot-reload for both backend and frontend:

- **Backend**: Uses `nodemon` to watch for TypeScript changes
- **Frontend**: Uses Next.js built-in HMR (Hot Module Replacement)

Changes to code are automatically reflected without restarting containers.

### Database Migrations

Prisma migrations run automatically on container startup. To create a new migration:

```bash
cd backend
npx prisma migrate dev --name migration_name
```

## 🔍 How It Works

1. **Repository Submission**: User submits a GitHub repository URL via web interface or API
2. **URL Validation**: System validates and normalizes the URL (handles SSH/HTTPS formats)
3. **Job Queue**: Repository is added to Redis queue for asynchronous processing
4. **Repository Sync**: Worker clones or updates the repository (bare clone for efficiency)
5. **Commit Analysis**: System analyzes commit history and extracts contributor information
6. **User Resolution**: Contributors are resolved using GitHub API (if needed) and cached
7. **Leaderboard Generation**: Commit counts are calculated and stored in database
8. **Status Updates**: Frontend polls for status updates and displays results when ready

## 📊 Tech Stack

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify 5.1.0
- **Database**: PostgreSQL 15 with Prisma ORM
- **Queue**: Bull 4.16.4 with Redis
- **Git**: simple-git 3.27.0
- **HTTP Client**: Axios 1.7.7

### Frontend

- **Framework**: Next.js 15.0.3
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3.4.1
- **Components**: Radix UI
- **State**: React Query 5.61.0, Context API
- **Forms**: React Hook Form 7.53.2

### Infrastructure

- **Containerization**: Docker & Docker Compose
- **Database**: PostgreSQL 15
- **Cache/Queue**: Redis 6

## 🐛 Troubleshooting

### Common Issues

**Issue**: Backend won't start

- **Solution**: Check that PostgreSQL and Redis containers are running
- Verify `DATABASE_URL` in `.env` matches Docker Compose configuration

**Issue**: Repository processing fails

- **Solution**: Check repository URL is valid and accessible
- For private repos, ensure GitHub token has correct permissions
- Check worker container logs: `docker-compose logs worker`

**Issue**: Frontend can't connect to backend

- **Solution**: Verify Next.js rewrite configuration in `next.config.ts`
- Ensure backend container is named `app` in Docker Compose

**Issue**: Rate limit errors from GitHub API

- **Solution**: Add a GitHub Personal Access Token to `.env`
- Token increases rate limit from 60 to 5000 requests/hour

## 🚧 Roadmap

### Backend

- [ ] Implement exponential backoff for GitHub API rate limits
- [ ] Add automatic retry mechanism for failed repositories
- [ ] Horizontal scaling with multiple workers
- [ ] Redis caching for leaderboard results
- [ ] Structured logging and monitoring

### Frontend

- [ ] WebSocket integration for real-time updates (replace polling)
- [ ] Enhanced UI/UX improvements
- [ ] Export leaderboard data (CSV/JSON)
- [ ] Advanced filtering and search
- [ ] Pagination for large datasets

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📚 Additional Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Detailed architecture and design patterns
- [API Documentation](#usage) - Complete API reference

## 👤 Author

**Alex Martinez**

- GitHub: [@aalexmrt](https://github.com/aalexmrt)

---

**Note**: This application processes repositories asynchronously. Large repositories may take several minutes to process. The frontend automatically polls for status updates and will display results when processing completes.
