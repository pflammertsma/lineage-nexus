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

echo "▸ Deploying / updating Meilisearch container (3GiB indexing RAM, DEBUG logs)..."

sudo mkdir -p /opt/meili_data

sudo docker stop meilisearch 2>/dev/null || true
sudo docker rm meilisearch 2>/dev/null || true

# Host networking, not -p 127.0.0.1:7700:7700: bridge-mode port mapping
# relays every request through docker-proxy, which is what stalled the
# harvester for 40 minutes on a single large POST. MEILI_HTTP_ADDR is bound
# to loopback only, so this is not opening 7700 to the network — verified
# after the equivalent change to the gateway container that the port still
# refuses connections from the host's external address.
#
# MEILI_MAX_INDEXING_MEMORY dropped from 8GiB to 3GiB. On this 11.9GB host
# that reservation is anonymous memory the OS cannot reclaim, so it was
# taken directly out of what was left for the OS to use as page cache for
# Meilisearch's memory-mapped LMDB store — the ~90GB on-disk index is already
# far bigger than RAM can cache, and every gigabyte handed to the indexer's
# own sort/merge buffer is a gigabyte less of an already-scarce resource.
# The phases that dominate a batch's wall time (facet/word post-processing,
# finalizing) are page-cache-driven reads and writes, not buffer-driven
# sorting, so cache headroom matters more here than a larger indexing
# buffer does. A smaller buffer does mean more spill-and-merge passes during
# the initial extraction phase; if that phase becomes the bottleneck instead,
# this is the number to raise back up.
sudo docker run -d --name meilisearch \
  --restart always \
  --net=host \
  -v /opt/meili_data:/meili_data \
  -e MEILI_MASTER_KEY="$MEILI_MASTER_KEY" \
  -e MEILI_ENV="production" \
  -e MEILI_LOG_LEVEL="DEBUG" \
  -e MEILI_MAX_INDEXING_MEMORY="3GiB" \
  -e MEILI_HTTP_ADDR="127.0.0.1:7700" \
  -e MEILI_SERVER_PROVIDER="docker" \
  getmeili/meilisearch:v1.12

echo "✓ Meilisearch deployment complete."
