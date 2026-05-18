#!/bin/bash
# Simple script to check JavaScript syntax using Node.js
# This requires Node.js to be installed

echo "Checking JavaScript files for syntax errors..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Skipping JavaScript syntax check."
    echo "Please install Node.js to validate JavaScript files."
    exit 0
fi

echo ""
echo "Checking crypto.js..."
node -c crypto.js && echo "✓ crypto.js syntax OK" || echo "✗ crypto.js has errors"

echo "Checking indexeddb.js..."
node -c indexeddb.js && echo "✓ indexeddb.js syntax OK" || echo "✗ indexeddb.js has errors"

echo "Checking security.js..."
node -c security.js && echo "✓ security.js syntax OK" || echo "✗ security.js has errors"

echo "Checking sanitize.js..."
node -c sanitize.js && echo "✓ sanitize.js syntax OK" || echo "✗ sanitize.js has errors"

echo "Checking app.js..."
node -c app.js && echo "✓ app.js syntax OK" || echo "✗ app.js has errors"

echo ""
echo "JavaScript syntax check complete!"
