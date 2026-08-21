"""
Archival catalog listing and harvest queue management endpoints.
"""

import os
import re
import time
import json
import pydantic
import subprocess
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends

from config import meili_client, INDEX_NAME, ARCHIVE_NAMES
from auth import require_admin

router = APIRouter()

INGEST_LOG_DIR = os.environ.get("INGEST_LOG_DIR", "/ingest-logs")

_INGEST_STREAMING = re.compile(r"streaming ([a-z0-9_]+)\.([a-z0-9_]+)")
_INGEST_SUBMITTED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) submitted \(([\d.]+) rec/s\)"
)
_INGEST_FINISHED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) records from ([\d,]+) rows"
)

_active_ingest_process = None


def _current_ingest() -> Optional[Dict[str, Any]]:
  """What the harvester is working on, read from the tail of its log."""
  try:
    logs = [
      os.path.join(INGEST_LOG_DIR, name)
      for name in os.listdir(INGEST_LOG_DIR)
      if name.endswith(".log")
    ]
    if not logs:
      return None
    newest = max(logs, key=os.path.getmtime)
    age = time.time() - os.path.getmtime(newest)
    if age > 300:
      return None

    with open(newest, "r", encoding="utf-8", errors="replace") as handle:
      lines = handle.read().splitlines()
    tail = lines[-200:]
  except OSError:
    return None

  archive = kind = None
  submitted = None
  rate = None
  waiting = False
  completed = 0
  is_active = False

  for line in lines:
    if _INGEST_FINISHED.search(line):
      completed += 1

  for line in tail:
    match = _INGEST_STREAMING.search(line)
    if match:
      archive, kind = match.group(1), match.group(2)
      submitted, rate = None, None
      is_active = True
    match = _INGEST_SUBMITTED.search(line)
    if match:
      archive, kind = match.group(1), match.group(2)
      submitted = int(match.group(3).replace(",", ""))
      rate = float(match.group(4))
      is_active = True
    if "waiting for queue" in line:
      waiting = True
      is_active = True

  if not archive:
    for line in reversed(lines):
      match = _INGEST_STREAMING.search(line) or _INGEST_SUBMITTED.search(line)
      if match:
        archive, kind = match.group(1), match.group(2)
        break

  if not archive:
    return None

  planned = None
  try:
    with open(os.path.join(INGEST_LOG_DIR, "plan.json"), "r", encoding="utf-8") as handle:
      planned = (json.load(handle) or {}).get("files")
  except (OSError, ValueError):
    planned = None

  return {
    "archive": archive,
    "kind": kind,
    "files_total": len(planned) if isinstance(planned, list) else None,
    "submitted": submitted,
    "rows_per_second": rate,
    "waiting_for_queue": waiting,
    "files_completed": completed,
    "log_age_seconds": int(age),
    "is_active": is_active,
  }


@router.get("/api/v1/admin/harvest/exports", dependencies=[Depends(require_admin)])
def admin_harvest_exports():
  """Catalog of all Open Archieven CSV exports across Dutch regional archives."""
  from ingest import list_exports
  try:
    available_files = list_exports()
  except Exception as exc:
    return {"status": "error", "error_message": f"Failed to list exports: {str(exc)}"}

  index = meili_client.index(INDEX_NAME)
  indexed_by_archive = {}
  try:
    facets = index.search("", {"limit": 0, "facets": ["archive"]})
    indexed_by_archive = facets.get("facetDistribution", {}).get("archive", {}) or {}
  except Exception:
    pass

  active_plan_files = set()
  try:
    with open(os.path.join(INGEST_LOG_DIR, "plan.json"), "r", encoding="utf-8") as handle:
      active_plan_files = set((json.load(handle) or {}).get("files", []))
  except (OSError, ValueError):
    pass

  archives_dict: Dict[str, Dict[str, Any]] = {}
  for item in available_files:
    if isinstance(item, str):
      file_name = item
      code = item.split(".")[0]
    elif isinstance(item, dict):
      file_name = item.get("file", "")
      code = item.get("archive", "")
    else:
      continue

    if code not in archives_dict:
      archives_dict[code] = {
        "code": code,
        "name": ARCHIVE_NAMES.get(code, f"Archive {code.upper()}"),
        "indexed_records": indexed_by_archive.get(code, 0),
        "export_count": 0,
        "files": [],
        "kinds": [],
        "status": "unindexed"
      }
    archives_dict[code]["export_count"] += 1
    archives_dict[code]["files"].append(file_name)

    parts = file_name.split(".")
    if len(parts) > 1:
      k = parts[1]
      if k and k not in archives_dict[code]["kinds"]:
        archives_dict[code]["kinds"].append(k)

  for code in archives_dict:
    if archives_dict[code]["indexed_records"] > 0:
      archives_dict[code]["status"] = "indexed"
    elif any(f in active_plan_files for f in archives_dict[code]["files"]):
      archives_dict[code]["status"] = "queued"

  archives_list = sorted(archives_dict.values(), key=lambda a: (-a["indexed_records"], a["code"]))

  return {
    "status": "success",
    "summary": {
      "total_archives": len(archives_list),
      "indexed_archives": sum(1 for a in archives_list if a["indexed_records"] > 0),
      "total_export_files": len(available_files),
    },
    "archives": archives_list
  }


class HarvestQueueRequest(pydantic.BaseModel):
  archives: List[str] = []


@router.post("/api/v1/admin/harvest/queue", dependencies=[Depends(require_admin)])
def admin_queue_harvest(req: HarvestQueueRequest):
  """Queues selected archive codes for background ingestion."""
  global _active_ingest_process
  if not req.archives:
    raise HTTPException(status_code=400, detail="No archive codes specified to queue.")

  if _active_ingest_process and _active_ingest_process.poll() is None:
    return {
      "status": "error",
      "error_message": "An ingestion run is already in progress on the server."
    }

  cmd = ["python", "ingest.py"] + req.archives
  try:
    log_dir = os.environ.get("INGEST_LOG_DIR", "/logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "ingest.log")
    log_file = open(log_path, "a", encoding="utf-8")

    _active_ingest_process = subprocess.Popen(
      cmd,
      stdout=log_file,
      stderr=subprocess.STDOUT,
      cwd=os.path.dirname(__file__) or "."
    )
    return {
      "status": "success",
      "queued_archives": req.archives,
      "pid": _active_ingest_process.pid,
      "message": f"Queued {len(req.archives)} archives for ingestion."
    }
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}
