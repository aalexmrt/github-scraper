# Scripts Directory

This directory contains all shell scripts organized by purpose. Scripts are grouped into logical subdirectories for easier navigation and maintenance.

## Directory Structure

```
scripts/
├── deploy/          # Deployment and infrastructure setup scripts
├── secrets/         # Secret management scripts
├── dev/             # Local development scripts
├── debug/           # Debugging and diagnostic scripts
└── utils/           # Utility scripts
```

## Script Categories

### 📦 `deploy/` - Deployment Scripts

Scripts for deploying services and setting up infrastructure:

- **`deploy.sh`** - Main deployment script for all services (API, workers, frontend)
  - Usage: `./scripts/deploy/deploy.sh [--patch|--minor|--major|--no-bump] [service1] [service2] ...`
  - Examples:
    - `./scripts/deploy/deploy.sh` - Deploy all services with patch version bump
    - `./scripts/deploy/deploy.sh api` - Deploy only API service
    - `./scripts/deploy/deploy.sh --no-bump commit-worker` - Deploy commit-worker without version bump

- **`setup.sh`** - Initial GCP project setup
  - Enables required APIs and prepares project for deployment

- **`setup-two-worker-schedulers.sh`** - Sets up Cloud Scheduler jobs for commit-worker and user-worker
  - Creates schedulers for automated job execution
  - Commit worker: Every 15 minutes
  - User worker: Every 4 hours

- **`setup-cicd.sh`** - Sets up CI/CD service account and permissions

### 🔐 `secrets/` - Secret Management

Scripts for managing GCP Secret Manager secrets:

- **`create-secrets.sh`** - Interactive script to create/update all GCP secrets
  - Prompts for database, Redis, R2, OAuth, and URL secrets
  - Creates secrets in GCP Secret Manager

- **`set-oauth-secrets.sh`** - Quick script to update only OAuth-related secrets
  - Updates GitHub OAuth Client ID and Secret
  - Updates Frontend and Backend URLs

- **`set-vercel-env.sh`** - Sets environment variables in Vercel for frontend

### 💻 `dev/` - Local Development

Scripts for local development workflow:

- **`start-services.sh`** - Starts Docker services for local development
  - Starts PostgreSQL, Redis, Backend API, Commit Worker, and User Worker
  - Usage: `./scripts/dev/start-services.sh`

- **`stop-services.sh`** - Stops Docker services
  - Usage: `./scripts/dev/stop-services.sh`

- **`test-worker.sh`** - Test worker locally
  - Runs worker with local environment

- **`test-worker-gcp.sh`** - Test worker on GCP
  - Executes Cloud Run job manually for testing

- **`test-container-local.sh`** - Test Docker container locally

- **`quick-add-jobs.sh`** - Quickly add demo repositories to queue for testing

### 🐛 `debug/` - Debugging & Diagnostics

Scripts for debugging and monitoring:

- **`debug-commit-worker.sh`** - Comprehensive debugging tool for commit worker
  - Checks queue status, repository states, logs
  - Can manually trigger worker
  - Usage: `./scripts/debug/debug-commit-worker.sh [action]`

- **`debug-user-worker.sh`** - Comprehensive debugging tool for user worker
  - Similar to debug-commit-worker but for user worker
  - Usage: `./scripts/debug/debug-user-worker.sh [action]`

- **`check-scheduler-status.sh`** - Check Cloud Scheduler status
  - Shows scheduler state, schedule, and recent executions
  - Usage: `./scripts/debug/check-scheduler-status.sh`

- **`check-worker-job-status.sh`** - Check Cloud Run Job status and executions
  - Shows job configuration, recent executions, and logs
  - Usage: `./scripts/debug/check-worker-job-status.sh`

- **`view-prod-logs.sh`** - View production logs from GCP
  - View logs for API, commit-worker, user-worker, or all
  - Usage: `./scripts/debug/view-prod-logs.sh [api|commit-worker|user-worker|all|errors] [--tail|--recent]`

### 🛠️ `utils/` - Utility Scripts

General utility scripts:

- **`trigger-commit-worker.sh`** - Manually trigger commit worker job
  - Executes Cloud Run job immediately
  - Usage: `./scripts/utils/trigger-commit-worker.sh`

- **`cleanup-prod-jobs.sh`** - Clean up production jobs
  - Removes stuck or failed jobs from queue

- **`pre-commit.sh`** - Pre-commit hook script
  - Runs checks before committing code

## Usage Examples

### Local Development

```bash
# Start all services
./scripts/dev/start-services.sh

# Stop all services
./scripts/dev/stop-services.sh

# Test worker locally
./scripts/dev/test-worker.sh
```

### Deployment

```bash
# Initial setup
./scripts/deploy/setup.sh

# Create secrets
./scripts/secrets/create-secrets.sh

# Deploy all services
./scripts/deploy/deploy.sh

# Setup schedulers
./scripts/deploy/setup-two-worker-schedulers.sh
```

### Debugging

```bash
# Debug commit worker
./scripts/debug/debug-commit-worker.sh

# Check scheduler status
./scripts/debug/check-scheduler-status.sh

# View production logs
./scripts/debug/view-prod-logs.sh api --tail
```

## Notes

- All scripts should be run from the project root directory
- Most scripts require `PROJECT_ID` environment variable or gcloud config
- Scripts use relative paths, so they should be run from the project root
- Some scripts require GCP authentication (`gcloud auth login`)

## Adding New Scripts

When adding new scripts:

1. Place them in the appropriate subdirectory based on purpose
2. Update this README with a description
3. Ensure scripts use relative paths from project root
4. Add proper error handling and usage instructions
5. Update any documentation that references the script

