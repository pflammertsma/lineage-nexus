import os
import time
import psutil
import meilisearch
from fastapi import FastAPI, Query, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any

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
