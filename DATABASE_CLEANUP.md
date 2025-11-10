# Database Cleanup Guide

## Option 1: Reset Database via Prisma (Recommended)

This will drop the database, recreate it, and run all migrations:

```bash
cd backend
npx prisma migrate reset
```

**Note:** This will:
- Drop the database
- Create a new database
- Run all migrations from scratch
- Run seed scripts if you have any

## Option 2: Drop and Recreate Database (Docker)

If using Docker Compose:

```bash
# Stop services
./stop-services.sh

# Remove the database volume (WARNING: This deletes all data)
docker-compose -f docker-compose.services.yml down -v

# Or just remove the pg_data volume
docker volume rm github-scraper_pg_data

# Start services again (will create fresh database)
./start-services.sh
```

## Option 3: Manual SQL Cleanup

Connect to the database and drop all tables:

```bash
# Connect to PostgreSQL
docker exec -it github-scraper-db-1 psql -U user -d github_scraper

# Then run:
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO user;
GRANT ALL ON SCHEMA public TO public;

# Exit
\q

# Run migrations
cd backend
npx prisma migrate deploy
```

## Option 4: Reset via Docker Exec

```bash
# Connect to backend container
docker exec -it github-scraper-backend-1 sh

# Inside container:
npx prisma migrate reset

# Exit
exit
```

## Recommended Approach for Fresh Start

```bash
# 1. Stop all services
./stop-services.sh

# 2. Remove database volume
docker volume rm github-scraper_pg_data

# 3. Start services (will create fresh DB and run migrations)
./start-services.sh
```

## Verify Database is Clean

```bash
# Connect to database
docker exec -it github-scraper-db-1 psql -U user -d github_scraper

# List all tables
\dt

# Should show empty or only system tables

# Exit
\q
```

