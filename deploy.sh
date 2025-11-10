#!/bin/bash
set -e

PROJECT_ID="personal-gcp-477623"
REGION="us-east1"

# Get versions from package.json
BACKEND_VERSION=$(cd backend && node -p "require('./package.json').version")
FRONTEND_VERSION=$(cd frontend && node -p "require('./package.json').version")

echo "🚀 Starting deployment..."
echo "Backend version: ${BACKEND_VERSION}"
echo "Frontend version: ${FRONTEND_VERSION}"
echo ""

# Deploy Backend API
echo "📦 Building and deploying Backend API..."
cd backend
docker build -f Dockerfile.prod \
  -t gcr.io/${PROJECT_ID}/api:${BACKEND_VERSION} \
  --platform linux/amd64 \
  .
docker push gcr.io/${PROJECT_ID}/api:${BACKEND_VERSION}
cd ..

# Update cloudrun.yaml with version tag
echo "📝 Updating cloudrun.yaml with version ${BACKEND_VERSION}..."
sed -i '' "s|image: gcr.io/${PROJECT_ID}/api:.*|image: gcr.io/${PROJECT_ID}/api:${BACKEND_VERSION}|g" cloudrun.yaml

# Deploy to Cloud Run
gcloud run services replace cloudrun.yaml \
  --project=${PROJECT_ID} \
  --region=${REGION}
echo "✅ Backend API deployed (version ${BACKEND_VERSION})"

# Deploy Worker
echo "📦 Building and deploying Worker..."
cd backend
docker build -f Dockerfile.cloudrun-worker \
  -t gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION} \
  --platform linux/amd64 \
  .
docker push gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION}
cd ..

# Update cloudrun-job.yaml with version tag
echo "📝 Updating cloudrun-job.yaml with version ${BACKEND_VERSION}..."
sed -i '' "s|image: gcr.io/${PROJECT_ID}/worker:.*|image: gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION}|g" cloudrun-job.yaml

# Deploy to Cloud Run Jobs (use update instead of replace to avoid version conflicts)
gcloud run jobs update worker \
  --image=gcr.io/${PROJECT_ID}/worker:${BACKEND_VERSION} \
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
echo "Verify versions:"
echo "  Backend: curl https://api-sgmtwgzrlq-ue.a.run.app/version"
echo "  Frontend: https://github-scraper-psi.vercel.app (check footer)"

