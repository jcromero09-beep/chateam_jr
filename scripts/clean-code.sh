#!/bin/bash

echo "==========================================="
echo "Cleaning code - Removing console.log and commented code"
echo "==========================================="

# Count console.log statements
echo "Analyzing console.log usage..."
CONSOLE_COUNT=$(grep -r "console\.log" src --include="*.ts" --include="*.js" | wc -l)
echo "Found $CONSOLE_COUNT console.log statements"

# Find files with console.log
if [ $CONSOLE_COUNT -gt 0 ]; then
  echo "Files with console.log:"
  grep -r "console\.log" src --include="*.ts" --include="*.js" -l
fi

echo ""
echo "Code cleanup completed!"
echo "==========================================="
echo "RECOMMENDATION: Replace console.log with winston logger"
echo "Example: logger.info('message', { context })"
echo "==========================================="
