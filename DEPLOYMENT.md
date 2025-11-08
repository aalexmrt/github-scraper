# Deployment Plan - GitHub Repository Scraper

## Overview

This document outlines the deployment strategy for the GitHub Repository Scraper using **free tier services**. The application is deployed using:

- **Frontend**: Vercel (Next.js)
- **Backend Services**: Oracle Cloud Infrastructure (OCI) Kubernetes
- **Storage**: Cloudflare R2 (S3-compatible)

**Total Monthly Cost**: **$0/month** (within free tier limits)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Frontend: Vercel ✅                        │
│              (Next.js Application)                      │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────────┐
│         OCI Kubernetes Cluster (OKE)                     │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Backend API  │  │   Worker      │                    │
│  │ Deployment   │  │   Deployment  │                    │
│  │ Replicas: 2  │  │   Replicas: 2 │                    │
│  └──────┬───────┘  └──────┬───────┘                    │
│         │                  │                             │
│  ┌──────▼───────┐  ┌──────▼───────┐                    │
│  │ PostgreSQL   │  │    Redis      │                    │
│  │ StatefulSet  │  │   Deployment  │                    │
│  │ 1 replica    │  │   1 replica    │                    │
│  └──────────────┘  └───────────────┘                    │
│                                                           │
│  ┌──────────────────────────────────────┐               │
│  │ PersistentVolumes                    │               │
│  │ - PostgreSQL data (10GB)             │               │
│  │ - Redis data (1GB)                   │               │
│  └──────────────────────────────────────┘               │
└───────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│         Storage: Cloudflare R2 ✅                       │
│         (S3-compatible object storage)                  │
└─────────────────────────────────────────────────────────┘
```

### Chosen Stack

| Component       | Service              | Free Tier Limits                  | Cost     |
| --------------- | -------------------- | --------------------------------- | -------- |
| **Frontend**    | Vercel               | 100GB bandwidth/month             | $0/month |
| **Backend API** | OCI Kubernetes (OKE) | 4 oCPUs, 24GB RAM, 2 worker nodes | $0/month |
| **Worker**      | OCI Kubernetes (OKE) | Same as backend                   | $0/month |
| **Database**    | PostgreSQL (K8s)     | Self-hosted in Kubernetes         | $0/month |
| **Redis**       | Redis (K8s)          | Self-hosted in Kubernetes         | $0/month |
| **Storage**     | Cloudflare R2        | 10GB free, unlimited egress       | $0/month |

---

## Prerequisites

### Required Accounts

- [ ] **Oracle Cloud (OCI)** account - [Sign up](https://cloud.oracle.com) (free tier, no credit card required)
- [ ] **Vercel** account - [Sign up](https://vercel.com)
- [ ] **Cloudflare** account - [Sign up](https://dash.cloudflare.com) (for R2 storage)
- [ ] **GitHub** account (for repository access)

### Required Tools

- [ ] `kubectl` - Kubernetes command-line tool
- [ ] `helm` - Kubernetes package manager (recommended)
- [ ] `docker` - For building container images
- [ ] OCI CLI (optional, for easier OCI management)

---

## Step 1: Set Up Cloudflare R2 Storage ✅

**Storage Choice**: Cloudflare R2 (S3-compatible object storage)

### Why Cloudflare R2?

- ✅ **10GB free** storage (generous free tier)
- ✅ **No egress fees** (unlimited bandwidth)
- ✅ **S3-compatible API** (works with existing code)
- ✅ **Pay-as-you-go** pricing after free tier ($0.015/GB/month)

### Setup Steps

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2** → **Create bucket**
3. Name your bucket (e.g., `github-repos`)
4. Choose location closest to your OCI deployment
5. Create bucket
6. Go to **Manage R2 API Tokens** → **Create API Token**
   - Token name: `github-scraper-production`
   - Permissions: Object Read & Write
   - Copy credentials:
     - **Account ID** (from dashboard URL or sidebar)
     - **Access Key ID**
     - **Secret Access Key**
7. Save credentials for Step 4 (Kubernetes Secrets)

**For detailed R2 setup, see `R2_SETUP.md`**

---

## Step 2: Set Up OCI Kubernetes Cluster

### 2.1 Create OCI Account

1. Go to [cloud.oracle.com](https://cloud.oracle.com)
2. Sign up (no credit card required for free tier)
3. Verify email

### 2.2 Create OKE Cluster

**Using OCI Console** (Recommended for beginners):

1. Navigate to **Developer Services** → **Kubernetes Clusters (OKE)**
2. Click **Create Cluster**
3. Select **Quick Create** (uses defaults)
4. Configure:
   - **Name**: `github-scraper`
   - **Kubernetes Version**: Latest stable (e.g., v1.28+)
   - **Node Shape**: `VM.Standard.E2.1.Micro` (Always Free Eligible)
   - **Node Count**: 2
   - **Node Pool Name**: `workers`
5. Click **Create**
6. Wait for cluster creation (~5-10 minutes)

**Using OCI CLI** (Advanced):

```bash
oci ce cluster create \
  --compartment-id <compartment-id> \
  --name github-scraper \
  --kubernetes-version v1.28.2 \
  --vcn-id <vcn-id> \
  --node-pool-name workers \
  --node-shape VM.Standard.E2.1.Micro \
  --node-count 2
```

### 2.3 Configure kubectl

1. In OCI Console, go to your cluster → **Access Cluster**
2. Copy the command to configure kubectl
3. Run the command in your terminal:

```bash
oci ce cluster create-kubeconfig \
  --cluster-id <cluster-id> \
  --file $HOME/.kube/config \
  --region <region> \
  --token-version 2.0.0
```

4. Verify connection:

```bash
kubectl get nodes
```

You should see 2 nodes ready.

---

## Step 3: Prepare Container Images

### 3.1 Build Docker Images

**Backend API Image**:

```bash
cd backend
docker build -f Dockerfile.prod -t github-scraper-backend:latest .
```

**Worker Image**:

```bash
cd backend
docker build -f Dockerfile.worker -t github-scraper-worker:latest .
```

### 3.2 Push to Container Registry

**Option A: OCI Container Registry** (Recommended for OCI)

1. Create container registry in OCI Console
2. Login:

```bash
docker login <region-key>.ocir.io
```

3. Tag and push:

```bash
docker tag github-scraper-backend:latest <region-key>.ocir.io/<tenancy-namespace>/github-scraper-backend:latest
docker tag github-scraper-worker:latest <region-key>.ocir.io/<tenancy-namespace>/github-scraper-worker:latest

docker push <region-key>.ocir.io/<tenancy-namespace>/github-scraper-backend:latest
docker push <region-key>.ocir.io/<tenancy-namespace>/github-scraper-worker:latest
```

**Option B: Docker Hub**

```bash
docker tag github-scraper-backend:latest <your-dockerhub-username>/github-scraper-backend:latest
docker tag github-scraper-worker:latest <your-dockerhub-username>/github-scraper-worker:latest

docker push <your-dockerhub-username>/github-scraper-backend:latest
docker push <your-dockerhub-username>/github-scraper-worker:latest
```

---

## Step 4: Deploy to Kubernetes

### 4.1 Create Namespace

```bash
kubectl create namespace github-scraper
```

### 4.2 Create Secrets

Create `k8s/secrets.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: github-scraper
type: Opaque
stringData:
  DATABASE_URL: 'postgresql://user:password@postgres:5432/github_scraper'
  REDIS_HOST: 'redis'
  REDIS_PORT: '6379'
  GITHUB_TOKEN: '<your-github-token>'
  GITHUB_CLIENT_ID: '<your-github-client-id>'
  GITHUB_CLIENT_SECRET: '<your-github-client-secret>'
  SESSION_SECRET: '<your-session-secret>'
  FRONTEND_URL: 'https://your-app.vercel.app'
  BACKEND_URL: 'https://your-backend-url'
  USE_R2_STORAGE: 'true'
  R2_ACCOUNT_ID: '<your-r2-account-id>'
  R2_ACCESS_KEY_ID: '<your-r2-access-key>'
  R2_SECRET_ACCESS_KEY: '<your-r2-secret-key>'
  R2_BUCKET_NAME: 'github-repos'
```

Apply secrets:

```bash
kubectl apply -f k8s/secrets.yaml
```

### 4.3 Deploy PostgreSQL

Create `k8s/postgresql.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: github-scraper
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: github-scraper
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15
          env:
            - name: POSTGRES_USER
              value: user
            - name: POSTGRES_PASSWORD
              value: password
            - name: POSTGRES_DB
              value: github_scraper
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 1000m
              memory: 2Gi
  volumeClaimTemplates:
    - metadata:
        name: postgres-storage
      spec:
        accessModes: ['ReadWriteOnce']
        resources:
          requests:
            storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: github-scraper
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
```

Apply:

```bash
kubectl apply -f k8s/postgresql.yaml
```

### 4.4 Deploy Redis

Create `k8s/redis.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: github-scraper
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: github-scraper
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:6-alpine
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: redis-storage
              mountPath: /data
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: redis-storage
          persistentVolumeClaim:
            claimName: redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: github-scraper
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
```

Apply:

```bash
kubectl apply -f k8s/redis.yaml
```

### 4.5 Deploy Backend API

Create `k8s/backend.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: github-scraper
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: <your-registry>/github-scraper-backend:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: app-secrets
          env:
            - name: PORT
              value: '3000'
            - name: NODE_ENV
              value: 'production'
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: github-scraper
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 3000
  type: LoadBalancer
```

Apply:

```bash
kubectl apply -f k8s/backend.yaml
```

### 4.6 Deploy Worker

Create `k8s/worker.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: github-scraper
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
        - name: worker
          image: <your-registry>/github-scraper-worker:latest
          envFrom:
            - secretRef:
                name: app-secrets
          env:
            - name: NODE_ENV
              value: 'production'
          resources:
            requests:
              cpu: 1000m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 2Gi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
  namespace: github-scraper
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

Apply:

```bash
kubectl apply -f k8s/worker.yaml
```

### 4.7 Run Database Migrations

```bash
kubectl run prisma-migrate \
  --image=<your-registry>/github-scraper-backend:latest \
  --rm -it \
  --restart=Never \
  --env-from=secret:app-secrets \
  --command -- sh -c "npx prisma migrate deploy"
```

---

## Step 5: Deploy Frontend to Vercel ✅

### 5.1 Update Frontend Configuration

Update `frontend/next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

### 5.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"New Project"**
3. Import your GitHub repository (`github-scraper`)
4. Configure project settings:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
5. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://<your-backend-loadbalancer-url>
   ```
   > Get the LoadBalancer URL from: `kubectl get svc -n github-scraper backend`
6. Click **"Deploy"**

---

## Step 6: Verify Deployment

### Check Pod Status

```bash
kubectl get pods -n github-scraper
```

All pods should be in `Running` state.

### Check Services

```bash
kubectl get svc -n github-scraper
```

Note the `EXTERNAL-IP` of the backend LoadBalancer service.

### Check Logs

```bash
# Backend logs
kubectl logs -f deployment/backend -n github-scraper

# Worker logs
kubectl logs -f deployment/worker -n github-scraper

# PostgreSQL logs
kubectl logs -f statefulset/postgres -n github-scraper

# Redis logs
kubectl logs -f deployment/redis -n github-scraper
```

### Test Health Endpoint

```bash
curl https://<backend-loadbalancer-url>/health
```

Should return: `{"message":"Server is running."}`

---

## Resource Allocation

### OCI Always-Free Tier Limits

- **Total**: 4 oCPUs, 24GB RAM across 2 nodes
- **Per Node**: ~2 oCPUs, 12GB RAM

### Application Resource Usage

| Service     | CPU Request | Memory Request | CPU Limit | Memory Limit |
| ----------- | ----------- | -------------- | --------- | ------------ |
| Backend API | 0.5 CPU     | 512MB          | 1 CPU     | 1GB          |
| Worker      | 1 CPU       | 1GB            | 2 CPU     | 2GB          |
| PostgreSQL  | 0.5 CPU     | 1GB            | 1 CPU     | 2GB          |
| Redis       | 0.25 CPU    | 256MB          | 0.5 CPU   | 512MB        |

**Total Minimum**: ~2.25 CPU, ~2.75GB RAM ✅

**With Replicas**: ~3.75 CPU, ~4.75GB RAM ✅

**Verdict**: Fits perfectly within free tier with room for scaling!

---

## Monitoring & Maintenance

### View Pod Status

```bash
kubectl get pods -n github-scraper -w
```

### View Resource Usage

```bash
kubectl top pods -n github-scraper
kubectl top nodes
```

### Scale Workers

```bash
# Manual scaling
kubectl scale deployment worker --replicas=3 -n github-scraper

# HPA will auto-scale based on CPU usage
```

### Database Backups

PostgreSQL data is stored in PersistentVolume. To backup:

```bash
# Create backup pod
kubectl run postgres-backup \
  --image=postgres:15 \
  --rm -it \
  --restart=Never \
  --command -- pg_dump -h postgres -U user github_scraper > backup.sql
```

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n github-scraper

# Check logs
kubectl logs <pod-name> -n github-scraper
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
kubectl get pods -l app=postgres -n github-scraper

# Test connection
kubectl run postgres-client \
  --image=postgres:15 \
  --rm -it \
  --restart=Never \
  --command -- psql -h postgres -U user -d github_scraper
```

### Redis Connection Issues

```bash
# Verify Redis is running
kubectl get pods -l app=redis -n github-scraper

# Test connection
kubectl run redis-client \
  --image=redis:6-alpine \
  --rm -it \
  --restart=Never \
  --command -- redis-cli -h redis ping
```

### Storage Issues

- Verify R2 credentials in secrets
- Check Cloudflare R2 dashboard for bucket access
- Review worker logs for storage errors

---

## Cost Breakdown

| Component          | Service           | Monthly Cost | Notes                 |
| ------------------ | ----------------- | ------------ | --------------------- |
| Kubernetes Cluster | OKE Control Plane | **$0**       | Always free           |
| Worker Nodes       | Always-Free       | **$0**       | 2 nodes, 4 oCPU, 24GB |
| Backend API        | K8s Pods          | **$0**       | Included              |
| Worker             | K8s Pods          | **$0**       | Included              |
| PostgreSQL         | K8s StatefulSet   | **$0**       | Self-hosted           |
| Redis              | K8s Deployment    | **$0**       | Self-hosted           |
| Storage            | Cloudflare R2 ✅  | **$0**       | 10GB free             |
| Frontend           | Vercel ✅         | **$0**       | Free tier             |
| Load Balancer      | OCI LB            | **$0**       | Included in free tier |
| **Total**          |                   | **$0/month** | 🎉                    |

---

## Quick Reference

### Useful Commands

```bash
# Get all resources
kubectl get all -n github-scraper

# View logs
kubectl logs -f deployment/backend -n github-scraper
kubectl logs -f deployment/worker -n github-scraper

# Scale services
kubectl scale deployment backend --replicas=3 -n github-scraper
kubectl scale deployment worker --replicas=5 -n github-scraper

# Port forward for local testing
kubectl port-forward svc/backend 3000:80 -n github-scraper

# Execute commands in pods
kubectl exec -it deployment/backend -n github-scraper -- sh
```

### Environment Variables

All environment variables are stored in Kubernetes Secrets (`app-secrets`). Update them:

```bash
kubectl edit secret app-secrets -n github-scraper
```

After updating secrets, restart deployments:

```bash
kubectl rollout restart deployment/backend -n github-scraper
kubectl rollout restart deployment/worker -n github-scraper
```

---

## Next Steps

1. ✅ Set up Cloudflare R2 storage
2. ✅ Create OCI Kubernetes cluster
3. ✅ Build and push container images
4. ✅ Deploy PostgreSQL and Redis
5. ✅ Deploy Backend API and Worker
6. ✅ Deploy Frontend to Vercel
7. ✅ Configure monitoring and alerts
8. ✅ Set up database backups
9. ✅ Test end-to-end functionality

---

## Additional Resources

- [OCI Kubernetes Documentation](https://docs.oracle.com/en-us/iaas/Content/ContEng/Concepts/contengoverview.htm)
- [Vercel Documentation](https://vercel.com/docs)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Kubernetes Official Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)

For detailed analysis, see:

- `OCI_K8S_ANALYSIS.md` - Detailed OCI Kubernetes analysis
- `DEPLOYMENT_DECISIONS.md` - Decision summary
- `R2_SETUP.md` - Cloudflare R2 setup guide
