import asyncio
import os
import time
import psutil
from collections import deque
import meilisearch
from fastapi import FastAPI, Query, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Any, Deque, Dict, List, Optional

app = FastAPI(
  title="Lineage Nexus Archival Gateway Engine",
  version="1.0.0",
  description="High-speed self-hosted Dutch historical record search API powered by Meilisearch."
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

MEILI_HOST = os.environ.get("MEILI_HOST", "http://127.0.0.1:7700")
MEILI_MASTER_KEY = os.environ.get("MEILI_MASTER_KEY", "")
ADMIN_SECRET_TOKEN = os.environ.get("ADMIN_SECRET_TOKEN", "")
INDEX_NAME = "records"
START_TIME = time.time()

meili_client = meilisearch.Client(MEILI_HOST, MEILI_MASTER_KEY)

# Admin auth lives in auth.py. It accepts either a Firebase ID token with an
# `admin` claim (used by the web dashboard, no secret in the browser) or the
# X-Admin-Token shared secret (used by curl). The old comparison here was a plain
# `!=`, which is not constant-time.
from auth import require_admin

@app.get("/health")
def health_check():
  return {"status": "ok", "meilisearch": MEILI_HOST}

@app.get("/api/v1/search")
def search_records(
  name: str = Query(..., description="Query names or patronymics"),
  eventplace: Optional[str] = Query(None, description="Event city or place name"),
  eventtype: Optional[str] = Query(None, description="Event type (Geboorte, Huwelijk, Overlijden)"),
  start: int = Query(0, ge=0),
  number_show: int = Query(30, le=100)
):
  """
  Performs sub-10ms search over self-hosted Dutch archival records.
  Matches the output structure expected by the Research Orchestrator.
  """
  index = meili_client.index(INDEX_NAME)

  filter_conditions = []
  if eventplace:
    filter_conditions.append(f"event_place = '{eventplace}'")
  if eventtype:
    filter_conditions.append(f"event_type = '{eventtype}'")

  search_params = {
    "limit": number_show,
    "offset": start,
  }
  if filter_conditions:
    search_params["filter"] = " AND ".join(filter_conditions)

  try:
    results = index.search(name, search_params)
    docs = results.get("hits", [])
    total_found = results.get("estimatedTotalHits", len(docs))

    return {
      "status": "success",
      "total_found": total_found,
      "number_found": total_found,
      "records": docs
    }
  except Exception as e:
    return {"status": "error", "error_message": str(e)}

@app.get("/api/v1/record/{archive_code}/{identifier}")
def get_record(archive_code: str, identifier: str):
  """Retrieves a single record by archive code and identifier."""
  doc_id = f"{archive_code}_{identifier}".replace(":", "_").replace("-", "_")
  try:
    index = meili_client.index(INDEX_NAME)
    doc = index.get_document(doc_id)
    return {"status": "success", "record": doc}
  except Exception as e:
    raise HTTPException(status_code=404, detail=f"Record not found: {str(e)}")

@app.get("/api/v1/admin/status", dependencies=[Depends(require_admin)])
def get_admin_status():
  """
  Private Admin API endpoint providing detailed system metrics and archival engine status.
  Protected via X-Admin-Token authentication.
  """
  mem = psutil.virtual_memory()
  disk = psutil.disk_usage("/")
  
  meili_stats = {}
  try:
    idx = meili_client.index(INDEX_NAME)
    stats_obj = idx.get_stats()
    meili_stats = {
      "numberOfDocuments": getattr(stats_obj, "number_of_documents", 0),
      "isIndexing": getattr(stats_obj, "is_indexing", False),
      "fieldDistribution": dict(getattr(stats_obj, "field_distribution", {})) if hasattr(stats_obj, "field_distribution") else {}
    }
  except Exception as e:
    meili_stats = {"error": str(e)}

  return {
    "status": "online",
    "uptime_seconds": round(time.time() - START_TIME, 2),
    "system": {
      "cpu_percent": psutil.cpu_percent(interval=None),
      "memory": {
        "total_mb": round(mem.total / (1024 * 1024), 2),
        "used_mb": round(mem.used / (1024 * 1024), 2),
        "free_mb": round(mem.free / (1024 * 1024), 2),
        "percent": mem.percent
      },
      "disk": {
        "total_gb": round(disk.total / (1024 ** 3), 2),
        "used_gb": round(disk.used / (1024 ** 3), 2),
        "free_gb": round(disk.free / (1024 ** 3), 2),
        "percent": disk.percent
      }
    },
    "archival_engine": {
      "meilisearch_url": MEILI_HOST,
      "index_name": INDEX_NAME,
      "stats": meili_stats
    }
  }

if __name__ == "__main__":
  import uvicorn
  uvicorn.run(app, host="0.0.0.0", port=8090)


# --- Metrics history ------------------------------------------------------
# /api/v1/admin/status is a single instant, which cannot draw a line. A ring
# buffer of samples gives the dashboard six hours of history without a
# time-series database: 6h at 15s is 1440 points, a few hundred kB.
#
# In memory only, so it resets when the container restarts. That is a fair trade
# for the complexity avoided; if history needs to survive deploys, this is the
# point to swap in real storage.
METRICS_INTERVAL_SECONDS = 15
METRICS_WINDOW_SECONDS = 6 * 60 * 60
METRICS_CAPACITY = METRICS_WINDOW_SECONDS // METRICS_INTERVAL_SECONDS

_metrics: Deque[Dict[str, Any]] = deque(maxlen=METRICS_CAPACITY)


async def _sample_metrics() -> None:
  """Records one sample per interval for the lifetime of the process."""
  while True:
    try:
      mem = psutil.virtual_memory()
      disk = psutil.disk_usage("/")
      docs = None
      indexing = None
      try:
        stats = meili_client.index(INDEX_NAME).get_stats()
        docs = stats.number_of_documents
        indexing = stats.is_indexing
      except Exception:
        # Meilisearch being unreachable should not stop CPU/memory history.
        pass

      _metrics.append({
        "t": int(time.time()),
        # interval=None so the first call does not block for a second.
        "cpu": psutil.cpu_percent(interval=None),
        "mem": round(mem.percent, 1),
        "disk": round(disk.percent, 1),
        "docs": docs,
        "indexing": indexing,
      })
    except Exception:
      pass
    await asyncio.sleep(METRICS_INTERVAL_SECONDS)


@app.on_event("startup")
async def _start_metrics() -> None:
  psutil.cpu_percent(interval=None)  # prime the counter; the first read is always 0
  asyncio.create_task(_sample_metrics())


@app.get("/api/v1/admin/history", dependencies=[Depends(require_admin)])
def admin_history(minutes: int = Query(360, ge=5, le=360)):
  """Samples from the last `minutes`, oldest first."""
  cutoff = time.time() - minutes * 60
  points = [p for p in _metrics if p["t"] >= cutoff]
  return {
    "status": "success",
    "interval_seconds": METRICS_INTERVAL_SECONDS,
    "window_minutes": minutes,
    "count": len(points),
    "points": points,
  }


@app.get("/api/v1/admin/query", dependencies=[Depends(require_admin)])
def admin_query(
  q: str = Query(..., min_length=1, description="Free-text name or place"),
  archive: Optional[str] = Query(None, description="Restrict to one archive code"),
  kind: Optional[str] = Query(None, description="Restrict to one record type"),
  limit: int = Query(20, ge=1, le=100),
):
  """
  Raw index search for validating coverage. No AI, no orchestration.

  Reports where each hit came from — archive, record type and institution — so a
  result can be traced to the export it was ingested from. That is the point of
  this endpoint: answering "is this record actually in there, and from where".
  """
  index = meili_client.index(INDEX_NAME)

  filters = []
  if archive:
    filters.append(f"archive = '{archive}'")
  if kind:
    filters.append(f"kind = '{kind}'")

  params: Dict[str, Any] = {"limit": limit}
  if filters:
    params["filter"] = " AND ".join(filters)

  started = time.time()
  try:
    results = index.search(q, params)
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  hits = []
  for hit in results.get("hits", []):
    hits.append({
      "id": hit.get("id"),
      "names": hit.get("names", ""),
      "persons": hit.get("persons", []),
      "event_type": hit.get("event_type", ""),
      "event_date": hit.get("event_date", ""),
      "event_place": hit.get("event_place", ""),
      # Provenance.
      #
      # `retrieved_from` is the path this result came back on, not who owns the
      # record: every record here originates with Open Archieven, and citations
      # must always point there. What differs is whether we answered from our own
      # snapshot or asked them live — which matters for both latency and
      # freshness, since a snapshot can lag their corrections.
      "retrieved_from": "index",
      "source": {
        "archive": hit.get("archive", ""),
        "kind": hit.get("kind", ""),
        "institution": hit.get("institution", ""),
        "index": INDEX_NAME,
        "last_changed": hit.get("last_changed", ""),
      },
      "url": hit.get("url", ""),
    })

  return {
    "status": "success",
    "query": q,
    "took_ms": round((time.time() - started) * 1000, 1),
    "estimated_total": results.get("estimatedTotalHits", len(hits)),
    "returned": len(hits),
    # Counts per retrieval path, so a caller can tell at a glance whether an
    # answer came from our coverage or from Open Archieven. Both keys are always
    # present, so a consumer never has to distinguish absent from zero.
    "sources": {
      "index": len(hits),
      "openarchieven": 0,
    },
    "hits": hits,
  }


@app.get("/api/v1/admin/coverage", dependencies=[Depends(require_admin)])
def admin_coverage():
  """
  What is actually in the index, broken down by archive and record type.

  Uses Meilisearch facets rather than counting documents, so it stays O(1) as the
  index grows. This is the answer to "have we harvested X yet" — the same
  question the research tools need in order to know when to fall back to the live
  Open Archieven API.
  """
  index = meili_client.index(INDEX_NAME)
  try:
    stats = index.get_stats()
    facets = index.search("", {"limit": 0, "facets": ["archive", "kind"]})
    distribution = facets.get("facetDistribution", {}) or {}
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  by_archive = distribution.get("archive", {}) or {}
  by_kind = distribution.get("kind", {}) or {}

  return {
    "status": "success",
    "total_records": stats.number_of_documents,
    "is_indexing": stats.is_indexing,
    "archive_count": len(by_archive),
    "by_archive": sorted(
      ({"archive": k, "records": v} for k, v in by_archive.items()),
      key=lambda r: -r["records"],
    ),
    "by_kind": sorted(
      ({"kind": k, "records": v} for k, v in by_kind.items()),
      key=lambda r: -r["records"],
    ),
  }
