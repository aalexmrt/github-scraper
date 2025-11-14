#!/bin/bash

# Script to start Docker services for local development
# This starts PostgreSQL, Redis, Backend API, Commit Worker, and User Worker in Docker
# You can then run the frontend locally

echo "Starting Docker services (PostgreSQL, Redis, Backend API, Commit Worker, User Worker)..."
docker-compose -f docker-compose.services.yml up -d --remove-orphans

echo ""
echo "Waiting for services to be healthy..."
sleep 5

echo ""
echo "Services started!"
echo ""
echo "PostgreSQL: localhost:5432"
echo "Redis: localhost:6379"
echo "Backend API: http://localhost:3000"
echo "Commit Worker: Running in background"
echo "User Worker: Running in background"
echo ""
echo "Next steps:"
echo "1. Set up environment variables in .env file (see README.md)"
echo "2. Set up frontend .env.local file with NEXT_PUBLIC_API_URL=http://localhost:3000"
echo "3. Run 'cd frontend && pnpm install && pnpm run dev' (will start on http://localhost:3001)"
echo ""
echo "To stop services: ./scripts/dev/stop-services.sh"
echo ""
echo "Log viewing commands:"
echo "  - All services: docker-compose -f docker-compose.services.yml logs -f"
echo "  - Commit worker: docker-compose -f docker-compose.services.yml logs -f commit-worker"
echo "  - User worker: docker-compose -f docker-compose.services.yml logs -f user-worker"
echo "  - Both workers: docker-compose -f docker-compose.services.yml logs -f commit-worker user-worker"
echo "  - Backend API: docker-compose -f docker-compose.services.yml logs -f backend"

