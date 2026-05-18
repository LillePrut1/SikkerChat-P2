#!/usr/bin/env python3
"""
Simple test to verify all imports work correctly
"""

import sys
import os

print("Testing imports...")

try:
    print("  - Importing auth module...")
    import auth
    print("    ✓ auth module imported successfully")
except Exception as e:
    print(f"    ✗ Failed to import auth: {e}")
    sys.exit(1)

try:
    print("  - Importing crypto_routes module...")
    import crypto_routes
    print("    ✓ crypto_routes module imported successfully")
except Exception as e:
    print(f"    ✗ Failed to import crypto_routes: {e}")
    sys.exit(1)

try:
    print("  - Importing group_routes module...")
    import group_routes
    print("    ✓ group_routes module imported successfully")
except Exception as e:
    print(f"    ✗ Failed to import group_routes: {e}")
    sys.exit(1)

try:
    print("  - Importing Flask app (server.py)...")
    import server
    print("    ✓ server.py imported successfully")
except Exception as e:
    print(f"    ✗ Failed to import server: {e}")
    sys.exit(1)

print("\n✅ All imports successful!")
print("The application is ready to run.")
