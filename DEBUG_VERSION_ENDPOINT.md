# Debugging Guide: /version Endpoint 404 Error

## 🔍 Issue
The `/version` endpoint returns 404 after deployment, even though it exists in the code.

## 📋 Step-by-Step Debugging Instructions

### Step 1: Verify Code is Correct

```bash
# Check that the endpoint exists in the source code
grep -A 5 "app.get('/version'" backend/src/index.ts

# Should show:
# app.get('/version', async (request, reply) => {
#   const packageJson = require('../package.json');
#   return reply.status(200).send({
#     api: packageJson.version,
#     worker: packageJson.version,
#   });
# });
```

### Step 2: Test Locally First

```bash
# Start the backend locally
cd backend
npm run dev

# In another terminal, test the endpoint
curl http://localhost:3000/version

# Should return: {"api":"1.0.0","worker":"1.0.0"}
```

### Step 3: Verify Build Includes the Endpoint

```bash
# Check if the compiled JavaScript includes the route
cd backend
npm run build

# Check the compiled output
grep -r "version" dist/index.js || echo "Not found in compiled code"

# Or check the route registration
grep -A 3 "/version" dist/index.js
```

### Step 4: Check Docker Build Process

```bash
# Build the Docker image locally and inspect
cd backend
docker build -f Dockerfile.prod -t test-api:local --platform linux/amd64 .

# Check if the built files are in the image
docker run --rm test-api:local ls -la dist/ | grep index.js

# Check if package.json is accessible
docker run --rm test-api:local cat package.json | grep version
```

### Step 5: Verify Current Deployment Status

```bash
# Check which revision is currently running
gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(status.latestReadyRevisionName,status.url)"

# Check the image being used
gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(spec.template.spec.containers[0].image)"
```

### Step 6: Check Cloud Run Logs

```bash
# View recent logs to see if there are any errors
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=50 \
  --project=personal-gcp-477623 \
  --format="table(timestamp,textPayload)" \
  --freshness=10m

# Look for:
# - Route registration messages
# - Any errors during startup
# - Requests to /version endpoint
```

### Step 7: Test the Endpoint Directly

```bash
# Test health endpoint (should work)
curl https://api-sgmtwgzrlq-ue.a.run.app/health

# Test version endpoint (currently failing)
curl -v https://api-sgmtwgzrlq-ue.a.run.app/version

# Check what routes are registered (if possible)
curl https://api-sgmtwgzrlq-ue.a.run.app/
```

### Step 8: Force a Fresh Deployment

```bash
# Rebuild with no cache to ensure latest code
cd backend
docker build --no-cache -f Dockerfile.prod \
  -t gcr.io/personal-gcp-477623/api:latest \
  --platform linux/amd64 .

# Push the image
docker push gcr.io/personal-gcp-477623/api:latest

# Force update the service (even if config hasn't changed)
gcloud run services update api \
  --image=gcr.io/personal-gcp-477623/api:latest \
  --region=us-east1 \
  --project=personal-gcp-477623

# Wait for deployment to complete
gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(status.conditions[0].status)"

# Test again after waiting 30 seconds
sleep 30
curl https://api-sgmtwgzrlq-ue.a.run.app/version
```

### Step 9: Check Route Registration Order

```bash
# Verify the route is registered before any catch-all routes
# Check backend/src/index.ts - /version should be registered early

# Look for any route conflicts or middleware that might intercept it
grep -n "app.get\|app.post\|app.all" backend/src/index.ts | head -20
```

### Step 10: Test Inside the Container

```bash
# Get the current image
IMAGE=$(gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(spec.template.spec.containers[0].image)")

# Run a shell in the container
docker run --rm -it ${IMAGE} sh

# Inside the container:
# ls -la dist/
# cat dist/index.js | grep -A 5 version
# cat package.json | grep version
# node -e "console.log(require('./package.json').version)"
```

### Step 11: Check for TypeScript Compilation Issues

```bash
cd backend

# Check TypeScript compilation
npm run build

# Look for any errors or warnings
# Check if dist/index.js exists and has content
ls -lh dist/index.js

# Verify the route is in the compiled output
node -e "
const fs = require('fs');
const content = fs.readFileSync('dist/index.js', 'utf8');
if (content.includes('/version')) {
  console.log('✅ /version route found in compiled code');
  const match = content.match(/app\.get\(['\"]\/version['\"][^}]+}/);
  if (match) console.log('Route definition:', match[0].substring(0, 200));
} else {
  console.log('❌ /version route NOT found in compiled code');
}
"
```

### Step 12: Verify Package.json Path

```bash
# Check if package.json exists in the right location
cd backend
ls -la package.json

# Test require path
node -e "console.log(require('./package.json').version)"

# Check if it works from dist/ directory
cd dist
node -e "console.log(require('../package.json').version)"
```

## 🎯 Quick Diagnostic Script

Run this script to check everything at once:

```bash
./debug-version-endpoint.sh
```

Or run manually:

```bash
#!/bin/bash
echo "=== Checking /version endpoint ==="
echo ""

echo "1. Source code check:"
grep -A 3 "app.get('/version'" backend/src/index.ts && echo "✅ Found in source" || echo "❌ NOT in source"

echo ""
echo "2. Compiled code check:"
cd backend
npm run build > /dev/null 2>&1
grep -q "/version" dist/index.js && echo "✅ Found in compiled code" || echo "❌ NOT in compiled code"

echo ""
echo "3. Package.json version:"
node -p "require('./package.json').version"

echo ""
echo "4. Testing locally (if server is running):"
curl -s http://localhost:3000/version 2>/dev/null && echo "✅ Local endpoint works" || echo "⚠️  Local server not running"

echo ""
echo "5. Testing deployed endpoint:"
curl -s https://api-sgmtwgzrlq-ue.a.run.app/version | head -c 100
echo ""

echo ""
echo "6. Current Cloud Run revision:"
gcloud run services describe api \
  --region=us-east1 \
  --project=personal-gcp-477623 \
  --format="value(status.latestReadyRevisionName)" 2>/dev/null || echo "Could not fetch"

echo ""
echo "7. Recent logs (last 5 lines):"
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=5 \
  --project=personal-gcp-477623 \
  --format="value(textPayload)" 2>/dev/null | tail -5 || echo "Could not fetch logs"
```

## 🔧 Common Issues and Fixes

### Issue 1: Route Not Compiled
**Symptom**: Route exists in source but not in `dist/index.js`
**Fix**: 
```bash
cd backend
rm -rf dist node_modules/.cache
npm run build
```

### Issue 2: Package.json Not Found
**Symptom**: Error about `require('../package.json')` failing
**Fix**: Ensure `package.json` is copied to Docker image (check Dockerfile)

### Issue 3: Route Registered After Catch-All
**Symptom**: Route exists but returns 404
**Fix**: Move `/version` route registration earlier in the file, before any catch-all routes

### Issue 4: Old Image Cached
**Symptom**: Changes not reflected after deployment
**Fix**: 
```bash
docker build --no-cache -f Dockerfile.prod ...
```

### Issue 5: Wrong Image Tag
**Symptom**: Deployment uses old image
**Fix**: Check `cloudrun.yaml` uses `latest` tag or update to specific version

## 📝 Next Steps After Debugging

Once you identify the issue:

1. **If route not in compiled code**: Fix TypeScript compilation
2. **If package.json path wrong**: Fix the require path or Dockerfile
3. **If route order wrong**: Reorder route registrations
4. **If old image**: Rebuild and redeploy with `--no-cache`

After fixing, redeploy:
```bash
cd backend
docker build --no-cache -f Dockerfile.prod \
  -t gcr.io/personal-gcp-477623/api:latest \
  --platform linux/amd64 .
docker push gcr.io/personal-gcp-477623/api:latest
cd ..
gcloud run services replace cloudrun.yaml \
  --project=personal-gcp-477623 \
  --region=us-east1
```

