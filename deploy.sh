#!/bin/bash
# Deployment script for GitHub Scraper
# 
# Usage:
#   ./deploy.sh                           # Deploy all services with patch version bump (default)
#   ./deploy.sh --patch                   # Deploy all services with patch version bump
#   ./deploy.sh --minor                   # Deploy all services with minor version bump
#   ./deploy.sh --major                   # Deploy all services with major version bump
#   ./deploy.sh --no-bump                 # Deploy all services without version bump
#   ./deploy.sh api                       # Deploy only API service (with patch bump)
#   ./deploy.sh api frontend              # Deploy API and Frontend services
#   ./deploy.sh --no-bump commit-worker   # Deploy commit-worker without version bump
#   ./deploy.sh --minor api user-worker   # Deploy API and user-worker with minor bump
#
# Available services:
#   - api              Backend API (Cloud Run service)
#   - commit-worker    Commit Worker (Cloud Run Job)
#   - user-worker      User Worker (Cloud Run Job)
#   - frontend         Frontend (Vercel)
#
# Version bumping follows semantic versioning:
#   - Patch: bug fixes and regular deployments (default)
#   - Minor: new features (backward compatible)
#   - Major: breaking changes

set -e

PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"
REPOSITORY=${REPOSITORY:-"github-scraper"}  # Artifact Registry repository name

# Validate that PROJECT_ID is set to a real value (not placeholder)
if [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is not set!"
  echo "   Please set it as an environment variable:"
  echo "   export PROJECT_ID=\"your-actual-project-id\""
  echo "   Or run: PROJECT_ID=\"your-actual-project-id\" ./deploy.sh"
  exit 1
fi

# Parse arguments - separate version flags from service names
SKIP_VERSION_BUMP=false
VERSION_BUMP_TYPE="patch"  # default: patch, options: patch, minor, major
SERVICES_TO_DEPLOY=()

# Valid service names
VALID_SERVICES=("api" "commit-worker" "user-worker" "frontend")

# Parse arguments
for arg in "$@"; do
  case $arg in
    --no-bump)
      SKIP_VERSION_BUMP=true
      ;;
    --patch)
      VERSION_BUMP_TYPE="patch"
      ;;
    --minor)
      VERSION_BUMP_TYPE="minor"
      ;;
    --major)
      VERSION_BUMP_TYPE="major"
      ;;
    *)
      # Check if it's a valid service name
      if [[ " ${VALID_SERVICES[@]} " =~ " ${arg} " ]]; then
        SERVICES_TO_DEPLOY+=("$arg")
      else
        echo "❌ Unknown argument: $arg"
        echo ""
        echo "Usage: ./deploy.sh [--patch|--minor|--major|--no-bump] [service1] [service2] ..."
        echo ""
        echo "Available services: ${VALID_SERVICES[*]}"
        echo ""
        echo "Examples:"
        echo "  ./deploy.sh                           # Deploy all services"
        echo "  ./deploy.sh api                       # Deploy only API"
        echo "  ./deploy.sh api frontend              # Deploy API and Frontend"
        echo "  ./deploy.sh --no-bump commit-worker   # Deploy commit-worker without version bump"
        exit 1
      fi
      ;;
  esac
done

# If no services specified, deploy all
if [ ${#SERVICES_TO_DEPLOY[@]} -eq 0 ]; then
  SERVICES_TO_DEPLOY=("${VALID_SERVICES[@]}")
  echo "📦 Deploying all services"
else
  echo "📦 Deploying services: ${SERVICES_TO_DEPLOY[*]}"
fi

# Display version bump info
if [ "$SKIP_VERSION_BUMP" = true ]; then
  echo "⚠️  Version bumping skipped (--no-bump flag detected)"
else
  echo "📦 Version bump type: ${VERSION_BUMP_TYPE}"
fi
echo ""

# Function to increment version based on type
increment_version() {
  local version=$1
  local bump_type=$2
  
  # Parse version components (handles versions like "1.2.0" or "0.3.0")
  local major=$(echo $version | cut -d. -f1)
  local minor=$(echo $version | cut -d. -f2)
  local patch=$(echo $version | cut -d. -f3)
  
  # Ensure we have valid numbers (handle edge cases)
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}
  
  case $bump_type in
    "major")
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    "minor")
      minor=$((minor + 1))
      patch=0
      ;;
    "patch"|*)
      patch=$((patch + 1))
      ;;
  esac
  
  echo "${major}.${minor}.${patch}"
}

# Function to cleanup old image versions, keeping only the latest
cleanup_old_images() {
  local image_name=$1
  local keep_version=$2
  
  echo "🧹 Cleaning up old versions of ${image_name}..."
  
  # Get all tags for this image (use tags list, not images list, to get version tags)
  local image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${image_name}"
  local all_tags=$(gcloud artifacts docker tags list ${image_path} \
    --format="value(tag)" \
    --project=${PROJECT_ID} 2>/dev/null | grep -v "^$" || echo "")
  
  if [ -z "$all_tags" ]; then
    echo "  No existing tags found, skipping cleanup"
    return
  fi
  
  # Sort versions (semantic versioning aware)
  local versions=$(echo "$all_tags" | sort -V -r)
  
  local deleted_count=0
  for version in $versions; do
    # Skip the version we're keeping
    if [ "$version" = "$keep_version" ]; then
      echo "  Keeping version ${version} (current deployment)"
      continue
    fi
    
    # Delete old version by tag
    echo "  Deleting old version: ${version}"
    gcloud artifacts docker tags delete ${image_path}:${version} \
      --project=${PROJECT_ID} \
      --quiet 2>/dev/null || true
    
    deleted_count=$((deleted_count + 1))
  done
  
  if [ $deleted_count -gt 0 ]; then
    echo "  ✅ Cleaned up ${deleted_count} old version(s)"
  else
    echo "  ℹ️  No old versions to clean up"
  fi
}

# Ensure Artifact Registry repository exists
ensure_artifact_registry_repo() {
  echo "🔍 Checking Artifact Registry repository..."
  if ! gcloud artifacts repositories describe ${REPOSITORY} \
    --location=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    echo "📦 Creating Artifact Registry repository: ${REPOSITORY}"
    gcloud artifacts repositories create ${REPOSITORY} \
      --repository-format=docker \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --description="Docker images for GitHub Scraper"
    echo "  ✅ Repository created"
  else
    echo "  ✅ Repository already exists"
  fi
}

# Ensure variables are exported for envsubst (must be done after validation)
export PROJECT_ID REGION REPOSITORY

# Check if envsubst is available
if ! command -v envsubst &> /dev/null; then
  echo "❌ Error: envsubst is not installed"
  echo "   Install it with: brew install gettext (macOS) or apt-get install gettext-base (Linux)"
  exit 1
fi

# Function to check if a service should be deployed
should_deploy_service() {
  local service=$1
  for s in "${SERVICES_TO_DEPLOY[@]}"; do
    if [ "$s" = "$service" ]; then
      return 0
    fi
  done
  return 1
}

# Function to deploy API service
deploy_api() {
  local version=$1
  echo "📦 Building and deploying Backend API..."
  cd backend
  docker build -f Dockerfile.prod \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${version} \
    --platform linux/amd64 \
    .
  echo "📤 Pushing API image to Artifact Registry..."
  docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${version}
  cd ..

  # Cleanup old API images
  cleanup_old_images "api" "${version}"

  # Generate cloudrun.yaml from template using envsubst
  echo "📝 Generating cloudrun.yaml from template..."
  export IMAGE_TAG=${version}
  envsubst < cloudrun.yaml.template > cloudrun.yaml

  # Deploy to Cloud Run
  gcloud run services replace cloudrun.yaml \
    --project=${PROJECT_ID} \
    --region=${REGION}
  echo "✅ Backend API deployed (version ${version})"
}

# Function to deploy Commit Worker
deploy_commit_worker() {
  local version=$1
  echo "📦 Building and deploying Commit Worker..."
  cd backend
  docker build --no-cache -f Dockerfile.cloudrun-commit-worker \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:${version} \
    --platform linux/amd64 \
    .
  echo "📤 Pushing Commit Worker image to Artifact Registry..."
  docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/commit-worker:${version}
  cd ..

  # Generate cloudrun-job-commit-worker.yaml from template using envsubst
  echo "📝 Generating cloudrun-job-commit-worker.yaml from template..."
  export JOB_NAME="commit-worker"
  export IMAGE_NAME="commit-worker"
  export IMAGE_TAG=${version}
  envsubst < cloudrun-job.yaml.template > cloudrun-job-commit-worker.yaml

  # Deploy Commit Worker to Cloud Run Jobs
  if gcloud run jobs describe commit-worker \
    --region=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    echo "  Updating existing commit-worker job..."
    gcloud run jobs replace cloudrun-job-commit-worker.yaml \
      --project=${PROJECT_ID} \
      --region=${REGION}
  else
    echo "  Creating new commit-worker job..."
    gcloud run jobs replace cloudrun-job-commit-worker.yaml \
      --project=${PROJECT_ID} \
      --region=${REGION}
  fi

  # Cleanup old Commit Worker images (after deployment to avoid validation errors)
  cleanup_old_images "commit-worker" "${version}"
  echo "✅ Commit Worker deployed (version ${version})"
}

# Function to deploy User Worker
deploy_user_worker() {
  local version=$1
  echo "📦 Building and deploying User Worker..."
  cd backend
  docker build --no-cache -f Dockerfile.cloudrun-user-worker \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:${version} \
    --platform linux/amd64 \
    .
  echo "📤 Pushing User Worker image to Artifact Registry..."
  docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/user-worker:${version}
  cd ..

  # Generate cloudrun-job-user-worker.yaml from template using envsubst
  echo "📝 Generating cloudrun-job-user-worker.yaml from template..."
  export JOB_NAME="user-worker"
  export IMAGE_NAME="user-worker"
  export IMAGE_TAG=${version}
  envsubst < cloudrun-job.yaml.template > cloudrun-job-user-worker.yaml

  # Deploy User Worker to Cloud Run Jobs
  if gcloud run jobs describe user-worker \
    --region=${REGION} \
    --project=${PROJECT_ID} &>/dev/null; then
    echo "  Updating existing user-worker job..."
    gcloud run jobs replace cloudrun-job-user-worker.yaml \
      --project=${PROJECT_ID} \
      --region=${REGION}
  else
    echo "  Creating new user-worker job..."
    gcloud run jobs replace cloudrun-job-user-worker.yaml \
      --project=${PROJECT_ID} \
      --region=${REGION}
  fi

  # Cleanup old User Worker images (after deployment to avoid validation errors)
  cleanup_old_images "user-worker" "${version}"
  echo "✅ User Worker deployed (version ${version})"
}

# Function to deploy Frontend
deploy_frontend() {
  echo "📦 Deploying Frontend..."
  cd frontend
  vercel --prod
  cd ..
  echo "✅ Frontend deployed"
}

# Determine which backend services need version bumping
NEEDS_BACKEND_VERSION=false
for service in "${SERVICES_TO_DEPLOY[@]}"; do
  if [[ "$service" == "api" || "$service" == "commit-worker" || "$service" == "user-worker" ]]; then
    NEEDS_BACKEND_VERSION=true
    break
  fi
done

NEEDS_FRONTEND_VERSION=false
for service in "${SERVICES_TO_DEPLOY[@]}"; do
  if [[ "$service" == "frontend" ]]; then
    NEEDS_FRONTEND_VERSION=true
    break
  fi
done

# Get current versions from package.json
CURRENT_BACKEND_VERSION=$(cd backend && node -p "require('./package.json').version")
CURRENT_FRONTEND_VERSION=$(cd frontend && node -p "require('./package.json').version")

# Handle version bumping
BACKEND_VERSION=$CURRENT_BACKEND_VERSION
FRONTEND_VERSION=$CURRENT_FRONTEND_VERSION

if [ "$SKIP_VERSION_BUMP" = false ] && [ "$NEEDS_BACKEND_VERSION" = true ]; then
  # Increment backend version based on bump type
  NEW_BACKEND_VERSION=$(increment_version $CURRENT_BACKEND_VERSION $VERSION_BUMP_TYPE)
  BACKEND_VERSION=$NEW_BACKEND_VERSION
  
  echo "📦 Backend version bump: ${CURRENT_BACKEND_VERSION} -> ${NEW_BACKEND_VERSION}"
  
  # Update backend package.json
  echo "📝 Updating backend/package.json..."
  cd backend
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '${NEW_BACKEND_VERSION}';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  cd ..
fi

if [ "$SKIP_VERSION_BUMP" = false ] && [ "$NEEDS_FRONTEND_VERSION" = true ]; then
  # Increment frontend version based on bump type
  NEW_FRONTEND_VERSION=$(increment_version $CURRENT_FRONTEND_VERSION $VERSION_BUMP_TYPE)
  FRONTEND_VERSION=$NEW_FRONTEND_VERSION
  
  echo "📦 Frontend version bump: ${CURRENT_FRONTEND_VERSION} -> ${NEW_FRONTEND_VERSION}"
  
  # Update frontend package.json
  echo "📝 Updating frontend/package.json..."
  cd frontend
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '${NEW_FRONTEND_VERSION}';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  cd ..
fi

echo ""
echo "🚀 Starting deployment..."
if [ "$NEEDS_BACKEND_VERSION" = true ]; then
  echo "Backend version: ${BACKEND_VERSION}"
fi
if [ "$NEEDS_FRONTEND_VERSION" = true ]; then
  echo "Frontend version: ${FRONTEND_VERSION}"
fi
echo ""

# Ensure Artifact Registry repository exists (only needed for backend services)
if [ "$NEEDS_BACKEND_VERSION" = true ]; then
  ensure_artifact_registry_repo
  
  # Configure Docker for Artifact Registry
  echo "🔐 Configuring Docker for Artifact Registry..."
  gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
fi

# Deploy services based on SERVICES_TO_DEPLOY array
for service in "${SERVICES_TO_DEPLOY[@]}"; do
  case $service in
    api)
      deploy_api "$BACKEND_VERSION"
      ;;
    commit-worker)
      deploy_commit_worker "$BACKEND_VERSION"
      ;;
    user-worker)
      deploy_user_worker "$BACKEND_VERSION"
      ;;
    frontend)
      deploy_frontend
      ;;
  esac
  echo ""
done

echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
if [ "$SKIP_VERSION_BUMP" = false ]; then
  files_to_commit=()
  if [ "$NEEDS_BACKEND_VERSION" = true ]; then
    files_to_commit+=("backend/package.json")
  fi
  if [ "$NEEDS_FRONTEND_VERSION" = true ]; then
    files_to_commit+=("frontend/package.json")
  fi
  
  if [ ${#files_to_commit[@]} -gt 0 ]; then
    echo "  ⚠️  Don't forget to commit the version changes:"
    echo "    git add ${files_to_commit[*]}"
    if [ "$NEEDS_BACKEND_VERSION" = true ] && [ "$NEEDS_FRONTEND_VERSION" = true ]; then
      echo "    git commit -m \"chore: bump version to ${BACKEND_VERSION} (backend) and ${FRONTEND_VERSION} (frontend)\""
    elif [ "$NEEDS_BACKEND_VERSION" = true ]; then
      echo "    git commit -m \"chore: bump backend version to ${BACKEND_VERSION}\""
    else
      echo "    git commit -m \"chore: bump frontend version to ${FRONTEND_VERSION}\""
    fi
    echo ""
    echo "  ⚠️  Note: Generated YAML files (cloudrun.yaml, cloudrun-job-*.yaml) are ignored by git"
    echo "     They are generated from templates and should not be committed."
    echo ""
  fi
fi
echo "Verify versions:"
if should_deploy_service "api"; then
  echo "  Backend: curl https://your-backend-url.run.app/version"
fi
if should_deploy_service "frontend"; then
  echo "  Frontend: https://your-app.vercel.app (check footer)"
fi
echo ""
if [ "$NEEDS_BACKEND_VERSION" = true ]; then
  echo "📊 Image storage:"
  echo "  Repository: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
  if should_deploy_service "api"; then
    echo "  API: api:${BACKEND_VERSION}"
  fi
  if should_deploy_service "commit-worker"; then
    echo "  Commit Worker: commit-worker:${BACKEND_VERSION}"
  fi
  if should_deploy_service "user-worker"; then
    echo "  User Worker: user-worker:${BACKEND_VERSION}"
  fi
fi

