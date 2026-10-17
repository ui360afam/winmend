#!/bin/sh
# One-click start for macOS and Linux: http://localhost:8093
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and run this again."
  exit 1
fi
echo "Starting WinMend on http://localhost:8093 (press Ctrl+C to stop)"
exec node scripts/run-local.js
