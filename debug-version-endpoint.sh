BACKEND_URL="${BACKEND_URL:-https://your-backend-url.run.app}"
PROJECT_ID="${PROJECT_ID:-YOUR_GCP_PROJECT_ID}"
REGION="${REGION:-us-east1}"

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
curl -s ${BACKEND_URL}/version | head -c 100
echo ""

echo ""
echo "6. Current Cloud Run revision:"
gcloud run services describe api \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.latestReadyRevisionName)" 2>/dev/null || echo "Could not fetch"

echo ""
echo "7. Recent logs (last 5 lines):"
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=api' \
  --limit=5 \
  --project=${PROJECT_ID} \
  --format="value(textPayload)" 2>/dev/null | tail -5 || echo "Could not fetch logs"
