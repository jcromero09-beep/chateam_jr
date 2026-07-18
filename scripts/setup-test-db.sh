#!/bin/bash

echo "========================================="
echo "Setting up test database..."
echo "========================================="

# Start test containers
echo "Starting PostgreSQL and Redis test containers..."
docker compose -f docker-compose.test.yml up -d

# Wait for database to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 10

# Check if database is ready
until docker exec chateam-postgres-test pg_isready -U chateam_test -d chateam_test > /dev/null 2>&1; do
  echo "PostgreSQL is unavailable - waiting..."
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Check if Redis is ready
echo "Waiting for Redis to be ready..."
until docker exec chateam-redis-test redis-cli ping > /dev/null 2>&1; do
  echo "Redis is unavailable - waiting..."
  sleep 2
done

echo "✅ Redis is ready!"

# Run migrations (if migration script exists)
if [ -f "dist/scripts/runMigrations.js" ]; then
  echo "Running migrations..."
  NODE_ENV=test node dist/scripts/runMigrations.js
fi

# Run seeders (if seeder script exists)
if [ -f "dist/scripts/runSeeds.js" ]; then
  echo "Running seeders..."
  NODE_ENV=test node dist/scripts/runSeeds.js
fi

echo "========================================="
echo "✅ Test database setup completed!"
echo "========================================="
echo "PostgreSQL: localhost:5433"
echo "Redis: localhost:6380"
echo "Database: chateam_test"
echo "User: chateam_test"
echo "========================================="
