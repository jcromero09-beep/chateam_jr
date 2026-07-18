#!/bin/bash

echo "==========================================="
echo "Running complete test suite"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Track results
TESTS_PASSED=true

# 1. Run unit tests
echo "1. Running unit tests..."
npm test -- --coverage
if [ $? -ne 0 ]; then
    echo -e "${RED}Unit tests failed${NC}"
    TESTS_PASSED=false
else
    echo -e "${GREEN}Unit tests passed${NC}"
fi

echo ""

# 2. Run integration tests
echo "2. Running integration tests..."
npm run test:integration
if [ $? -ne 0 ]; then
    echo -e "${RED}Integration tests failed${NC}"
    TESTS_PASSED=false
else
    echo -e "${GREEN}Integration tests passed${NC}"
fi

echo ""

# 3. Run E2E tests (if Playwright is configured)
if [ -f "playwright.config.ts" ]; then
    echo "3. Running E2E tests..."
    npm run test:e2e
    if [ $? -ne 0 ]; then
        echo -e "${RED}E2E tests failed${NC}"
        TESTS_PASSED=false
    else
        echo -e "${GREEN}E2E tests passed${NC}"
    fi
fi

echo ""
echo "==========================================="
if [ "$TESTS_PASSED" = true ]; then
    echo -e "${GREEN}All tests passed successfully!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
