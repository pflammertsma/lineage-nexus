"""
Archival catalog listing and harvest queue management endpoints.
"""

import os
import sys
import re
import time
import json
import logging
import threading
import pydantic
import subprocess
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends

from config import meili_client, INDEX_NAME, ARCHIVE_NAMES
from auth import require_admin
from telemetry import _meili_get

logger = logging.getLogger("ingest.queue")
router = APIRouter()

INGEST_LOG_DIR = os.environ.get("INGEST_LOG_DIR", "/ingest-logs")

_INGEST_STREAMING = re.compile(r"streaming ([a-z0-9_]+)\.([a-z0-9_]+)")
_INGEST_SUBMITTED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) submitted \(([\d.]+) rec/s\)"
)
_INGEST_FINISHED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) records from ([\d,]+) rows"
)

_active_ingest_process: Optional[subprocess.Popen] = None
_harvest_queue_list: List[str] = []
_harvest_queue_lock = threading.Lock()
_harvest_runner_thread: Optional[threading.Thread] = None
_current_harvest_archive: Optional[str] = None


def _wait_for_meili_indexing_to_complete(timeout_seconds: int = 7200, check_interval: int = 3):
  """Waits until all pending and processing tasks in Meilisearch reach zero."""
  time.sleep(4)  # Allow initial task submissions to settle
  start = time.time()
  while time.time() - start < timeout_seconds:
    try:
      data = _meili_get("/tasks?statuses=enqueued,processing&limit=1")
      total_pending = data.get("total", 0)
      if total_pending == 0:
        logger.info("[Queue Worker] Meilisearch queue empty — indexing finished!")
        break
    except Exception as exc:
      logger.warning(f"[Queue Worker] Error checking task queue: {exc}")
    time.sleep(check_interval)


def _harvest_queue_worker():
  """Background daemon worker executing queued archive harvests sequentially."""
  global _current_harvest_archive, _active_ingest_process
  service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

  while True:
    archive_code = None
    with _harvest_queue_lock:
      if not _harvest_queue_list:
        _current_harvest_archive = None
        break
      archive_code = _harvest_queue_list.pop(0)
      _current_harvest_archive = archive_code

    logger.info(f"[Queue Worker] Starting harvest for archive: {archive_code}")
    cmd = [sys.executable, "ingest.py", archive_code]
    log_dir = INGEST_LOG_DIR
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "ingest.log")

    try:
      with open(log_path, "a", encoding="utf-8") as log_file:
        _active_ingest_process = subprocess.Popen(
          cmd, stdout=log_file, stderr=subprocess.STDOUT, cwd=service_root
        )
        _active_ingest_process.wait()
    except Exception as exc:
      logger.error(f"[Queue Worker] Error ingesting archive {archive_code}: {exc}")

    logger.info(f"[Queue Worker] Harvest ingest payload finished for {archive_code}. Waiting for Meilisearch indexing...")
    _wait_for_meili_indexing_to_complete()
    logger.info(f"[Queue Worker] Meilisearch indexing complete for {archive_code}.")

  with _harvest_queue_lock:
    _current_harvest_archive = None


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

  planned = None
  try:
    with open(os.path.join(INGEST_LOG_DIR, "plan.json"), "r", encoding="utf-8") as handle:
      planned = (json.load(handle) or {}).get("files")
  except (OSError, ValueError):
    planned = None

  planned_cnt = len(planned) if isinstance(planned, list) else None
  if planned_cnt and completed >= planned_cnt:
    is_active = False

  if any("Ingest complete" in l or "Harvest complete" in l or "Finished" in l for l in tail):
    is_active = False

  return {
    "archive": archive or _current_harvest_archive,
    "kind": kind,
    "files_total": planned_cnt,
    "submitted": submitted,
    "rows_per_second": rate if is_active else None,
    "waiting_for_queue": waiting if is_active else False,
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

  with _harvest_queue_lock:
    current_active = _current_harvest_archive
    pending_queue = list(_harvest_queue_list)

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
    if code == current_active:
      archives_dict[code]["status"] = "harvesting"
    elif code in pending_queue:
      archives_dict[code]["status"] = "queued"
    elif archives_dict[code]["indexed_records"] > 0:
      archives_dict[code]["status"] = "indexed"

  archives_list = sorted(archives_dict.values(), key=lambda a: (-a["indexed_records"], a["code"]))

  return {
    "status": "success",
    "summary": {
      "total_archives": len(archives_list),
      "indexed_archives": sum(1 for a in archives_list if a["indexed_records"] > 0),
      "harvesting_archive": current_active,
      "queued_archives_count": len(pending_queue),
      "total_export_files": len(available_files),
    },
    "current_archive": current_active,
    "pending_queue": pending_queue,
    "archives": archives_list
  }


class HarvestQueueRequest(pydantic.BaseModel):
  archives: List[str] = []


@router.post("/api/v1/admin/harvest/queue", dependencies=[Depends(require_admin)])
def admin_queue_harvest(req: HarvestQueueRequest):
  """Queues selected archive codes for sequential background ingestion."""
  global _harvest_runner_thread
  if not req.archives:
    raise HTTPException(status_code=400, detail="No archive codes specified to queue.")

  added = []
  with _harvest_queue_lock:
    for code in req.archives:
      if code != _current_harvest_archive and code not in _harvest_queue_list:
        _harvest_queue_list.append(code)
        added.append(code)

  if _harvest_runner_thread is None or not _harvest_runner_thread.is_alive():
    _harvest_runner_thread = threading.Thread(target=_harvest_queue_worker, daemon=True)
    _harvest_runner_thread.start()

  return {
    "status": "success",
    "queued_archives": added,
    "pending_queue": list(_harvest_queue_list),
    "current_archive": _current_harvest_archive,
    "message": f"Queued {len(added)} archive(s) for background processing."
  }


@router.post("/api/v1/admin/harvest/queue/clear", dependencies=[Depends(require_admin)])
def admin_clear_harvest_queue():
  """Clears all pending archives from the harvest queue."""
  with _harvest_queue_lock:
    cleared_count = len(_harvest_queue_list)
    _harvest_queue_list.clear()
  return {
    "status": "success",
    "cleared_count": cleared_count,
    "message": f"Cleared {cleared_count} pending archives from queue."
  }


@router.post("/api/v1/admin/harvest/queue/remove", dependencies=[Depends(require_admin)])
def admin_remove_from_harvest_queue(data: Dict[str, str]):
  """Removes a specific archive code from the pending harvest queue."""
  code = data.get("archive")
  removed = False
  with _harvest_queue_lock:
    if code in _harvest_queue_list:
      _harvest_queue_list.remove(code)
      removed = True
  return {
    "status": "success",
    "removed": removed,
    "pending_queue": list(_harvest_queue_list)
  }

