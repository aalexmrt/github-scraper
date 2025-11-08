#!/bin/bash

# Script to start Docker services for local development
# This starts PostgreSQL, Redis, Backend API, and Worker in Docker
# You can then run the frontend locally

echo "Starting Docker services (PostgreSQL, Redis, Backend API, Worker)..."
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
echo "Worker: Running in background"
echo ""
echo "Next steps:"
echo "1. Set up environment variables in .env file (see README.md)"
echo "2. Set up frontend .env.local file with NEXT_PUBLIC_API_URL=http://localhost:3000"
echo "3. Run 'cd frontend && pnpm install && pnpm run dev' (will start on http://localhost:3001)"
echo ""
echo "To stop services: ./stop-services.sh"
echo "To view logs: docker-compose -f docker-compose.services.yml logs -f"

