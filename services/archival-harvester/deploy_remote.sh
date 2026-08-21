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

# Probes one base URL across every endpoint the dashboard depends on.
# Used for the candidate *and* for production after the swap: the two run with
# different networking (-p 8099:8090 vs --net=host), so passing on the candidate
# does not prove the production container can serve. Nothing checked that before,
# and a host-mode-only failure would have reported a successful deploy while the
# API was down.
probe_all() {
  local base="$1"
  local h s st ix hi cv ex tl
  h=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" "$base/health" 2>/dev/null || echo "000")
  s=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" "$base/api/v1/search?name=test" 2>/dev/null || echo "000")
  st=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/status" 2>/dev/null || echo "000")
  ix=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/indexing" 2>/dev/null || echo "000")
  hi=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/history?minutes=360" 2>/dev/null || echo "000")
  cv=$(curl -s --max-time 15 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/coverage" 2>/dev/null || echo "000")
  ex=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/harvest/exports" 2>/dev/null || echo "000")
  tl=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $ADMIN_TOKEN" "$base/api/v1/admin/batch-telemetry" 2>/dev/null || echo "000")
  echo "$h $s $st $ix $hi $cv $ex $tl"
}

all_ok() {
  local codes="$1"
  for c in $codes; do [ "$c" = "200" ] || return 1; done
  return 0
}

for i in $(seq 1 15); do
  if all_ok "$(probe_all http://localhost:8099)"; then
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

echo "✓ All 8 candidate API endpoints verified."

# Keep the image currently in production so a bad swap can be undone. Without
# this the only way back is another full deploy from the workstation.
if sudo docker image inspect archival-gateway:latest >/dev/null 2>&1; then
  sudo docker tag archival-gateway:latest archival-gateway:previous
  HAVE_ROLLBACK=1
else
  HAVE_ROLLBACK=0
fi

start_production() {
  local image="$1"
  sudo docker stop -t 5 gateway 2>/dev/null || true
  sudo docker rm gateway 2>/dev/null || true
  sudo docker run -d --name gateway     --env-file /opt/archival-harvester/.env     --restart always     --net=host     -v /opt/archival-state:/state     -v /opt/ingest-logs:/ingest-logs     "$image"
}

sudo docker stop -t 5 gateway-candidate 2>/dev/null || true
sudo docker rm gateway-candidate 2>/dev/null || true

sudo docker tag archival-gateway:candidate archival-gateway:latest

# Brief cutover, not zero downtime: production binds :8090 with --net=host, so
# the old container must release the port before the new one can take it. That
# gap is a few seconds. Calling it zero-downtime would need a proxy in front.
echo "▸ Swapping production container (brief cutover)..."
start_production archival-gateway:latest

echo "▸ Verifying production container..."
PROD_PASSED=0
for i in $(seq 1 20); do
  if all_ok "$(probe_all http://localhost:8090)"; then
    PROD_PASSED=1
    break
  fi
  sleep 1
done

if [ $PROD_PASSED -eq 0 ]; then
  echo "❌ Production failed verification after the swap."
  sudo docker logs gateway --tail 50 || true
  if [ $HAVE_ROLLBACK -eq 1 ]; then
    echo "▸ Rolling back to the previous image..."
    sudo docker tag archival-gateway:previous archival-gateway:latest
    start_production archival-gateway:previous
    for i in $(seq 1 20); do
      if all_ok "$(probe_all http://localhost:8090)"; then
        echo "✓ Rolled back; the previous version is serving again."
        break
      fi
      sleep 1
    done
  else
    echo "⚠ No previous image to roll back to — the API is down."
  fi
  shred -u /opt/archival-harvester/.env 2>/dev/null || rm -f /opt/archival-harvester/.env
  exit 1
fi

shred -u /opt/archival-harvester/.env 2>/dev/null || rm -f /opt/archival-harvester/.env

echo "✓ Deployment complete and production verified."
exit 0
