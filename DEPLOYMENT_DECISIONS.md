# Deployment Decisions Summary

## ✅ Confirmed Decisions

1. **Frontend**: Vercel ✅

   - Zero-config Next.js deployment
   - Free tier: 100GB bandwidth/month
   - Automatic HTTPS and CDN

2. **Storage**: Cloudflare R2 ✅

   - S3-compatible object storage
   - Free tier: 10GB storage, unlimited egress
   - Pay-as-you-go: $0.015/GB/month after free tier

3. **Backend API**: OCI Kubernetes ✅

   - Oracle Cloud Infrastructure Kubernetes (OKE)
   - Always-free tier: 4 oCPUs, 24GB RAM, 2 worker nodes
   - Free control plane forever

4. **Worker**: OCI Kubernetes ✅

   - Deployed in same Kubernetes cluster as Backend API
   - Can scale independently with HPA

5. **Database**: PostgreSQL in Kubernetes ✅

   - Self-hosted PostgreSQL StatefulSet
   - Better resource allocation than OCI managed (0.2 oCPU limit)
   - PersistentVolume for data persistence

6. **Redis**: Redis in Kubernetes ✅
   - Self-hosted Redis Deployment
   - Lightweight, fits easily in free tier
   - PersistentVolume for data persistence

---

## 🎯 Final Stack Summary

| Component       | Service              | Cost     | Notes                                  |
| --------------- | -------------------- | -------- | -------------------------------------- |
| **Frontend**    | Vercel               | $0/month | ✅ Decided                             |
| **Backend API** | OCI Kubernetes (OKE) | $0/month | ✅ Decided                             |
| **Worker**      | OCI Kubernetes (OKE) | $0/month | ✅ Decided                             |
| **Database**    | PostgreSQL (K8s)     | $0/month | ✅ Decided - Self-hosted in Kubernetes |
| **Redis**       | Redis (K8s)          | $0/month | ✅ Decided - Self-hosted in Kubernetes |
| **Storage**     | Cloudflare R2        | $0/month | ✅ Decided                             |

**Total Monthly Cost**: **$0/month** 🎉

---

## 📊 Resource Allocation

### OCI Always-Free Tier

- **Total Resources**: 4 oCPUs, 24GB RAM (2 nodes)
- **Per Node**: ~2 oCPUs, 12GB RAM

### Your Application Usage

**Node 1**:

- Backend API: 0.5 CPU, 512MB RAM
- Worker: 1 CPU, 1GB RAM
- PostgreSQL: 0.5 CPU, 1GB RAM
- Redis: 0.25 CPU, 256MB RAM
- **Total**: ~2.25 CPU, ~2.75GB RAM ✅

**Node 2**:

- Backend API (replica): 0.5 CPU, 512MB RAM
- Worker (replica): 1 CPU, 1GB RAM
- **Available**: 0.5 CPU, ~10GB RAM (for scaling)

**Verdict**: ✅ **Perfect fit within free tier!**

---

## 🚀 Next Steps

1. ✅ **Create OCI account** and set up OKE cluster
2. ✅ **Create Helm chart** for application
3. ✅ **Set up container registry** (OCI or Docker Hub)
4. ✅ **Deploy PostgreSQL** StatefulSet
5. ✅ **Deploy Redis** Deployment
6. ✅ **Deploy Backend API** Deployment
7. ✅ **Deploy Worker** Deployment
8. ✅ **Configure Ingress/LoadBalancer**
9. ✅ **Set up monitoring** and logging
10. ✅ **Test** deployment

See `OCI_K8S_ANALYSIS.md` for detailed analysis and recommendations.

### 3. **Backend API** (Fastify Server)

**Options:**

- **Railway** - $5 free credit/month, simple deployment
- **Render** - 750 hours/month free, sleeps after inactivity
- **Kubernetes** (OCI/Azure/DigitalOcean) - More complex, better scaling

**Recommendation**: Start with **Railway** for simplicity, migrate to Kubernetes later if needed.

---

### 4. **Worker** (Background Job Processor)

**Options:**

- **Railway** - Same as backend (simplest)
- **Render** - 750 hours/month free
- **Kubernetes** - Can scale independently

**Recommendation**: Deploy on **same platform as Backend API** (Railway or Render) for simplicity.

---

### 5. **Database** (PostgreSQL)

**Options:**

- **Railway PostgreSQL** - Included in free credit, 1GB storage
- **Render PostgreSQL** - 90 days free trial, then $7/month
- **Supabase** - Free tier: 500MB database, 2GB bandwidth
- **Neon** - Free tier: 0.5GB storage, serverless PostgreSQL
- **Managed PostgreSQL** (Cloud SQL/RDS/Azure DB) - More expensive, better for production

**Recommendation**:

- **Free tier**: Railway PostgreSQL or Supabase
- **Production**: Managed PostgreSQL (Cloud SQL/RDS/Azure DB)

---

### 6. **Redis** (Queue & Cache)

**Options:**

- **Upstash** - Free tier: 10K commands/day, 256MB storage, serverless
- **Railway Redis** - Included in free credit
- **Render Redis** - Included in free tier
- **Managed Redis** (ElastiCache/Memorystore/Azure Cache) - More expensive, better for production

**Recommendation**:

- **Free tier**: **Upstash** (best free tier, serverless)
- **All-in-one**: Railway Redis (if using Railway for everything)

---

## 📊 Recommended Stacks

### Option A: Simple Free Tier (Recommended for MVP)

- Frontend: **Vercel** ✅
- Backend API: **Railway**
- Worker: **Railway**
- Database: **Railway PostgreSQL**
- Redis: **Upstash**
- Storage: **Cloudflare R2** ✅
- **Cost**: $0/month

### Option B: All-in-One Railway

- Frontend: **Vercel** ✅
- Backend API: **Railway**
- Worker: **Railway**
- Database: **Railway PostgreSQL**
- Redis: **Railway Redis**
- Storage: **Cloudflare R2** ✅
- **Cost**: $0/month (within free credit)

### Option C: Kubernetes (For Scaling)

- Frontend: **Vercel** ✅
- Backend API: **Kubernetes** (OCI/Azure/DigitalOcean)
- Worker: **Kubernetes**
- Database: **Managed PostgreSQL** (Cloud SQL/RDS/Azure DB)
- Redis: **Managed Redis** (Memorystore/ElastiCache/Azure Cache)
- Storage: **Cloudflare R2** ✅
- **Cost**: $0-300/month (depending on provider)

---

## 🎯 Decision Checklist

- [x] Frontend: Vercel ✅
- [x] Storage: Cloudflare R2 ✅
- [ ] Backend API: ******\_\_\_******
- [ ] Worker: ******\_\_\_****** (usually same as Backend API)
- [ ] Database: ******\_\_\_******
- [ ] Redis: ******\_\_\_******

---

## 💡 Questions to Consider

1. **Budget**: Free tier only, or willing to pay for better services?
2. **Traffic**: Expected traffic level? (low/medium/high)
3. **Complexity**: Prefer simple deployment or advanced features?
4. **Scaling**: Need auto-scaling or manual scaling is fine?
5. **Ecosystem**: Prefer all services in one place or best-of-breed?

---

## 🚀 Next Steps

1. **Decide on Backend Platform** (Railway vs Render vs Kubernetes)
2. **Decide on Database** (Railway PostgreSQL vs Supabase vs Managed)
3. **Decide on Redis** (Upstash vs Railway Redis vs Managed)
4. **Review cost estimates** for chosen stack
5. **Proceed with deployment** using chosen services
