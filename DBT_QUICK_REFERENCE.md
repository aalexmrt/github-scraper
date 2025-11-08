# dbt Implementation - Quick Reference

## 🎯 Summary

To implement dbt and data engineering, you need:

### New Services (1)

- **dbt Service**: Python container that transforms raw data into analytics tables
  - Runs as: Docker container (dev) or Kubernetes CronJob (prod)
  - Frequency: Every 6 hours (configurable)
  - Resources: 0.25-0.5 CPU, 256MB-512MB RAM

### Modified Services (2)

- **Worker**: Extract commit-level data (dates, hashes, messages)
- **PostgreSQL**: Store commits + analytics tables (new schema)

### No New Infrastructure Needed ✅

- Uses existing PostgreSQL database
- Uses existing Kubernetes cluster
- Fits within OCI free tier limits

---

## 📋 Implementation Steps (High-Level)

### 1. **Data Extraction** (4-6 hours)

- Add `Commit` model to Prisma schema
- Modify worker to extract commit-level data
- Run database migration

### 2. **dbt Setup** (2-3 hours)

- Initialize dbt project (`dbt/` directory)
- Create Dockerfile for dbt
- Configure database connection

### 3. **Create dbt Models** (10-15 hours)

- Staging models (clean raw data)
- Intermediate models (calculate metrics)
- Mart models (analytics-ready tables)

### 4. **Deploy** (2-3 hours)

- Add dbt to docker-compose (dev)
- Create Kubernetes CronJob (prod)
- Configure scheduled runs

### 5. **Test & Monitor** (2-3 hours)

- Add data quality tests
- Monitor dbt job execution
- Validate transformations

**Total Time**: ~20-30 hours

---

## 🏗️ Architecture Changes

### Before

```
Worker → PostgreSQL (Raw: repos, contributors, counts)
```

### After

```
Worker → PostgreSQL (Raw: repos, contributors, counts, commits)
                    ↓
              dbt Transform
                    ↓
        PostgreSQL (Analytics: fact/dim tables)
```

### Warehouse Architecture

**Current Approach**: PostgreSQL serves as both source and warehouse

- **Source Schema**: `public` (raw application data)
- **Warehouse Schema**: `analytics` (dbt-transformed tables)
- **Same Database**: `github_scraper`

**Future Upgrade Options**:

- Dedicated warehouse (Snowflake/BigQuery) when data > 50GB
- See `WAREHOUSE_ARCHITECTURE.md` for details

### Sources Configuration

**dbt Sources**: Raw tables that dbt reads from (`public` schema)

- Defined in `dbt/models/sources.yml`
- Use `{{ source('raw', 'table_name') }}` in models
- Enable data lineage and freshness tests

**Example**:

```yaml
sources:
  - name: raw
    schema: public
    tables:
      - name: commits
      - name: repositories
      - name: contributors
```

---

## 📦 Files to Create

### New Directories/Files

```
dbt/
├── Dockerfile
├── dbt_project.yml
├── profiles.yml
├── models/
│   ├── staging/
│   ├── intermediate/
│   └── marts/
└── tests/

k8s/
├── dbt-cronjob.yaml
├── dbt-configmap.yaml
└── dbt-job.yaml (optional, for manual runs)
```

### Files to Modify

```
backend/
├── prisma/schema.prisma (add Commit model)
├── src/services/repoService.ts (extract commits)
└── src/workers/repoWorker.ts (store commits)

docker-compose.services.yml (add dbt service)
```

---

## 🚀 Quick Commands

### Development

```bash
# Run dbt
docker-compose exec dbt dbt run

# Test dbt
docker-compose exec dbt dbt test

# Generate docs
docker-compose exec dbt dbt docs generate
```

### Production

```bash
# Apply Kubernetes configs
kubectl apply -f k8s/dbt-configmap.yaml
kubectl apply -f k8s/dbt-cronjob.yaml

# Manual trigger
kubectl create job --from=cronjob/dbt-scheduled-run dbt-manual-run -n github-scraper

# View logs
kubectl logs -l job-name=dbt-run -n github-scraper
```

---

## 💰 Cost Impact

### Development

- **Additional**: ~$0 (runs on existing Docker setup)

### Production (OCI Free Tier)

- **Current Usage**: ~2.25 CPU, ~2.75GB RAM
- **With dbt**: ~2.5 CPU, ~3.25GB RAM
- **Cost**: $0/month ✅

---

## ⚠️ Important Notes

1. **Backward Compatible**: Existing leaderboard API unchanged
2. **Database Growth**: Commit-level data increases DB size significantly
3. **Processing Time**: First dbt run may take time (use incremental models)
4. **Scheduling**: Start with 6-hour intervals, adjust based on needs
5. **Testing**: Test thoroughly in dev before production

---

## 📚 Next Steps

1. Review `DBT_IMPLEMENTATION_PLAN.md` for detailed steps
2. Review `DBT_SERVICES_CONFIG.md` for configuration examples
3. Review `WAREHOUSE_ARCHITECTURE.md` for warehouse options
4. Start with Phase 1 (Data Extraction)
5. Test incrementally before moving to next phase

---

## 🆘 Need Help?

- **dbt Docs**: https://docs.getdbt.com/
- **PostgreSQL Adapter**: https://github.com/dbt-labs/dbt-core
- **Kubernetes CronJobs**: https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
