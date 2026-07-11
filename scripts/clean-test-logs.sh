#!/bin/bash

# Clean Test Logs Script
# Removes old test logs to save disk space

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_DIR/test-logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧹 Cleaning test logs..."
echo ""

# Count logs before cleaning
BEFORE_COUNT=$(find "$LOGS_DIR" -name "*.log" 2>/dev/null | wc -l)
echo "Found $BEFORE_COUNT log files"

# Remove logs older than 14 days
echo "Removing logs older than 14 days..."
find "$LOGS_DIR" -name "*.log" -mtime +14 -delete 2>/dev/null

# Keep only last 20 logs
echo "Keeping only last 20 logs..."
ls -t "$LOGS_DIR"/*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null

# Count logs after cleaning
AFTER_COUNT=$(find "$LOGS_DIR" -name "*.log" 2>/dev/null | wc -l)
REMOVED=$((BEFORE_COUNT - AFTER_COUNT))

echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo "Removed: $REMOVED log files"
echo "Remaining: $AFTER_COUNT log files"

# Show disk space saved
if [ $REMOVED -gt 0 ]; then
    echo ""
    echo "💾 Disk space in test-logs:"
    du -sh "$LOGS_DIR" 2>/dev/null || echo "0 bytes"
fi

echo ""
echo "To view remaining logs:"
echo "  ls -lh test-logs/"
echo ""
echo "To remove all logs:"
echo "  rm test-logs/*.log"
