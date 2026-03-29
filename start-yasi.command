#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT_DIR"

echo "Starting Yasi production server..."
echo

if ! npm run start:prod:rebuild; then
  echo
  echo "Startup failed."
  read -r -p "Press Enter to close..."
  exit 1
fi
