#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 18+ first."
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run web -- --host 0.0.0.0
