#!/bin/bash
set -e

PROJECT_ID="personal-gcp-477623"
SA_NAME="github-actions-deployer"
REGION="us-east1"

echo "🔧 Setting up CI/CD for GitHub Actions..."
echo ""
echo "Project: ${PROJECT_ID}"
echo "Service Account: ${SA_NAME}"
echo "Region: ${REGION}"
echo ""

# Create service account
echo "📝 Creating service account..."
gcloud iam service-accounts create ${SA_NAME} \
  --display-name="GitHub Actions Deployer" \
  --project=${PROJECT_ID} 2>/dev/null || echo "   Service account already exists, continuing..."

# Grant permissions
echo "🔐 Granting permissions..."
echo "   - Cloud Run Admin..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin" \
  --quiet

echo "   - Storage Admin..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin" \
  --quiet

echo "   - Service Account User..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Create key
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}

echo ""
echo "✅ CI/CD setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Add these secrets to GitHub:"
echo ""
echo "   Go to: https://github.com/YOUR_USERNAME/github-scraper/settings/secrets/actions"
echo ""
echo "   Add the following secrets:"
echo ""
echo "   GCP_PROJECT_ID"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ${PROJECT_ID}"
echo ""
echo "   GCP_REGION"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ${REGION}"
echo ""
echo "   GCP_SA_KEY"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat github-actions-key.json
echo ""
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "2️⃣  For Vercel deployment (frontend), also add:"
echo ""
echo "   VERCEL_TOKEN"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Get from: https://vercel.com/account/tokens"
echo ""
echo "   VERCEL_ORG_ID and VERCEL_PROJECT_ID"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Run 'cd frontend && vercel' and check .vercel/project.json"
echo ""
echo "3️⃣  Copy workflow files:"
echo ""
echo "   mkdir -p .github/workflows"
echo "   # See CICD_DEPLOYMENT_STRATEGY.md for workflow examples"
echo ""
echo "4️⃣  Push to GitHub:"
echo ""
echo "   git add .github/workflows/"
echo "   git commit -m 'Add CI/CD workflows'"
echo "   git push origin main"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT: Delete github-actions-key.json after adding to GitHub:"
echo ""
echo "   rm github-actions-key.json"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

