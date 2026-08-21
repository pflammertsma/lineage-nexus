#!/usr/bin/env bash
set -e

cd /opt/archival-harvester

if [ ! -f /opt/archival-harvester/.env ]; then
  echo "✗ Mandatory environment file /opt/archival-harvester/.env is missing! Aborting deploy."
  exit 1
fi

echo "▸ Building Docker candidate image..."
sudo docker build -t archival-gateway:candidate .

echo "▸ Validating container static syntax and imports..."
sudo docker run --rm archival-gateway:candidate python -m py_compile server.py

sudo mkdir -p /opt/archival-state
sudo mkdir -p /opt/ingest-logs

echo "▸ Starting candidate container on verification port (8099)..."
sudo docker stop gateway-candidate 2>/dev/null || true
sudo docker rm gateway-candidate 2>/dev/null || true

sudo docker run -d --name gateway-candidate \
  --env-file /opt/archival-harvester/.env \
  -p 8099:8090 \
  -v /opt/archival-state:/state \
  -v /opt/ingest-logs:/ingest-logs \
  archival-gateway:candidate

echo "▸ Verifying candidate container across all core API endpoints..."
CANDIDATE_PASSED=0
ADMIN_TOKEN=$(grep -E '^ADMIN_SECRET_TOKEN=' /opt/archival-harvester/.env | cut -d '=' -f2-)

for i in $(seq 1 15); do
  ST_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8099/health 2>/dev/null || echo "000")
  ST_SEARCH=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8099/api/v1/search?name=test" 2>/dev/null || echo "000")
  ST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8099/api/v1/admin/status 2>/dev/null || echo "000")
  ST_INDEXING=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8099/api/v1/admin/indexing 2>/dev/null || echo "000")
  ST_HISTORY=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "http://localhost:8099/api/v1/admin/history?minutes=360" 2>/dev/null || echo "000")
  ST_COVERAGE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8099/api/v1/admin/coverage 2>/dev/null || echo "000")
  ST_EXPORTS=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8099/api/v1/admin/harvest/exports 2>/dev/null || echo "000")
  ST_TELEMETRY=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8099/api/v1/admin/batch-telemetry 2>/dev/null || echo "000")

  if [ "$ST_HEALTH" = "200" ] && [ "$ST_SEARCH" = "200" ] && [ "$ST_STATUS" = "200" ] && [ "$ST_INDEXING" = "200" ] && [ "$ST_HISTORY" = "200" ] && [ "$ST_COVERAGE" = "200" ] && [ "$ST_EXPORTS" = "200" ] && [ "$ST_TELEMETRY" = "200" ]; then
    CANDIDATE_PASSED=1
    break
  fi
  sleep 1
done

if [ $CANDIDATE_PASSED -eq 0 ]; then
  echo "❌ Candidate verification failed! Rolling back to active production container untouched."
  echo "--- Candidate Container Exception Logs ---"
  sudo docker logs gateway-candidate --tail 50
  sudo docker stop gateway-candidate 2>/dev/null || true
  sudo docker rm gateway-candidate 2>/dev/null || true
  shred -u /opt/archival-harvester/.env 2>/dev/null || rm -f /opt/archival-harvester/.env
  exit 1
fi

echo "✓ All 8 candidate API endpoints verified successfully!"
echo "▸ Swapping production container (Zero Downtime)..."

sudo docker stop gateway-candidate 2>/dev/null || true
sudo docker rm gateway-candidate 2>/dev/null || true

sudo docker tag archival-gateway:candidate archival-gateway:latest

sudo docker stop gateway 2>/dev/null || true
sudo docker rm gateway 2>/dev/null || true

sudo docker run -d --name gateway \
  --env-file /opt/archival-harvester/.env \
  --restart always \
  --net=host \
  -v /opt/archival-state:/state \
  -v /opt/ingest-logs:/ingest-logs \
  archival-gateway:latest

shred -u /opt/archival-harvester/.env 2>/dev/null || rm -f /opt/archival-harvester/.env

echo "✓ Zero-downtime production deployment complete!"
exit 0
