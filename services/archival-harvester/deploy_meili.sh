#!/usr/bin/env bash
set -e

# Deployment / configuration script for self-hosted Meilisearch instance on production host.
MEILI_MASTER_KEY=${1:-""}

if [ -z "$MEILI_MASTER_KEY" ] && [ -f /opt/archival-harvester/.env ]; then
  MEILI_MASTER_KEY=$(grep -E '^MEILI_MASTER_KEY=' /opt/archival-harvester/.env | cut -d '=' -f2-)
fi

if [ -z "$MEILI_MASTER_KEY" ]; then
  echo "✗ Error: MEILI_MASTER_KEY is required."
  exit 1
fi

echo "▸ Deploying / updating Meilisearch container (8GiB indexing RAM, DEBUG logs)..."

sudo mkdir -p /opt/meili_data

sudo docker stop meilisearch 2>/dev/null || true
sudo docker rm meilisearch 2>/dev/null || true

sudo docker run -d --name meilisearch \
  --restart always \
  -p 127.0.0.1:7700:7700 \
  -v /opt/meili_data:/meili_data \
  -e MEILI_MASTER_KEY="$MEILI_MASTER_KEY" \
  -e MEILI_ENV="production" \
  -e MEILI_LOG_LEVEL="DEBUG" \
  -e MEILI_MAX_INDEXING_MEMORY="8GiB" \
  -e MEILI_HTTP_ADDR="0.0.0.0:7700" \
  -e MEILI_SERVER_PROVIDER="docker" \
  getmeili/meilisearch:v1.12

echo "✓ Meilisearch deployment complete."
