# Dynamic Configuration Injection Patterns

This document explains common patterns for injecting dynamic values (like GCP Project ID) into YAML configuration files.

## Pattern 1: `envsubst` (Recommended) ⭐

**Best for**: Simple environment variable substitution, widely supported

### How it works:

- Use `${VARIABLE}` placeholders in YAML
- Use `envsubst` to replace them at deployment time
- Template file stays clean and readable

### Implementation:

**1. Update `cloudrun.yaml` template:**

```yaml
containers:
  - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${IMAGE_TAG}
```

**2. In deployment script:**

```bash
export PROJECT_ID="personal-gcp-477623"
export REGION="us-east1"
export REPOSITORY="github-scraper"
export IMAGE_TAG="1.2.9"

# Generate actual YAML from template
envsubst < cloudrun.yaml.template > cloudrun.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
```

**Pros:**

- ✅ Clean, readable template files
- ✅ No file modification (generates new file)
- ✅ Standard tool, available on most systems
- ✅ Works with any environment variables

**Cons:**

- ❌ Requires separate template file (or use `cloudrun.yaml` as template)
- ❌ Need to ensure `envsubst` is installed

---

## Pattern 2: `sed` with Placeholders (Current Approach)

**Best for**: Quick fixes, when you want to modify files in-place

### How it works:

- Keep placeholders in YAML (like `YOUR_GCP_PROJECT_ID`)
- Use `sed` to replace them before deployment

### Implementation:

**1. Keep placeholders in `cloudrun.yaml`:**

```yaml
containers:
  - image: ${REGION}-docker.pkg.dev/YOUR_GCP_PROJECT_ID/github-scraper/api:latest
```

**2. In deployment script:**

```bash
PROJECT_ID="personal-gcp-477623"
REGION="us-east1"

# Replace placeholder
sed -i '' "s/YOUR_GCP_PROJECT_ID/${PROJECT_ID}/g" cloudrun.yaml
sed -i '' "s/YOUR_REGION/${REGION}/g" cloudrun.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}

# Restore placeholder (optional, for git)
sed -i '' "s/${PROJECT_ID}/YOUR_GCP_PROJECT_ID/g" cloudrun.yaml
```

**Pros:**

- ✅ Simple, no extra tools needed
- ✅ Works with existing files

**Cons:**

- ❌ Modifies files in-place (can cause git conflicts)
- ❌ Multiple `sed` commands needed for multiple variables
- ❌ Less readable than envsubst

---

## Pattern 3: `yq` (YAML Processor)

**Best for**: Complex YAML manipulation, when you need more control

### How it works:

- Use `yq` (YAML processor) to set specific values
- More powerful than `sed` for YAML structures

### Implementation:

**1. Keep placeholders or use default values:**

```yaml
containers:
  - image: us-east1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/github-scraper/api:latest
```

**2. In deployment script:**

```bash
PROJECT_ID="personal-gcp-477623"
REGION="us-east1"
IMAGE_TAG="1.2.9"

# Update image path using yq
yq eval ".spec.template.spec.containers[0].image = \"${REGION}-docker.pkg.dev/${PROJECT_ID}/github-scraper/api:${IMAGE_TAG}\"" \
  -i cloudrun.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
```

**Pros:**

- ✅ YAML-aware (won't break YAML structure)
- ✅ Can handle complex nested structures
- ✅ More precise than sed

**Cons:**

- ❌ Requires `yq` installation
- ❌ More verbose syntax
- ❌ Still modifies files in-place

---

## Pattern 4: Template Files + Generation

**Best for**: Production environments, CI/CD pipelines

### How it works:

- Keep `.template` files in repository
- Generate actual config files during deployment
- Never commit generated files

### Implementation:

**1. Create `cloudrun.yaml.template`:**

```yaml
containers:
  - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${IMAGE_TAG}
```

**2. Add to `.gitignore`:**

```
cloudrun.yaml
cloudrun-job.yaml
```

**3. In deployment script:**

```bash
export PROJECT_ID="${PROJECT_ID:-personal-gcp-477623}"
export REGION="${REGION:-us-east1}"
export REPOSITORY="${REPOSITORY:-github-scraper}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"

# Generate config from template
envsubst < cloudrun.yaml.template > cloudrun.yaml
envsubst < cloudrun-job.yaml.template > cloudrun-job.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
```

**Pros:**

- ✅ Clean separation (templates vs generated files)
- ✅ No risk of committing sensitive data
- ✅ Works well with CI/CD
- ✅ Can use environment variables with defaults

**Cons:**

- ❌ Need to manage template files
- ❌ Generated files not in git (but that's often desired)

---

## Pattern 5: `gcloud` with Substitution Variables

**Best for**: Cloud Build, when using Google Cloud Build

### How it works:

- Use Cloud Build substitution variables
- `gcloud` replaces variables during deployment

### Implementation:

**In `cloudbuild.yaml` (Cloud Build):**

```yaml
steps:
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'services'
      - 'replace'
      - 'cloudrun.yaml'
      - '--project=${PROJECT_ID}'
      - '--region=${_REGION}'
      - '--substitutions=_PROJECT_ID=${PROJECT_ID},_REGION=${_REGION}'
```

**Note**: This is more for Cloud Build, less useful for local scripts.

---

## Pattern 6: Environment Variables with Defaults

**Best for**: Making scripts flexible while keeping templates clean

### Implementation:

**In deployment script:**

```bash
#!/bin/bash
set -e

# Allow override via environment variables, with sensible defaults
PROJECT_ID="${PROJECT_ID:-personal-gcp-477623}"
REGION="${REGION:-us-east1}"
REPOSITORY="${REPOSITORY:-github-scraper}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Use envsubst to replace variables
export PROJECT_ID REGION REPOSITORY IMAGE_TAG

# Generate config
envsubst < cloudrun.yaml.template > cloudrun.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
```

**Usage:**

```bash
# Use defaults
./deploy.sh

# Override project ID
PROJECT_ID=my-other-project ./deploy.sh

# Override multiple values
PROJECT_ID=prod-project REGION=us-west1 ./deploy.sh
```

---

## Recommended Approach for This Project

Based on your current setup, I recommend **Pattern 1 (envsubst)** or **Pattern 4 (Template Files)**:

### Option A: Quick Fix (envsubst with existing files)

1. Update `cloudrun.yaml` to use `${VARIABLE}` syntax
2. Use `envsubst` in `deploy.sh` to generate a temp file
3. Deploy from temp file

### Option B: Best Practice (Template Files)

1. Rename `cloudrun.yaml` → `cloudrun.yaml.template`
2. Add `cloudrun.yaml` to `.gitignore`
3. Generate `cloudrun.yaml` in `deploy.sh` using `envsubst`
4. Deploy from generated file

This keeps your repository clean and prevents accidentally committing project-specific values.

---

## Example: Updated `deploy.sh` with envsubst

```bash
# At the top of deploy.sh
PROJECT_ID="${PROJECT_ID:-personal-gcp-477623}"
REGION="${REGION:-us-east1}"
REPOSITORY="${REPOSITORY:-github-scraper}"

# Export for envsubst
export PROJECT_ID REGION REPOSITORY BACKEND_VERSION

# Before deployment, generate actual YAML
echo "📝 Generating cloudrun.yaml from template..."
envsubst < cloudrun.yaml.template > cloudrun.yaml

# Deploy
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}

# Cleanup (optional)
rm cloudrun.yaml
```

---

## Security Considerations

1. **Never commit generated files** with real project IDs
2. **Use `.gitignore`** for generated config files
3. **Use environment variables** instead of hardcoding
4. **Use secret management** (GCP Secret Manager) for sensitive values
5. **Template files are safe** to commit (they contain placeholders)

---

## Tools Installation

### envsubst (usually pre-installed)

```bash
# macOS
brew install gettext  # includes envsubst

# Linux (usually pre-installed)
# If not: apt-get install gettext-base

# Verify
envsubst --version
```

### yq (optional, for advanced use)

```bash
# macOS
brew install yq

# Linux
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
chmod +x /usr/local/bin/yq
```
