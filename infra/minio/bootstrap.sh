#!/bin/sh
# infra/minio/bootstrap.sh — create the buckets the platform uses.
set -eu

MC="${MC:-mc}"
MINIO_URL="${MINIO_URL:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-fleetai}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-fleetai-dev-secret}"

$MC alias set local "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" || true

for bucket in fleetai-public fleetai-private; do
  $MC mb --ignore-existing "local/$bucket" || true
done

# Set anonymous download on the public bucket (objects uploaded as public).
$MC anonymous set download "local/fleetai-public" || true

echo "minio bootstrap complete"
