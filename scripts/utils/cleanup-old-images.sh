#!/bin/bash
# Cleanup old Docker images from GCP Artifact Registry
# Keeps: Last 3 versions + latest tag + currently deployed version
# Usage: ./cleanup-old-images.sh <service> [--execute]
#        ./cleanup-old-images.sh --all [--execute]

# Don't use set -e here - we want to handle errors gracefully
set -o pipefail  # Fail if any command in a pipeline fails

# Configuration
KEEP_VERSIONS=3  # Number of recent versions to keep
EXECUTE=false
CLEANUP_ALL=false
SERVICE=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --execute)
      EXECUTE=true
      shift
      ;;
    --all)
      CLEANUP_ALL=true
      shift
      ;;
    api|commit-worker|user-worker)
      SERVICE=$1
      shift
      ;;
    *)
      echo -e "${RED}❌ Error: Unknown argument: $1${NC}"
      echo ""
      echo "Usage: $0 <service> [--execute]"
      echo "       $0 --all [--execute]"
      echo ""
      echo "Services: api, commit-worker, user-worker"
      echo ""
      echo "Examples:"
      echo "  $0 api              # Dry-run for api service"
      echo "  $0 api --execute    # Execute cleanup for api service"
      echo "  $0 --all            # Dry-run for all services"
      echo "  $0 --all --execute  # Execute cleanup for all services"
      exit 1
      ;;
  esac
done

# Validate arguments
if [ "$CLEANUP_ALL" = false ] && [ -z "$SERVICE" ]; then
  echo -e "${RED}❌ Error: Service name or --all required${NC}"
  echo ""
  echo "Usage: $0 <service> [--execute]"
  echo "       $0 --all [--execute]"
  exit 1
fi

# Get configuration from environment
PROJECT_ID="${PROJECT_ID:-${GCP_PROJECT_ID:-YOUR_GCP_PROJECT_ID}}"
REGION="${REGION:-us-east1}"
REPOSITORY="${REPOSITORY:-github-scraper}"

# Validate PROJECT_ID
if [ "$PROJECT_ID" = "YOUR_GCP_PROJECT_ID" ]; then
  echo -e "${RED}❌ Error: PROJECT_ID is not set!${NC}"
  echo "   Please set it as an environment variable:"
  echo "   export PROJECT_ID=\"your-actual-project-id\""
  exit 1
fi

# Image registry path
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"

# Function to compare semantic versions
# Returns: 0 if v1 == v2, 1 if v1 > v2, 2 if v1 < v2
compare_versions() {
  local v1=$1
  local v2=$2
  
  # Handle 'latest' tag - exclude from sorting
  if [ "$v1" = "latest" ] || [ "$v2" = "latest" ]; then
    return 0  # Don't compare with latest
  fi
  
  # Split version into parts
  IFS='.' read -ra V1_PARTS <<< "$v1"
  IFS='.' read -ra V2_PARTS <<< "$v2"
  
  # Compare each part
  local max_parts=${#V1_PARTS[@]}
  if [ ${#V2_PARTS[@]} -gt $max_parts ]; then
    max_parts=${#V2_PARTS[@]}
  fi
  
  for ((i=0; i<max_parts; i++)); do
    local part1=${V1_PARTS[$i]:-0}
    local part2=${V2_PARTS[$i]:-0}
    
    # Remove any non-numeric suffix (e.g., "1.2.3-beta" -> "1.2.3")
    part1=${part1%%[^0-9]*}
    part2=${part2%%[^0-9]*}
    
    # Default to 0 if empty
    part1=${part1:-0}
    part2=${part2:-0}
    
    if [ "$part1" -gt "$part2" ]; then
      return 1
    elif [ "$part1" -lt "$part2" ]; then
      return 2
    fi
  done
  
  return 0  # Equal
}

# Function to sort versions (newest first)
# Uses sort -V if available (GNU sort), otherwise uses custom comparison
sort_versions() {
  local versions=("$@")
  
  # Filter out 'latest' from sorting (we handle it separately)
  local versions_to_sort=()
  for v in "${versions[@]}"; do
    if [ "$v" != "latest" ]; then
      versions_to_sort+=("$v")
    fi
  done
  
  # Try using sort -V (GNU sort version sorting) - reverse for newest first
  if command -v sort >/dev/null 2>&1 && sort -V <<< "1.0.0" >/dev/null 2>&1; then
    # Use GNU sort -V (version sort) and reverse for newest first
    printf '%s\n' "${versions_to_sort[@]}" | sort -V -r
  else
    # Fallback: Simple bubble sort (newest first)
    local sorted=("${versions_to_sort[@]}")
    local n=${#sorted[@]}
    local temp
    
    for ((i=0; i<n-1; i++)); do
      for ((j=0; j<n-i-1; j++)); do
        compare_versions "${sorted[j]}" "${sorted[j+1]}"
        case $? in
          2) # v1 < v2, swap (we want newest first)
            temp="${sorted[j]}"
            sorted[j]="${sorted[j+1]}"
            sorted[j+1]="$temp"
            ;;
        esac
      done
    done
    
    printf '%s\n' "${sorted[@]}"
  fi
}

# Function to get currently deployed version
get_deployed_version() {
  local service=$1
  local deployed_version=""
  
  echo -e "${BLUE}🔍 Checking currently deployed version for ${service}...${NC}" >&2
  
  if [ "$service" = "api" ]; then
    # Cloud Run Service
    image_url=$(gcloud run services describe "$service" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || echo "")
  else
    # Cloud Run Job
    image_url=$(gcloud run jobs describe "$service" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || echo "")
  fi
  
  # Extract version from image URL (everything after last colon)
  if [ -n "$image_url" ]; then
    deployed_version="${image_url##*:}"
  fi
  
  if [ -n "$deployed_version" ] && [ "$deployed_version" != "latest" ]; then
    echo "$deployed_version"
  else
    echo ""
  fi
}

# Function to list all image versions (excluding 'latest')
list_image_versions() {
  local service=$1
  local versions=()
  
  # List all tags for the service
  # Format: us-east1-docker.pkg.dev/project/repo/service:version
  local image_list=$(gcloud artifacts docker images list \
    "${REGISTRY}/${service}" \
    --project="${PROJECT_ID}" \
    --format="value(package)" 2>/dev/null || true)
  
  # Extract version from image path (everything after the last colon)
  # Filter out 'latest' tag
  while IFS= read -r image_path; do
    if [ -n "$image_path" ]; then
      # Extract version (everything after last colon)
      local version="${image_path##*:}"
      if [ "$version" != "latest" ] && [ -n "$version" ]; then
        versions+=("$version")
      fi
    fi
  done <<< "$image_list"
  
  printf '%s\n' "${versions[@]}"
}

# Function to cleanup a single service
cleanup_service() {
  local service=$1
  
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}🧹 Cleaning up images for service: ${service}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Get all versions
  local all_versions=($(list_image_versions "$service"))
  
  if [ ${#all_versions[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No versions found for ${service}${NC}"
    return 0
  fi
  
  echo -e "${GREEN}📋 Found ${#all_versions[@]} versions${NC}"
  
  # Get currently deployed version
  local deployed_version=$(get_deployed_version "$service")
  
  # Sort versions (newest first)
  local sorted_versions=($(sort_versions "${all_versions[@]}"))
  
  # Determine versions to keep
  local versions_to_keep=()
  
  # Always keep latest (handled separately)
  versions_to_keep+=("latest")
  
  # Keep currently deployed version (if not already in top 3)
  if [ -n "$deployed_version" ]; then
    echo -e "${GREEN}📍 Currently deployed: ${deployed_version}${NC}"
    versions_to_keep+=("$deployed_version")
  else
    echo -e "${YELLOW}⚠️  Could not determine deployed version (may not be deployed yet)${NC}"
  fi
  
  # Keep top KEEP_VERSIONS versions
  local keep_count=0
  for version in "${sorted_versions[@]}"; do
    # Skip if already in keep list
    local already_kept=false
    for kept in "${versions_to_keep[@]}"; do
      if [ "$version" = "$kept" ]; then
        already_kept=true
        break
      fi
    done
    
    if [ "$already_kept" = false ] && [ $keep_count -lt $KEEP_VERSIONS ]; then
      versions_to_keep+=("$version")
      ((keep_count++))
    fi
  done
  
  # Determine versions to delete
  local versions_to_delete=()
  for version in "${sorted_versions[@]}"; do
    local should_keep=false
    for kept in "${versions_to_keep[@]}"; do
      if [ "$version" = "$kept" ]; then
        should_keep=true
        break
      fi
    done
    
    if [ "$should_keep" = false ]; then
      versions_to_delete+=("$version")
    fi
  done
  
  # Display summary
  echo ""
  echo -e "${GREEN}✅ Versions to keep (${#versions_to_keep[@]}):${NC}"
  for version in "${versions_to_keep[@]}"; do
    echo -e "   ${GREEN}✓${NC} ${version}"
  done
  
  if [ ${#versions_to_delete[@]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ No versions to delete${NC}"
    return 0
  fi
  
  echo ""
  echo -e "${YELLOW}🗑️  Versions to delete (${#versions_to_delete[@]}):${NC}"
  for version in "${versions_to_delete[@]}"; do
    echo -e "   ${YELLOW}✗${NC} ${version}"
  done
  
  # Execute or dry-run
  if [ "$EXECUTE" = true ]; then
    echo ""
    echo -e "${RED}⚠️  EXECUTING DELETION...${NC}"
    
    local deleted_count=0
    local failed_count=0
    
    for version in "${versions_to_delete[@]}"; do
      echo -e "${BLUE}🗑️  Deleting ${service}:${version}...${NC}"
      if gcloud artifacts docker images delete \
        "${REGISTRY}/${service}:${version}" \
        --project="${PROJECT_ID}" \
        --quiet 2>&1; then
        echo -e "${GREEN}   ✅ Deleted ${version}${NC}"
        ((deleted_count++))
      else
        echo -e "${RED}   ❌ Failed to delete ${version}${NC}"
        ((failed_count++))
        # Continue with next version even if deletion fails
      fi
    done
    
    echo ""
    if [ $failed_count -eq 0 ]; then
      echo -e "${GREEN}✅ Cleanup completed: ${deleted_count} versions deleted${NC}"
    else
      echo -e "${YELLOW}⚠️  Cleanup completed with errors: ${deleted_count} deleted, ${failed_count} failed${NC}"
    fi
  else
    echo ""
    echo -e "${YELLOW}🔍 DRY-RUN MODE: No images were deleted${NC}"
    echo -e "${YELLOW}   Add --execute flag to actually delete images${NC}"
  fi
}

# Main execution
if [ "$CLEANUP_ALL" = true ]; then
  # Cleanup all services
  echo -e "${BLUE}🧹 Starting cleanup for all services...${NC}"
  echo ""
  
  cleanup_service "api"
  cleanup_service "commit-worker"
  cleanup_service "user-worker"
  
  echo ""
  echo -e "${GREEN}✅ Cleanup process completed for all services${NC}"
else
  # Cleanup single service
  cleanup_service "$SERVICE"
fi

