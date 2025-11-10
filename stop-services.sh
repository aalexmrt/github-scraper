#!/bin/bash

# Script to stop Docker services for local development
# This stops PostgreSQL, Redis, Backend API, and Worker

echo "Stopping Docker services..."
docker-compose -f docker-compose.services.yml down

echo ""
echo "Services stopped!"
echo ""
echo "To start services again: ./start-services.sh"
echo "To remove volumes as well: docker-compose -f docker-compose.services.yml down -v"



