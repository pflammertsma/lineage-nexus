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

  # 9. Admin Indexing Cancel
  with patch("urllib.request.urlopen") as mock_urlopen:
    mock_resp = MagicMock()
    mock_resp.read.return_value = b'{"taskUid": 42, "status": "enqueued"}'
    mock_urlopen.return_value.__enter__.return_value = mock_resp
    res = client.post("/api/v1/admin/indexing/cancel", headers=ADMIN_HEADERS)
    if res.status_code != 200:
      failures.append(f"POST /api/v1/admin/indexing/cancel failed: status {res.status_code}")

  # 10. Relational Admin Query
  res = client.get("/api/v1/admin/query?q=&archive=arg&father=Jacob&mother=Jacoba&child=Klasina&spouse=Zwieten&role=child&fuzzy=true&names_only=true", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/query with relational filters failed: status {res.status_code}")

  # 11. Inline Query Syntax with Multi-Archive and Year Range Operators
  res = client.get("/api/v1/admin/query?q=Spruijt+archive:arg,ade+year:1840..1860+father:Jacob+mother:Jacoba", headers=ADMIN_HEADERS)
  if res.status_code != 200:
    failures.append(f"GET /api/v1/admin/query with inline syntax failed: status {res.status_code}")

  if failures:
    print("❌ PRE-FLIGHT CONTRACT TESTS FAILED:")
    for f in failures:
      print(f"  - {f}")
    sys.exit(1)

  print("✓ All 11 core API route contracts verified successfully!")


def test_date_interval_math():
  from schema import parse_date_bounds
  from routes.search import _parse_date_string_to_num_bounds

  # 1. Schema parse_date_bounds tests
  assert parse_date_bounds("1873", "7", "25") == (18730725, 18730725)
  assert parse_date_bounds("1873", "7", None) == (18730701, 18730731)
  assert parse_date_bounds("1873", None, None) == (18730101, 18731231)
  assert parse_date_bounds("1872", "2", None) == (18720201, 18720229)

  # 2. Date query string boundary tests
  min_b, max_b = _parse_date_string_to_num_bounds("1873-7")
  assert min_b == 18730701 and max_b == 18730731
  cutoff_lt = min_b - 1
  assert cutoff_lt == 18730700
  assert not (18730725 <= cutoff_lt)  # 1873-7-25 is EXCLUDED from date:<1873-7

  cutoff_le = max_b
  assert 18730725 <= cutoff_le  # 1873-7-25 is INCLUDED in date:<=1873-7


if __name__ == "__main__":
  test_date_interval_math()
  run_contract_tests()
