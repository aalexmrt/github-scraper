# Quick Fix: Rebuild and Redeploy

The deployment failed because the Docker image was built before fixing the `tsconfig.json` configuration.

## The Problem

The error shows:
```
Error: Cannot find module '/app/dist/src/index.js'
```

This happened because:
1. We changed `tsconfig.json` to use `rootDir: "./src"` 
2. But the Docker image was built with the old configuration
3. The compiled files weren't in the expected location

## The Fix

We've fixed `tsconfig.json` to:
- Use `rootDir: "./"` (preserves directory structure)
- Only include `src/**/*` (excludes scripts from build)
- Output to `dist/src/index.js` (matches the start script)

## Solution: Rebuild and Redeploy

Run the deployment script again:

```bash
./deploy.sh
```

This will:
1. Build a fresh Docker image with the correct file structure
2. Tag it as `api:1.0.2`
3. Push to GCR
4. Update `cloudrun.yaml` with the version tag
5. Deploy to Cloud Run

## Verify Before Deploying

You can verify the build works locally first:

```bash
cd backend
npm run build
ls -la dist/src/index.js  # Should exist
node dist/src/index.js    # Should start (will fail on DB connection, but that's OK)
```

Then deploy with `./deploy.sh`

