#!/usr/bin/env bash
set -e

cd /opt/archival-harvester

echo "▸ Building Docker image..."
sudo docker build -t archival-gateway .

echo "▸ Validating container static syntax and imports..."
sudo docker run --rm archival-gateway python -m py_compile server.py

if [ ! -f /opt/archival-harvester/.env ]; then
  echo "✗ Mandatory environment file /opt/archival-harvester/.env is missing! Aborting deploy."
  exit 1
fi

echo "▸ Swapping container..."
sudo docker stop gateway 2>/dev/null || true
sudo docker rm gateway 2>/dev/null || true

sudo mkdir -p /opt/archival-state
sudo mkdir -p /opt/ingest-logs

sudo docker run -d --name gateway \
  --env-file /opt/archival-harvester/.env \
  --restart always \
  --net=host \
  -v /opt/archival-state:/state \
  -v /opt/ingest-logs:/ingest-logs:ro \
  archival-gateway

shred -u /opt/archival-harvester/.env 2>/dev/null || rm -f /opt/archival-harvester/.env

echo "▸ Verifying production health check & core endpoints..."
HEALTH_PASSED=0
for i in $(seq 1 15); do
  STATUS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/health 2>/dev/null || echo "000")
  STATUS_INDEXING=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/api/v1/admin/indexing 2>/dev/null || echo "000")
  if [ "$STATUS_HEALTH" = "200" ] && { [ "$STATUS_INDEXING" = "200" ] || [ "$STATUS_INDEXING" = "401" ]; }; then
    HEALTH_PASSED=1
    break
  fi
  sleep 1
done

if [ $HEALTH_PASSED -eq 1 ]; then
  echo "✓ Health check and core endpoints verified successfully!"
  exit 0
else
  echo "✗ Health check failed! Dumping latest container logs:"
  sudo docker logs gateway --tail 40
  exit 1
fi
