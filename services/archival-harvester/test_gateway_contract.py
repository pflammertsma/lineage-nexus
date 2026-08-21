"""
Pre-flight FastAPI API route contract test suite for Archival Gateway.
Runs in-memory via TestClient to verify all endpoints, route paths, and responses before deployment.
"""

import sys
from unittest.mock import MagicMock, patch

with patch("meilisearch.Client") as mock_meili_cls:
  mock_index = MagicMock()
  mock_index.search.return_value = {"hits": [], "estimatedTotalHits": 0}
  mock_index.get_stats.return_value = {"numberOfDocuments": 100, "isIndexing": False}
  mock_index.update_settings.return_value = {"taskUid": 1}
  mock_meili_cls.return_value.index.return_value = mock_index

  from fastapi.testclient import TestClient
  import config
  import auth
  config.ADMIN_SECRET_TOKEN = "test_secret_token"
  auth.ADMIN_SECRET_TOKEN = "test_secret_token"
  from server import app

import sys

if hasattr(sys.stdout, "reconfigure"):
  sys.stdout.reconfigure(encoding="utf-8")

client = TestClient(app)
ADMIN_HEADERS = {"X-Admin-Token": "test_secret_token"}


def run_contract_tests():
  print("[TEST] Running FastAPI API route contract tests...")
  failures = []

  # 1. Health Check
  res = client.get("/health")
  if res.status_code != 200:
    failures.append(f"GET /health failed: status {res.status_code}")

  # 2. Public Search
  res = client.get("/api/v1/search?name=vries")
  if res.status_code != 200:
    failures.append(f"GET /api/v1/search failed: status {res.status_code}")

  # 3. Admin Status
  res = client.get("/api/v1/admin/status", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/status failed: status {res.status_code}")

  # 4. Admin Indexing Progress
  with patch("telemetry._meili_get", return_value={"total": 0, "results": []}):
    res = client.get("/api/v1/admin/indexing", headers=ADMIN_HEADERS)
    if res.status_code != 200:
      failures.append(f"GET /api/v1/admin/indexing failed: status {res.status_code}")

  # 5. Admin Metrics History
  res = client.get("/api/v1/admin/history?minutes=360", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/history failed: status {res.status_code}")

  res = client.get("/api/v1/admin/metrics-history?window_seconds=21600", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/metrics-history failed: status {res.status_code}")

  # 6. Admin Coverage
  res = client.get("/api/v1/admin/coverage", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/coverage failed: status {res.status_code}")

  # 7. Admin Harvest Exports
  with patch("ingest.list_exports", return_value=["ade.bsg.csv.gz", "frl.not.csv.gz"]):
    res = client.get("/api/v1/admin/harvest/exports", headers=ADMIN_HEADERS)
    if res.status_code != 200:
      failures.append(f"GET /api/v1/admin/harvest/exports failed: status {res.status_code}")

  # 8. Admin Batch Telemetry
  res = client.get("/api/v1/admin/batch-telemetry", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/batch-telemetry failed: status {res.status_code}")

  if failures:
    print("❌ PRE-FLIGHT CONTRACT TESTS FAILED:")
    for f in failures:
      print(f"  - {f}")
    sys.exit(1)

  print("✓ All 8 core API route contracts verified successfully!")


if __name__ == "__main__":
  run_contract_tests()
