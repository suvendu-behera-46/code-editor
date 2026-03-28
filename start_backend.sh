#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_PYTHON="$BACKEND_DIR/venv/bin/python"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Error: backend directory not found at $BACKEND_DIR"
  exit 1
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Error: backend virtualenv Python not found at $VENV_PYTHON"
  echo "Create it first:"
  echo "  cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt"
  exit 1
fi

cd "$BACKEND_DIR"
exec "$VENV_PYTHON" run.py
