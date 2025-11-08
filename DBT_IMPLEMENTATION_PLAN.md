# dbt Implementation Plan - GitHub Repository Scraper

## Overview

This document outlines the step-by-step plan to implement dbt (data build tool) and data engineering practices into the GitHub Repository Scraper project.

---

## 🎯 New Services & Components Required

### 1. **dbt Service** (New)

- **Purpose**: Transform raw data into analytics-ready tables
- **Type**: Python-based service/container
- **Technology**: dbt-core (PostgreSQL adapter)
- **Deployment**: Docker container / Kubernetes Job/CronJob
- **Resource Requirements**:
  - CPU: 0.5-1 CPU
  - Memory: 512MB-1GB
  - Storage: Minimal (code only)

### 2. **Scheduler Service** (New - Optional but Recommended)

- **Purpose**: Schedule dbt runs (hourly/daily)
- **Options**:
  - **Option A**: Kubernetes CronJob (simplest, no extra service)
  - **Option B**: Apache Airflow (more features, but heavier)
  - **Option C**: GitHub Actions (if using CI/CD)
- **Recommendation**: Start with Kubernetes CronJob, upgrade to Airflow if needed

### 3. **Data Warehouse Architecture** (Decision Required)

**Current Approach**: PostgreSQL serves as both source (raw data) and warehouse (analytics)

**Options**:

#### Option A: PostgreSQL as Warehouse (Recommended for Start)

- **Source**: PostgreSQL `public` schema (raw application data)
- **Warehouse**: PostgreSQL `analytics` schema (dbt-transformed tables)
- **Pros**:
  - No additional infrastructure
  - Fits free tier
  - Simple setup
  - Good for small-medium datasets
- **Cons**:
  - OLTP and OLAP workloads compete for resources
  - Limited analytics optimizations
  - May need upgrade as data grows

#### Option B: Dedicated Data Warehouse (Future Upgrade)

- **Source**: PostgreSQL (raw data)
- **Warehouse**: Snowflake / BigQuery / Redshift / Databricks
- **Pros**:
  - Optimized for analytics
  - Better performance for large datasets
  - Advanced features (time travel, zero-copy cloning)
  - Separation of concerns
- **Cons**:
  - Additional cost ($)
  - Data movement/sync required
  - More complex setup

#### Option C: Separate PostgreSQL Instance (Middle Ground)

- **Source**: PostgreSQL Instance 1 (application)
- **Warehouse**: PostgreSQL Instance 2 (analytics)
- **Pros**:
  - Resource isolation
  - Can optimize each instance differently
  - Still free tier (if small)
- **Cons**:
  - Data replication needed
  - More infrastructure to manage

**Recommendation**: Start with **Option A** (PostgreSQL), upgrade to **Option B** when:

- Database size > 50GB
- Analytics queries slow down OLTP operations
- Need advanced analytics features
- Budget allows for dedicated warehouse

### 4. **Enhanced Database Schema** (Modification)

- **New Tables**: Commit-level fact tables
- **New Schemas**:
  - `public` - Raw application data (sources)
  - `analytics` - dbt-transformed tables (warehouse)
- **No new database service needed initially** - uses existing PostgreSQL

### 5. **Data Extraction Enhancement** (Modification)

- **Modify**: Worker process to extract commit-level data
- **New Data**: Commit dates, hashes, messages, file changes
- **Storage**: Additional PostgreSQL tables

---

## 📋 Step-by-Step Implementation Plan

### Phase 1: Data Extraction Enhancement (Foundation)

#### Step 1.1: Modify Worker to Extract Commit-Level Data

**Current State**: Worker only stores aggregated commit counts per contributor

**Required Changes**:

1. Extract individual commit data (date, hash, message, author)
2. Store commits in new `commits` table
3. Maintain backward compatibility with existing leaderboard logic

**New Database Schema** (Prisma migration):

```prisma
model Commit {
  id              Int      @id @default(autoincrement())
  repositoryId    Int
  repository      Repository @relation(fields: [repositoryId], references: [id])
  contributorId   Int
  contributor     Contributor @relation(fields: [contributorId], references: [id])
  commitHash      String   @unique
  commitDate      DateTime
  commitMessage   String?  @db.Text
  linesAdded      Int?     @default(0)
  linesDeleted    Int?     @default(0)
  filesChanged    Int?     @default(0)
  createdAt       DateTime @default(now())

  @@index([repositoryId, commitDate])
  @@index([contributorId, commitDate])
  @@index([commitDate])
}
```

**Files to Modify**:

- `backend/prisma/schema.prisma` - Add Commit model
- `backend/src/services/repoService.ts` - Extract commit-level data
- `backend/src/workers/repoWorker.ts` - Store commits during processing

**Estimated Time**: 4-6 hours

---

#### Step 1.2: Create Database Migration

```bash
cd backend
npx prisma migrate dev --name add_commit_level_data
npx prisma generate
```

**Files Created**:

- `backend/prisma/migrations/[timestamp]_add_commit_level_data/migration.sql`

---

### Phase 2: dbt Project Setup

#### Step 2.1: Initialize dbt Project

**Location**: `dbt/` (new directory at project root)

```bash
# Install dbt (locally for development)
pip install dbt-postgres

# Initialize dbt project
mkdir dbt
cd dbt
dbt init github_scraper_analytics
```

**Project Structure**:

```
dbt/
├── dbt_project.yml          # dbt configuration
├── profiles.yml             # Database connection (local dev)
├── models/
│   ├── staging/
│   │   ├── _staging.yml
│   │   ├── stg_repositories.sql
│   │   ├── stg_contributors.sql
│   │   ├── stg_commits.sql
│   │   └── stg_repository_contributors.sql
│   ├── intermediate/
│   │   ├── int_contributor_metrics.sql
│   │   ├── int_repository_metrics.sql
│   │   └── int_time_series.sql
│   └── marts/
│       ├── _marts.yml
│       ├── fct_daily_commits.sql
│       ├── fct_repository_activity.sql
│       ├── dim_repository.sql
│       ├── dim_contributor.sql
│       ├── repository_summary.sql
│       └── contributor_summary.sql
├── tests/
│   └── test_data_quality.sql
└── macros/
    └── calculate_gini_coefficient.sql
```

**Files to Create**:

- `dbt/dbt_project.yml`
- `dbt/profiles.yml` (for local development)
- Initial model files

**Estimated Time**: 2-3 hours

---

#### Step 2.2: Configure dbt Connection & Sources

**dbt Sources Configuration** (`dbt/models/sources.yml`):

Sources define the raw tables that dbt reads from (your application database).

```yaml
version: 2

sources:
  - name: raw
    description: 'Raw application data from PostgreSQL public schema'
    database: github_scraper
    schema: public
    tables:
      - name: repositories
        description: 'Repository metadata and state'
        columns:
          - name: id
            description: 'Primary key'
          - name: url
            description: 'Repository URL'
          - name: state
            description: 'Processing state (pending, in_progress, completed, failed)'
          - name: last_processed_at
            description: 'Last successful processing timestamp'

      - name: contributors
        description: 'GitHub contributor information'
        columns:
          - name: id
            description: 'Primary key'
          - name: username
            description: 'GitHub username'
          - name: email
            description: 'Contributor email'
          - name: profile_url
            description: 'GitHub profile URL'

      - name: repository_contributors
        description: 'Join table linking repositories to contributors with commit counts'
        columns:
          - name: repository_id
            description: 'Foreign key to repositories'
          - name: contributor_id
            description: 'Foreign key to contributors'
          - name: commit_count
            description: 'Total commits by this contributor in this repository'

      - name: commits
        description: 'Individual commit records (after Phase 1 implementation)'
        columns:
          - name: id
            description: 'Primary key'
          - name: repository_id
            description: 'Foreign key to repositories'
          - name: contributor_id
            description: 'Foreign key to contributors'
          - name: commit_hash
            description: 'Git commit hash'
          - name: commit_date
            description: 'Commit timestamp'
          - name: commit_message
            description: 'Commit message'
          - name: lines_added
            description: 'Lines added in commit'
          - name: lines_deleted
            description: 'Lines deleted in commit'
```

**dbt Connection Configuration** (`dbt/profiles.yml`):

**Local Development**:

```yaml
github_scraper_analytics:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      user: user
      password: password
      port: 5432
      dbname: github_scraper
      schema: analytics # dbt writes transformed tables here
      threads: 4
      keepalives_idle: 0
      connect_timeout: 10
```

**Production** (Kubernetes ConfigMap/Secret):

```yaml
github_scraper_analytics:
  target: prod
  outputs:
    prod:
      type: postgres
      host: postgres-service.github-scraper.svc.cluster.local
      user: ${DB_USER}
      password: ${DB_PASSWORD} # From Kubernetes Secret
      port: 5432
      dbname: github_scraper
      schema: analytics
      threads: 2 # Lower for production to avoid resource contention
      keepalives_idle: 0
      connect_timeout: 10
```

**Key Points**:

- **Sources** (`public` schema): Where dbt READS from (raw application data)
- **Target Schema** (`analytics` schema): Where dbt WRITES to (transformed tables)
- Both can be in the same PostgreSQL database initially
- Use `{{ source('raw', 'table_name') }}` in models to reference sources

---

### Phase 3: Create dbt Models

#### Step 3.1: Staging Models (Data Cleaning)

**Purpose**: Clean and standardize raw data

**Example**: `dbt/models/staging/stg_commits.sql`

```sql
{{ config(materialized='view') }}

SELECT
  c.id as commit_id,
  c.repository_id,
  c.contributor_id,
  c.commit_hash,
  c.commit_date,
  c.commit_message,
  c.lines_added,
  c.lines_deleted,
  c.files_changed,
  DATE_TRUNC('day', c.commit_date) as commit_day,
  DATE_TRUNC('week', c.commit_date) as commit_week,
  DATE_TRUNC('month', c.commit_date) as commit_month
FROM {{ source('raw', 'commits') }} c  -- References source defined in sources.yml
WHERE c.commit_date IS NOT NULL
```

**Note**: The `{{ source('raw', 'commits') }}` macro references the source table defined in `sources.yml`. This provides:

- Data lineage tracking
- Source freshness tests
- Documentation
- Easier refactoring if source location changes

**Files to Create**:

- `stg_repositories.sql`
- `stg_contributors.sql`
- `stg_commits.sql`
- `stg_repository_contributors.sql`
- `_staging.yml` (documentation)

**Estimated Time**: 4-6 hours

---

#### Step 3.2: Intermediate Models (Business Logic)

**Purpose**: Calculate metrics and prepare for marts

**Example**: `dbt/models/intermediate/int_contributor_metrics.sql`

```sql
{{ config(materialized='table') }}

SELECT
  contributor_id,
  COUNT(DISTINCT repository_id) as repositories_contributed_to,
  SUM(commit_count) as total_commits,
  AVG(commit_count) as avg_commits_per_repo,
  MIN(first_commit_date) as first_commit_date,
  MAX(last_commit_date) as last_commit_date
FROM {{ ref('stg_repository_contributors') }}
GROUP BY contributor_id
```

**Files to Create**:

- `int_contributor_metrics.sql`
- `int_repository_metrics.sql`
- `int_time_series.sql`

**Estimated Time**: 3-4 hours

---

#### Step 3.3: Mart Models (Analytics-Ready Tables)

**Purpose**: Final analytics tables for BI/reporting

**Example**: `dbt/models/marts/fct_daily_commits.sql`

```sql
{{ config(
    materialized='incremental',
    unique_key='commit_day_repository_contributor',
    incremental_strategy='merge'
) }}

SELECT
  commit_day,
  repository_id,
  contributor_id,
  COUNT(*) as commits_count,
  SUM(lines_added) as total_lines_added,
  SUM(lines_deleted) as total_lines_deleted,
  SUM(files_changed) as total_files_changed,
  commit_day || '_' || repository_id || '_' || contributor_id as commit_day_repository_contributor
FROM {{ ref('stg_commits') }}
GROUP BY commit_day, repository_id, contributor_id

{% if is_incremental() %}
  WHERE commit_day > (SELECT MAX(commit_day) FROM {{ this }})
{% endif %}
```

**Files to Create**:

- `fct_daily_commits.sql`
- `fct_repository_activity.sql`
- `dim_repository.sql`
- `dim_contributor.sql`
- `repository_summary.sql`
- `contributor_summary.sql`
- `_marts.yml` (documentation)

**Estimated Time**: 6-8 hours

---

### Phase 4: Data Quality & Testing

#### Step 4.1: Add dbt Tests

**File**: `dbt/models/schema.yml`

```yaml
version: 2

# Source freshness tests - ensure data is up to date
sources:
  - name: raw
    description: 'Raw data from application'
    freshness:
      warn_after: { count: 12, period: hour }
      error_after: { count: 24, period: hour }
    tables:
      - name: commits
        description: 'Individual commit records'
        loaded_at_field: created_at
        columns:
          - name: commit_date
            tests:
              - not_null
      - name: repositories
        loaded_at_field: updated_at
        columns:
          - name: state
            tests:
              - accepted_values:
                  values: ['pending', 'in_progress', 'completed', 'failed']

models:
  - name: fct_daily_commits
    description: 'Daily commit fact table'
    columns:
      - name: commit_day
        tests:
          - not_null
          - dbt_utils.accepted_range:
              min_value: '2000-01-01'
      - name: commits_count
        tests:
          - not_null
          - dbt_utils.accepted_range:
              min_value: 0
```

**Estimated Time**: 2-3 hours

---

### Phase 5: Containerization & Deployment

#### Step 5.1: Create dbt Docker Container

**File**: `dbt/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dbt and PostgreSQL adapter
RUN pip install dbt-postgres==1.7.0

# Copy dbt project
COPY . /app

# Default command (can be overridden)
CMD ["dbt", "run"]
```

**File**: `dbt/.dockerignore`

```
__pycache__
*.pyc
.env
profiles.yml  # Will be mounted as ConfigMap/Secret
```

**Estimated Time**: 1 hour

---

#### Step 5.2: Add dbt to Docker Compose (Development)

**File**: `docker-compose.services.yml` (add new service)

```yaml
  dbt:
    build:
      context: ./dbt
    volumes:
      - ./dbt:/app
      - dbt_profiles:/root/.dbt  # Persistent profiles
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/github_scraper
    command: dbt run --profiles-dir /root/.dbt
    depends_on:
      db:
        condition: service_healthy
    profiles:  # dbt profiles.yml as volume
      - ./dbt/profiles.yml:/root/.dbt/profiles.yml:ro

volumes:
  dbt_profiles:
```

**Alternative**: Run dbt manually when needed

```bash
docker-compose exec dbt dbt run
docker-compose exec dbt dbt test
```

**Estimated Time**: 1 hour

---

#### Step 5.3: Create Kubernetes Deployment (Production)

**File**: `k8s/dbt-job.yaml` (One-time job)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dbt-run
  namespace: github-scraper
spec:
  template:
    spec:
      containers:
        - name: dbt
          image: your-registry/dbt:latest
          command: ['dbt', 'run']
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-secret
                  key: url
          volumeMounts:
            - name: dbt-profiles
              mountPath: /root/.dbt
      volumes:
        - name: dbt-profiles
          configMap:
            name: dbt-profiles-config
      restartPolicy: Never
```

**File**: `k8s/dbt-cronjob.yaml` (Scheduled runs)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dbt-scheduled-run
  namespace: github-scraper
spec:
  schedule: '0 */6 * * *' # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: dbt
              image: your-registry/dbt:latest
              command: ['sh', '-c']
              args:
                - |
                  dbt run --profiles-dir /root/.dbt
                  dbt test --profiles-dir /root/.dbt
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: database-secret
                      key: url
              volumeMounts:
                - name: dbt-profiles
                  mountPath: /root/.dbt
          volumes:
            - name: dbt-profiles
              configMap:
                name: dbt-profiles-config
          restartPolicy: OnFailure
```

**File**: `k8s/dbt-configmap.yaml` (dbt profiles)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dbt-profiles-config
  namespace: github-scraper
data:
  profiles.yml: |
    github_scraper_analytics:
      target: prod
      outputs:
        prod:
          type: postgres
          host: postgres-service
          user: ${DB_USER}
          password: ${DB_PASSWORD}
          port: 5432
          dbname: github_scraper
          schema: analytics
          threads: 2
```

**Estimated Time**: 2-3 hours

---

### Phase 6: Integration with Existing System

#### Step 6.1: Update Worker to Store Commits

**Modify**: `backend/src/services/repoService.ts`

**Changes Needed**:

1. Extract commit-level data from git log
2. Store commits in database during `generateLeaderboard()`
3. Maintain existing leaderboard logic (backward compatible)

**Example Code Addition**:

```typescript
// In generateLeaderboard function
const log = await git.log(['--format=%H|%ae|%ad|%s', '--date=iso']);

for (const commitLine of log.all) {
  const [hash, email, date, message] = commitLine.split('|');

  // Store commit
  await prisma.commit.create({
    data: {
      repositoryId: dbRepository.id,
      contributorId: dbUser.id,
      commitHash: hash,
      commitDate: new Date(date),
      commitMessage: message,
      // ... other fields
    },
  });
}
```

**Estimated Time**: 3-4 hours

---

#### Step 6.2: Create API Endpoints for Analytics (Optional)

**New Endpoints**:

- `GET /analytics/repository/:id/summary` - Repository analytics
- `GET /analytics/contributor/:id/summary` - Contributor analytics
- `GET /analytics/trends` - Time-series trends

**Files to Create/Modify**:

- `backend/src/routes/analytics.ts` (new)
- `backend/src/index.ts` (register route)

**Estimated Time**: 2-3 hours

---

## 🏗️ Updated Architecture

### Current Architecture

```
Frontend → Backend API → Worker → PostgreSQL (Raw Data)
```

### New Architecture with dbt

```
Frontend → Backend API → Worker → PostgreSQL (Raw Data)
                                              ↓
                                    dbt Transform Layer
                                              ↓
                                    PostgreSQL (Analytics Schema)
                                              ↓
                                    BI Tools / Analytics API
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Frontend: Vercel                           │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────────┐
│         OCI Kubernetes Cluster (OKE)                     │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Backend API  │  │   Worker      │                    │
│  │ Deployment   │  │   Deployment  │                    │
│  └──────┬───────┘  └──────┬───────┘                    │
│         │                  │                             │
│  ┌──────▼─────────────────▼───────┐                    │
│  │ PostgreSQL (StatefulSet)        │                    │
│  │                                  │                    │
│  │  Schemas:                        │                    │
│  │  - public (raw data)             │                    │
│  │  - analytics (dbt tables)        │                    │
│  └──────┬──────────────────────────┘                    │
│         │                                                 │
│  ┌──────▼──────────────┐                                │
│  │ dbt CronJob         │                                │
│  │ (Scheduled runs)    │                                │
│  └─────────────────────┘                                │
└───────────────────────────────────────────────────────────┘
```

---

## 📊 Resource Requirements

### Development (Docker Compose)

| Service              | CPU         | Memory    | Notes                                                 |
| -------------------- | ----------- | --------- | ----------------------------------------------------- |
| dbt (new)            | 0.5 CPU     | 512MB     | Only runs when executing dbt commands                 |
| PostgreSQL           | 0.5 CPU     | 1GB       | Same as before (may need +256MB for analytics schema) |
| **Total Additional** | **0.5 CPU** | **512MB** | Minimal impact                                        |

### Production (Kubernetes)

| Service        | CPU Request  | Memory Request | CPU Limit | Memory Limit |
| -------------- | ------------ | -------------- | --------- | ------------ |
| dbt CronJob    | 0.25 CPU     | 256MB          | 1 CPU     | 1GB          |
| PostgreSQL     | 0.5 CPU      | 1.5GB          | 1 CPU     | 2GB          |
| **Additional** | **0.25 CPU** | **512MB**      | **1 CPU** | **1GB**      |

**OCI Free Tier Impact**:

- Current: ~2.25 CPU, ~2.75GB RAM
- With dbt: ~2.5 CPU, ~3.25GB RAM
- **Still within free tier limits** ✅

---

## 🔄 Deployment Workflow

### Development Workflow

1. **Make code changes** (worker, dbt models)
2. **Run migrations**: `npx prisma migrate dev`
3. **Process repository**: Worker stores commits
4. **Run dbt**: `docker-compose exec dbt dbt run`
5. **Test dbt**: `docker-compose exec dbt dbt test`
6. **Query analytics**: Use dbt-generated tables

### Production Workflow

1. **Deploy code changes** (Kubernetes)
2. **Run migrations**: Prisma migrations on startup
3. **Process repositories**: Workers store commits
4. **dbt runs automatically**: CronJob executes every 6 hours
5. **Monitor**: Check CronJob logs for dbt execution

---

## 📝 Implementation Checklist

### Phase 1: Foundation

- [ ] Add Commit model to Prisma schema
- [ ] Create database migration
- [ ] Modify worker to extract commit-level data
- [ ] Test commit extraction with sample repository

### Phase 2: dbt Setup

- [ ] Initialize dbt project
- [ ] Configure dbt profiles (dev & prod)
- [ ] Create Dockerfile for dbt
- [ ] Add dbt service to docker-compose

### Phase 3: dbt Models

- [ ] Create staging models
- [ ] Create intermediate models
- [ ] Create mart models
- [ ] Add model documentation (schema.yml)

### Phase 4: Testing

- [ ] Add dbt tests
- [ ] Test data quality
- [ ] Validate transformations

### Phase 5: Deployment

- [ ] Create Kubernetes ConfigMap for dbt profiles
- [ ] Create Kubernetes CronJob for scheduled runs
- [ ] Test dbt execution in Kubernetes
- [ ] Monitor dbt job execution

### Phase 6: Integration

- [ ] Create analytics API endpoints (optional)
- [ ] Update frontend to use analytics data (optional)
- [ ] Document analytics schema
- [ ] Create analytics dashboard (optional)

---

## 🚀 Quick Start Commands

### Local Development

```bash
# 1. Start services (including dbt)
docker-compose -f docker-compose.services.yml up -d

# 2. Run dbt models
docker-compose exec dbt dbt run

# 3. Run dbt tests
docker-compose exec dbt dbt test

# 4. Generate dbt docs
docker-compose exec dbt dbt docs generate
docker-compose exec dbt dbt docs serve --port 8080
```

### Production (Kubernetes)

```bash
# 1. Apply dbt ConfigMap
kubectl apply -f k8s/dbt-configmap.yaml

# 2. Create dbt CronJob
kubectl apply -f k8s/dbt-cronjob.yaml

# 3. Manually trigger dbt run (if needed)
kubectl create job --from=cronjob/dbt-scheduled-run dbt-manual-run -n github-scraper

# 4. Check CronJob status
kubectl get cronjobs -n github-scraper

# 5. View dbt logs
kubectl logs -l job-name=dbt-run -n github-scraper
```

---

## 📚 Additional Considerations

### 1. **Incremental Processing**

- dbt incremental models process only new commits
- Reduces processing time for large repositories
- Configure incremental strategy in model config

### 2. **Data Freshness**

- dbt CronJob runs every 6 hours (configurable)
- Can be triggered manually via API/webhook
- Monitor data freshness with dbt tests

### 3. **Schema Management**

- Use separate schema (`analytics`) for dbt tables
- Keeps raw data separate from transformed data
- Easier to manage permissions

### 4. **Performance Optimization**

- Index frequently queried columns
- Use materialized tables for heavy aggregations
- Consider partitioning large fact tables by date

### 5. **Monitoring**

- Monitor dbt job execution times
- Alert on dbt test failures
- Track data freshness metrics

---

## 🎯 Next Steps After Implementation

1. **BI Integration**: Connect BI tools (Metabase, Superset, etc.) to analytics schema
2. **Advanced Analytics**: Add ML models for contributor prediction
3. **Real-time Analytics**: Consider streaming with Kafka + dbt
4. **Data Lineage**: Use dbt docs for data lineage visualization
5. **Advanced Scheduling**: Upgrade to Airflow for complex workflows

---

## 📖 Resources

- [dbt Documentation](https://docs.getdbt.com/)
- [dbt Best Practices](https://docs.getdbt.com/guides/best-practices)
- [PostgreSQL dbt Adapter](https://github.com/dbt-labs/dbt-core)
- [Kubernetes CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)

---

## ⚠️ Important Notes

1. **Backward Compatibility**: Existing leaderboard functionality remains unchanged
2. **Database Size**: Commit-level data will increase database size significantly
3. **Processing Time**: Initial dbt run may take time for large datasets
4. **Incremental Models**: Use incremental models to optimize subsequent runs
5. **Testing**: Always test dbt models in development before production deployment

---

**Total Estimated Implementation Time**: 20-30 hours (spread across phases)

**Recommended Approach**: Implement incrementally, one phase at a time, testing thoroughly before moving to the next phase.
