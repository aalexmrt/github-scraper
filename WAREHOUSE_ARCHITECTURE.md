# Data Warehouse & Sources Architecture Guide

## Overview

This document explains the data warehouse architecture options and how to configure dbt sources for the GitHub Repository Scraper project.

---

## 🏗️ Architecture Options

### Current Architecture (Recommended to Start)

```
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL Database                         │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ public schema (SOURCES)                         │   │
│  │ - repositories                                   │   │
│  │ - contributors                                  │   │
│  │ - repository_contributors                       │   │
│  │ - commits                                       │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                                │
│                    dbt Transform                          │
│                          ↓                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ analytics schema (WAREHOUSE)                    │   │
│  │ - fct_daily_commits                             │   │
│  │ - dim_repository                                │   │
│  │ - dim_contributor                               │   │
│  │ - repository_summary                             │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

**Configuration**:
- **Source Schema**: `public` (raw application data)
- **Warehouse Schema**: `analytics` (dbt-transformed tables)
- **Same Database**: PostgreSQL `github_scraper`
- **Cost**: $0 (uses existing infrastructure)

---

## 📊 Warehouse Options Comparison

### Option A: PostgreSQL as Warehouse (Current/Recommended)

**Architecture**: Single PostgreSQL instance, multiple schemas

**Pros**:
- ✅ No additional infrastructure
- ✅ Fits OCI free tier
- ✅ Simple setup and maintenance
- ✅ No data movement/sync needed
- ✅ Good for datasets < 50GB
- ✅ Low latency (same database)

**Cons**:
- ❌ OLTP and OLAP workloads compete for resources
- ❌ Limited analytics optimizations (no columnar storage)
- ❌ May impact application performance during heavy dbt runs
- ❌ No advanced features (time travel, zero-copy cloning)

**When to Use**:
- Starting out / MVP
- Small-medium datasets (< 50GB)
- Limited budget
- Simple analytics needs

**Setup**:
```sql
-- Create analytics schema
CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant permissions
GRANT USAGE ON SCHEMA analytics TO dbt_user;
GRANT CREATE ON SCHEMA analytics TO dbt_user;
```

---

### Option B: Dedicated Data Warehouse (Future Upgrade)

**Architecture**: PostgreSQL (source) → ETL → Cloud Warehouse

**Options**:
1. **Snowflake**
   - Cost: ~$2-5/credit (pay per use)
   - Pros: Excellent performance, time travel, zero-copy cloning
   - Cons: Can get expensive with large datasets

2. **Google BigQuery**
   - Cost: ~$5/TB queried (first 1TB free/month)
   - Pros: Serverless, excellent for analytics
   - Cons: Can get expensive with frequent queries

3. **Amazon Redshift**
   - Cost: ~$0.25/hour for smallest instance
   - Pros: Good performance, integrates with AWS
   - Cons: Requires instance management

4. **Databricks**
   - Cost: ~$0.15-0.40/DBU
   - Pros: Great for ML workloads
   - Cons: More complex setup

**Pros**:
- ✅ Optimized for analytics workloads
- ✅ Better performance for large datasets
- ✅ Advanced features (time travel, zero-copy cloning)
- ✅ Separation of concerns (OLTP vs OLAP)
- ✅ Scales independently
- ✅ Columnar storage for faster queries

**Cons**:
- ❌ Additional cost ($50-500+/month depending on usage)
- ❌ Data movement/sync required (ETL pipeline)
- ❌ More complex setup and maintenance
- ❌ Network latency (if cloud-based)

**When to Upgrade**:
- Database size > 50GB
- Analytics queries slow down OLTP operations
- Need advanced analytics features
- Budget allows ($100+/month)
- Multiple analysts/BI tools querying simultaneously

**Setup Requirements**:
1. Set up data warehouse account
2. Create ETL pipeline (dbt, Airflow, or Fivetran)
3. Configure data sync (CDC or batch)
4. Update dbt profiles to point to warehouse
5. Migrate dbt models

**Example ETL Pipeline**:
```
PostgreSQL (source) 
  → CDC Tool (Debezium/Fivetran)
  → Data Warehouse (Snowflake/BigQuery)
  → dbt Transform
  → Analytics Tables
```

---

### Option C: Separate PostgreSQL Instance (Middle Ground)

**Architecture**: Two PostgreSQL instances

**Pros**:
- ✅ Resource isolation
- ✅ Can optimize each instance differently
- ✅ Still free tier (if small instances)
- ✅ No data warehouse licensing costs

**Cons**:
- ❌ Data replication needed (logical replication or ETL)
- ❌ More infrastructure to manage
- ❌ Still limited analytics features
- ❌ Two databases to backup/maintain

**When to Use**:
- Need resource isolation
- Want to stay on PostgreSQL
- Don't want cloud warehouse costs
- Medium datasets (10-100GB)

**Setup**:
```sql
-- Instance 1: Application (source)
-- Instance 2: Analytics (warehouse)

-- Use PostgreSQL logical replication or ETL tool
-- to sync data from Instance 1 → Instance 2
```

---

## 🔄 Migration Path

### Phase 1: Start with PostgreSQL (Current)
- Use `public` schema for sources
- Use `analytics` schema for warehouse
- Monitor performance and costs

### Phase 2: Optimize PostgreSQL
- Add indexes for analytics queries
- Use materialized views for heavy aggregations
- Partition large tables by date
- Consider read replicas for analytics

### Phase 3: Evaluate Upgrade Need
- Monitor database size growth
- Track query performance
- Assess budget and requirements

### Phase 4: Upgrade to Dedicated Warehouse (If Needed)
- Choose warehouse provider
- Set up ETL pipeline
- Migrate dbt models
- Test and validate

---

## 📝 dbt Sources Configuration

### What are Sources?

**Sources** in dbt are the raw tables that dbt reads from. They represent your application database (where your application writes data).

**Key Concepts**:
- Sources are **read-only** from dbt's perspective
- Sources are defined in `sources.yml`
- Use `{{ source('source_name', 'table_name') }}` to reference them
- Sources enable data lineage and freshness testing

### Source Configuration Example

**File**: `dbt/models/sources.yml`

```yaml
version: 2

sources:
  - name: raw
    description: "Raw application data from PostgreSQL public schema"
    database: github_scraper  # Can be different if using separate warehouse
    schema: public
    freshness:
      warn_after: {count: 12, period: hour}
      error_after: {count: 24, period: hour}
    tables:
      - name: repositories
        description: "Repository metadata and state"
        loaded_at_field: updated_at  # Field to check for freshness
        columns:
          - name: id
            description: "Primary key"
            tests:
              - unique
              - not_null
          - name: url
            description: "Repository URL"
            tests:
              - unique
          - name: state
            description: "Processing state"
            tests:
              - accepted_values:
                  values: ['pending', 'in_progress', 'completed', 'failed']
                  
      - name: commits
        description: "Individual commit records"
        loaded_at_field: created_at
        columns:
          - name: commit_hash
            tests:
              - unique
          - name: commit_date
            tests:
              - not_null
```

### Using Sources in Models

**Example**: `dbt/models/staging/stg_commits.sql`

```sql
{{ config(materialized='view') }}

SELECT
  c.id as commit_id,
  c.repository_id,
  c.contributor_id,
  c.commit_hash,
  c.commit_date,
  c.commit_message
FROM {{ source('raw', 'commits') }} c  -- References source
WHERE c.commit_date IS NOT NULL
```

**Benefits**:
- Data lineage: dbt tracks where data comes from
- Freshness tests: Automatically check if source data is stale
- Documentation: Auto-generates docs for sources
- Refactoring: Easy to change source location if needed

---

## 🔍 Source Freshness Tests

dbt can automatically test if your source data is fresh (recently updated).

**Configuration**:
```yaml
sources:
  - name: raw
    freshness:
      warn_after: {count: 12, period: hour}  # Warn if data > 12 hours old
      error_after: {count: 24, period: hour}  # Error if data > 24 hours old
    tables:
      - name: commits
        loaded_at_field: created_at  # Field to check for freshness
```

**Run Freshness Tests**:
```bash
dbt source freshness
```

**Output**:
```
Found 4 sources, 4 tables, 4 tests, 0 macros, 0 operations, 0 seed files, 0 analyses

14:23:45 | Concurrency: 1 threads (target='dev')
14:23:45 |
14:23:45 | 1 of 4 START freshness of source raw.commits ................ [RUN]
14:23:46 | 1 of 4 PASS freshness of source raw.commits .................. [PASS in 0.12s]
```

---

## 🎯 Recommended Approach for This Project

### Start: PostgreSQL as Warehouse

**Why**:
1. Fits free tier budget
2. Simple setup
3. No additional infrastructure
4. Good for MVP/small datasets

**Configuration**:
- **Source**: `public` schema
- **Warehouse**: `analytics` schema
- **Same Database**: `github_scraper`

### Monitor & Evaluate

**Metrics to Track**:
- Database size growth
- Query performance (OLTP vs OLAP)
- dbt run times
- Application performance impact

**Upgrade Triggers**:
- Database > 50GB
- Analytics queries slow down app
- Need advanced features
- Budget allows

### Future: Upgrade to Dedicated Warehouse

**When Ready**:
- Choose provider (Snowflake/BigQuery recommended)
- Set up ETL pipeline
- Migrate dbt models
- Test and validate

---

## 📚 Additional Resources

- [dbt Sources Documentation](https://docs.getdbt.com/docs/build/sources)
- [dbt Source Freshness](https://docs.getdbt.com/docs/build/sources#snapshotting-source-data-freshness)
- [PostgreSQL Schemas](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [Data Warehouse Comparison](https://www.getdbt.com/blog/choosing-a-data-warehouse)

---

## ✅ Checklist

### Initial Setup (PostgreSQL as Warehouse)
- [ ] Create `analytics` schema in PostgreSQL
- [ ] Configure dbt sources in `sources.yml`
- [ ] Configure dbt profiles to use `analytics` schema
- [ ] Test source freshness
- [ ] Document source tables

### Future Upgrade (Dedicated Warehouse)
- [ ] Evaluate warehouse options
- [ ] Set up warehouse account
- [ ] Create ETL pipeline
- [ ] Update dbt profiles
- [ ] Migrate dbt models
- [ ] Test and validate
- [ ] Monitor costs

