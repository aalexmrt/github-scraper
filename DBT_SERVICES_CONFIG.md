# dbt Service Configuration

## Docker Compose Service (Development)

```yaml
  dbt:
    build:
      context: ./dbt
      dockerfile: Dockerfile
    volumes:
      - ./dbt:/app
      - dbt_profiles:/root/.dbt
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/github_scraper
    command: dbt run --profiles-dir /root/.dbt
    depends_on:
      db:
        condition: service_healthy
    profiles:
      - ./dbt/profiles.yml:/root/.dbt/profiles.yml:ro

volumes:
  dbt_profiles:
```

## Kubernetes CronJob (Production)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dbt-scheduled-run
  namespace: github-scraper
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: dbt
            image: your-registry/github-scraper-dbt:latest
            imagePullPolicy: Always
            command: ["sh", "-c"]
            args:
              - |
                echo "Starting dbt run at $(date)"
                dbt run --profiles-dir /root/.dbt --target prod
                echo "Running dbt tests..."
                dbt test --profiles-dir /root/.dbt --target prod
                echo "dbt run completed at $(date)"
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-secret
                  key: url
            resources:
              requests:
                cpu: "250m"
                memory: "256Mi"
              limits:
                cpu: "1"
                memory: "1Gi"
            volumeMounts:
            - name: dbt-profiles
              mountPath: /root/.dbt
          volumes:
          - name: dbt-profiles
            configMap:
              name: dbt-profiles-config
          restartPolicy: OnFailure
```

## Kubernetes ConfigMap for dbt Profiles

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
          host: postgres-service.github-scraper.svc.cluster.local
          user: user
          password: password  # Should use Secret in production
          port: 5432
          dbname: github_scraper
          schema: analytics
          threads: 2
          keepalives_idle: 0
          connect_timeout: 10
```

## Resource Requirements Summary

### New Services Required:
1. **dbt Service** (Container/Job)
   - CPU: 0.25-0.5 (request), 1 (limit)
   - Memory: 256MB-512MB (request), 1GB (limit)
   - Storage: Minimal (code only)

2. **Scheduler** (Kubernetes CronJob)
   - No additional resources (uses dbt container)

### Modified Services:
1. **PostgreSQL**
   - Additional memory: +256MB-512MB (for analytics schema)
   - Additional storage: Variable (depends on commit data volume)

2. **Worker**
   - Additional processing time: +10-20% (to extract commit-level data)
   - No additional resources needed

### Total Additional Resources:
- **CPU**: +0.25-0.5 CPU
- **Memory**: +512MB-1GB
- **Storage**: Variable (commit data)

**Still fits within OCI Free Tier limits** ✅

