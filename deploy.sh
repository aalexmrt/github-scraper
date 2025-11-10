#!/bin/bash
# Deployment script for GitHub Scraper
# 
# Usage:
#   ./deploy.sh           # Deploy with patch version bump (default: 1.2.0 -> 1.2.1)
#   ./deploy.sh --patch   # Same as above (explicit patch bump)
#   ./deploy.sh --minor   # Deploy with minor version bump (1.2.0 -> 1.3.0)
#   ./deploy.sh --major   # Deploy with major version bump (1.2.0 -> 2.0.0)
#   ./deploy.sh --no-bump # Deploy without version bump (use current versions)
#
# Version bumping follows semantic versioning:
#   - Patch: bug fixes and regular deployments (default)
#   - Minor: new features (backward compatible)
#   - Major: breaking changes

set -e

PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
REPOSITORY=${REPOSITORY:-"github-scraper"}  # Artifact Registry repository name

# Check for version bump flags
SKIP_VERSION_BUMP=false
VERSION_BUMP_TYPE="patch"  # default: patch, options: patch, minor, major

if [[ "$1" == "--no-bump" ]]; then
  SKIP_VERSION_BUMP=true
  echo "⚠️  Version bumping skipped (--no-bump flag detected)"
elif [[ "$1" == "--patch" ]]; then
  VERSION_BUMP_TYPE="patch"
  echo "📦 Version bump type: patch"
elif [[ "$1" == "--minor" ]]; then
  VERSION_BUMP_TYPE="minor"
  echo "📦 Version bump type: minor"
elif [[ "$1" == "--major" ]]; then
  VERSION_BUMP_TYPE="major"
  echo "📦 Version bump type: major"
elif [[ -n "$1" ]]; then
  echo "❌ Unknown flag: $1"
  echo "Usage: ./deploy.sh [--patch|--minor|--major|--no-bump]"
  exit 1
else
  echo "📦 Version bump type: patch (default)"
fi

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
  
  # Get all tags for this image
  local image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${image_name}"
  local all_tags=$(gcloud artifacts docker images list ${image_path} \
    --format="value(version)" \
    --project=${PROJECT_ID} 2>/dev/null | grep -v "^$" || echo "")
  
  if [ -z "$all_tags" ]; then
    echo "  No existing images found, skipping cleanup"
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
    
    # Delete old version
    echo "  Deleting old version: ${version}"
    gcloud artifacts docker images delete ${image_path}:${version} \
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

# Get current versions from package.json
CURRENT_BACKEND_VERSION=$(cd backend && node -p "require('./package.json').version")
CURRENT_FRONTEND_VERSION=$(cd frontend && node -p "require('./package.json').version")

if [ "$SKIP_VERSION_BUMP" = false ]; then
  # Increment versions based on bump type
  NEW_BACKEND_VERSION=$(increment_version $CURRENT_BACKEND_VERSION $VERSION_BUMP_TYPE)
  NEW_FRONTEND_VERSION=$(increment_version $CURRENT_FRONTEND_VERSION $VERSION_BUMP_TYPE)

  echo "📦 Version bump..."
  echo "  Backend: ${CURRENT_BACKEND_VERSION} -> ${NEW_BACKEND_VERSION}"
  echo "  Frontend: ${CURRENT_FRONTEND_VERSION} -> ${NEW_FRONTEND_VERSION}"
  echo ""

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

  # Set versions for deployment
  BACKEND_VERSION=$NEW_BACKEND_VERSION
  FRONTEND_VERSION=$NEW_FRONTEND_VERSION
else
  # Use current versions without bumping
  BACKEND_VERSION=$CURRENT_BACKEND_VERSION
  FRONTEND_VERSION=$CURRENT_FRONTEND_VERSION
fi

echo "🚀 Starting deployment..."
echo "Backend version: ${BACKEND_VERSION}"
echo "Frontend version: ${FRONTEND_VERSION}"
echo ""

# Ensure Artifact Registry repository exists
ensure_artifact_registry_repo

# Configure Docker for Artifact Registry
echo "🔐 Configuring Docker for Artifact Registry..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Deploy Backend API
echo "📦 Building and deploying Backend API..."
cd backend
docker build -f Dockerfile.prod \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${BACKEND_VERSION} \
  --platform linux/amd64 \
  .
echo "📤 Pushing API image to Artifact Registry..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${BACKEND_VERSION}
cd ..

# Cleanup old API images
cleanup_old_images "api" "${BACKEND_VERSION}"

# Update cloudrun.yaml with version tag
echo "📝 Updating cloudrun.yaml with version ${BACKEND_VERSION}..."
sed -i '' "s|image: .*docker.pkg.dev/${PROJECT_ID}/.*/api:.*|image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${BACKEND_VERSION}|g" cloudrun.yaml

# Deploy to Cloud Run
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
echo "✅ Backend API deployed (version ${BACKEND_VERSION})"

# Deploy Worker
echo "📦 Building and deploying Worker..."
cd backend
docker build --no-cache -f Dockerfile.cloudrun-worker \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${BACKEND_VERSION} \
  --platform linux/amd64 \
  .
echo "📤 Pushing Worker image to Artifact Registry..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${BACKEND_VERSION}
cd ..

# Cleanup old Worker images
cleanup_old_images "worker" "${BACKEND_VERSION}"

# Update cloudrun-job.yaml with version tag
echo "📝 Updating cloudrun-job.yaml with version ${BACKEND_VERSION}..."
sed -i '' "s|image: .*docker.pkg.dev/${PROJECT_ID}/.*/worker:.*|image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${BACKEND_VERSION}|g" cloudrun-job.yaml

# Deploy to Cloud Run Jobs (use update instead of replace to avoid version conflicts)
gcloud run jobs update worker \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${BACKEND_VERSION} \
  --region=${REGION} \
  --project=${PROJECT_ID}
echo "✅ Worker deployed (version ${BACKEND_VERSION})"

# Deploy Frontend
echo "📦 Deploying Frontend..."
cd frontend
vercel --prod
cd ..
echo "✅ Frontend deployed"

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
if [ "$SKIP_VERSION_BUMP" = false ]; then
  echo "  ⚠️  Don't forget to commit the version changes:"
  echo "    git add backend/package.json frontend/package.json cloudrun.yaml cloudrun-job.yaml"
  echo "    git commit -m \"chore: bump version to ${BACKEND_VERSION} (backend) and ${FRONTEND_VERSION} (frontend)\""
  echo ""
fi
echo "Verify versions:"
echo "  Backend: curl https://api-sgmtwgzrlq-ue.a.run.app/version"
echo "  Frontend: https://github-scraper-psi.vercel.app (check footer)"
echo ""
echo "📊 Image storage:"
echo "  Repository: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
echo "  API: api:${BACKEND_VERSION}"
echo "  Worker: worker:${BACKEND_VERSION}"

