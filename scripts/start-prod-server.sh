#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
PORT="${PORT:-3000}"
REBUILD="${REBUILD:-0}"
NODE_ENV="${NODE_ENV:-production}"

print_help() {
  cat <<'EOF'
Usage: scripts/start-prod-server.sh [--rebuild] [--host HOST] [--port PORT]

Options:
  --rebuild      Rebuild Next.js production output before starting
  --host HOST    Bind host, defaults to 0.0.0.0
  --port PORT    Bind port, defaults to 3000
  --help         Show this help message
EOF
}

stop_existing_listener() {
  local pids
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs || true)"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "Port $PORT is already in use. Stopping existing process: $pids"
  kill $pids 2>/dev/null || true

  local attempts=20
  while [[ $attempts -gt 0 ]]; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi

    sleep 0.25
    attempts=$((attempts - 1))
  done

  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs)"
  if [[ -n "$pids" ]]; then
    echo "Force-stopping stubborn process on port $PORT: $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 0.25
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild)
      REBUILD=1
      shift
      ;;
    --host)
      HOSTNAME="${2:?missing value for --host}"
      shift 2
      ;;
    --port)
      PORT="${2:?missing value for --port}"
      shift 2
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

build_if_needed() {
  if [[ "$REBUILD" == "1" || ! -f ".next/standalone/server.js" ]]; then
    npm run build
  fi
}

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

load_runtime_env() {
  load_env_file ".env"
  load_env_file ".env.production"
  load_env_file ".env.local"
  load_env_file ".env.production.local"
}

sync_static_assets() {
  mkdir -p ".next/standalone/.next/static"
  rsync -a --delete ".next/static/" ".next/standalone/.next/static/"
}

load_runtime_env
build_if_needed
sync_static_assets
stop_existing_listener

echo "Starting production server on http://${HOSTNAME}:${PORT}"
exec env NODE_ENV="$NODE_ENV" HOSTNAME="$HOSTNAME" PORT="$PORT" node ".next/standalone/server.js"
