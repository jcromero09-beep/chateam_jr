#!/bin/bash

echo "==========================================="
echo "Starting load testing with Artillery"
echo "==========================================="

# Check if artillery is installed
if ! command -v artillery &> /dev/null
then
    echo "Artillery not found. Installing..."
    npm install -g artillery
fi

# Ensure server is running
echo "Checking if server is running..."
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "ERROR: Server is not running on port 3000"
    echo "Please start the server with: npm run dev"
    exit 1
fi

echo "Server is running. Starting load test..."

# Run artillery test
artillery run artillery.yml --output report.json

# Generate HTML report
echo "Generating HTML report..."
artillery report report.json --output load-test-report.html

echo "==========================================="
echo "Load test completed!"
echo "Report available at: load-test-report.html"
echo "==========================================="
