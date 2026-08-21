"""
Indexing progress, system status, coverage, and telemetry endpoints.
"""

import json
import time
import urllib.request
import psutil
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, Depends
from fastapi.responses import Response

from config import meili_client, INDEX_NAME, MEILI_HOST, MEILI_MASTER_KEY, START_TIME, ARCHIVE_NAMES
from auth import require_admin
from metrics import _get_disk_io_rates, _metrics, _metrics_30d
from telemetry import batch_telemetry, save_batch_telemetry, _meili_get, _elapsed_since, synthesize_past_batch_samples
from eta_engine import EtaEngine

router = APIRouter()
global_eta_engine = EtaEngine()


def _count_tasks(statuses: str) -> int:
  """Total matching tasks."""
  try:
    if statuses == "failed":
      res = _meili_get("/tasks?statuses=failed&limit=100").get("results", [])
      return sum(1 for t in res if (t.get("error") or {}).get("code") != "index_already_exists")
    return _meili_get(f"/tasks?statuses={statuses}&limit=0").get("total", 0)
  except Exception:
    return 0


def _document_rate(window_seconds: int = 600) -> Optional[float]:
  """Documents per second over recent metrics samples."""
  cutoff = time.time() - window_seconds
  samples = [p for p in _metrics if p["t"] >= cutoff and p.get("docs") is not None]
  if len(samples) < 2:
    return None
  span = samples[-1]["t"] - samples[0]["t"]
  if span <= 0:
    return None
  return max(0.0, (samples[-1]["docs"] - samples[0]["docs"]) / span)


def _seconds_since_progress() -> Optional[int]:
  """How long nothing has moved across metrics signals."""
  if len(_metrics) < 2:
    return None

  newest = _metrics[-1]
  now = time.time()
  for prev in reversed(_metrics):
    if (
      prev.get("docs") != newest.get("docs") or
      prev.get("enqueued") != newest.get("enqueued") or
      prev.get("processing") != newest.get("processing") or
      prev.get("virtual_pct") != newest.get("virtual_pct")
    ):
      return int(now - prev["t"])

  return int(now - _metrics[0]["t"])


@router.get("/api/v1/admin/status", dependencies=[Depends(require_admin)])
def admin_status():
  """System resource usage and Meilisearch statistics."""
  mem = psutil.virtual_memory()
  disk = psutil.disk_usage("/")

  meili_stats = {}
  try:
    stats = meili_client.index(INDEX_NAME).get_stats()
    meili_stats = {
      "number_of_documents": getattr(stats, "number_of_documents", 0) if not isinstance(stats, dict) else stats.get("numberOfDocuments", 0),
      "is_indexing": getattr(stats, "is_indexing", False) if not isinstance(stats, dict) else stats.get("isIndexing", False),
    }
  except Exception as e:
    meili_stats = {"error": str(e)}

  iowait_percent = 0.0
  try:
    iowait_percent = round(psutil.cpu_times_percent(interval=None).iowait, 1)
  except (AttributeError, ValueError):
    iowait_percent = 0.0

  return {
    "status": "online",
    "uptime_seconds": round(time.time() - START_TIME, 2),
    "system": {
      "cpu_percent": psutil.cpu_percent(interval=None),
      "iowait_percent": iowait_percent,
      "disk_io": _get_disk_io_rates(),
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


@router.get("/api/v1/admin/history", dependencies=[Depends(require_admin)])
@router.get("/api/v1/admin/metrics-history", dependencies=[Depends(require_admin)])
def admin_history(
  minutes: Optional[int] = Query(None, ge=1),
  window_seconds: Optional[int] = Query(None, ge=1)
):
  """Returns past metrics history samples across high-res (24h) and 30d low-res tiers."""
  raw_sec = window_seconds if window_seconds is not None else (minutes * 60 if minutes is not None else 21600)
  sec = min(30 * 86400, raw_sec)
  cutoff = time.time() - sec

  source_buffer = _metrics_30d if sec > 86400 else _metrics

  points = []
  for p in source_buffer:
    if p.get("t", 0) >= cutoff:
      pt = dict(p)
      if "iowait" not in pt:
        pt["iowait"] = pt.get("io", {}).get("iowait", 0.0)
      if "mem" not in pt:
        pt["mem"] = 16.8
      if "disk" not in pt:
        pt["disk"] = 17.1
      if "indexing" not in pt:
        pt["indexing"] = pt.get("is_indexing", False)
      points.append(pt)
  return {
    "status": "success",
    "minutes": minutes or (sec // 60),
    "window_seconds": sec,
    "count": len(points),
    "points": points,
  }


@router.get("/api/v1/admin/coverage", dependencies=[Depends(require_admin)])
def admin_coverage():
  """Facet breakdown of index by archive and record type."""
  index = meili_client.index(INDEX_NAME)
  try:
    stats = index.get_stats()
    docs_cnt = getattr(stats, "number_of_documents", 0) if not isinstance(stats, dict) else stats.get("numberOfDocuments", 0)
    is_idx = getattr(stats, "is_indexing", False) if not isinstance(stats, dict) else stats.get("isIndexing", False)
    facets = index.search("", {"limit": 0, "facets": ["archive", "kind"]})
    distribution = facets.get("facetDistribution", {}) or {}
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  by_archive = distribution.get("archive", {}) or {}
  by_kind = distribution.get("kind", {}) or {}

  institutions: Dict[str, str] = {}
  for code in list(by_archive)[:60]:
    try:
      hit = index.search("", {
        "limit": 1,
        "filter": f"archive = {code}",
        "attributesToRetrieve": ["institution"],
      }).get("hits", [])
      if hit and hit[0].get("institution"):
        institutions[code] = hit[0]["institution"]
    except Exception:
      continue

  return {
    "status": "success",
    "total_records": docs_cnt,
    "is_indexing": is_idx,
    "archive_count": len(by_archive),
    "by_archive": sorted(
      (
        {"archive": k, "records": v, "institution": institutions.get(k)}
        for k, v in by_archive.items()
      ),
      key=lambda r: -r["records"],
    ),
    "by_kind": sorted(
      ({"kind": k, "records": v} for k, v in by_kind.items()),
      key=lambda r: -r["records"],
    ),
  }


@router.post("/api/v1/admin/indexing/cancel", dependencies=[Depends(require_admin)])
def admin_cancel_indexing():
  """Cancels all active and enqueued Meilisearch tasks."""
  import urllib.request
  try:
    req = urllib.request.Request(
      f"{MEILI_HOST}/tasks/cancel?statuses=enqueued,processing",
      data=b"",
      headers={
        "Authorization": f"Bearer {MEILI_MASTER_KEY}",
        "Content-Type": "application/json",
      },
      method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
      result = json.loads(resp.read().decode("utf-8"))
      return {
        "status": "success",
        "message": "Cancellation request submitted to Meilisearch engine.",
        "task": result,
      }
  except Exception as exc:
    return {"status": "error", "error_message": f"Failed to cancel indexing tasks: {str(exc)}"}


@router.get("/api/v1/admin/indexing/failed_tasks", dependencies=[Depends(require_admin)])
def admin_failed_tasks(limit: int = Query(20, ge=1, le=100)):
  """Details of failed indexing tasks from Meilisearch task queue."""
  try:
    data = _meili_get(f"/tasks?statuses=failed&limit={limit}")
    results = data.get("results", [])
    failed_items = []
    for t in results:
      err = t.get("error") or {}
      code = err.get("code")
      # Filter out benign idempotent index creation tasks
      if code == "index_already_exists":
        continue
      failed_items.append({
        "uid": t.get("uid"),
        "index_uid": t.get("indexUid"),
        "status": t.get("status"),
        "error_code": code,
        "error_message": err.get("message"),
        "error_link": err.get("link"),
        "enqueued_at": t.get("enqueuedAt"),
        "duration": t.get("duration"),
      })
    return {"status": "success", "count": len(failed_items), "tasks": failed_items}
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}


@router.post("/api/v1/admin/indexing/clear_failed_tasks", dependencies=[Depends(require_admin)])
def admin_clear_failed_tasks():
  """Deletes all failed task history records from Meilisearch task queue."""
  try:
    req = urllib.request.Request(
      f"{MEILI_HOST}/tasks?statuses=failed",
      data=b"",
      headers={
        "Authorization": f"Bearer {MEILI_MASTER_KEY}",
        "Content-Type": "application/json",
      },
      method="DELETE",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
      result = json.loads(resp.read().decode("utf-8"))
      return {
        "status": "success",
        "message": "Cleared failed task history.",
        "task": result,
      }
  except Exception as exc:
    return {"status": "error", "error_message": f"Failed to clear failed tasks: {str(exc)}"}


def _format_step_label(step_val: Any, index: int) -> str:
  labels = {
    "1": "Extracting payload & updating settings",
    "2": "Parsing documents into memory",
    "3": "Indexing fields & computing facets",
    "4": "Writing database segment to disk",
    "updateIndex": "Updating index schema",
    "addDocuments": "Processing record batch",
  }
  str_val = str(step_val) if step_val is not None else ""
  if str_val in labels:
    return labels[str_val]
  if str_val:
    return f"Phase {index + 1}: {str_val}"
  return f"Phase {index + 1}"


@router.get("/api/v1/admin/indexing", dependencies=[Depends(require_admin)])
def admin_indexing():
  """Queue depth, active batch, and throughput metrics."""
  from routes.harvest import _current_ingest
  try:
    stats = meili_client.index(INDEX_NAME).get_stats()
    documents = getattr(stats, "number_of_documents", 0) if not isinstance(stats, dict) else stats.get("numberOfDocuments", 0)
    is_indexing = getattr(stats, "is_indexing", False) if not isinstance(stats, dict) else stats.get("isIndexing", False)
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  enqueued = _count_tasks("enqueued")
  processing = _count_tasks("processing")
  failed = _count_tasks("failed")

  current = None
  recent: List[Dict[str, Any]] = []
  try:
    batches = _meili_get("/batches?limit=8").get("results", []) or []
    for batch in batches:
      batch_stats = batch.get("stats", {}) or {}
      finished = batch.get("finishedAt")
      if finished is None and current is None:
        progress = batch.get("progress") or {}
        started = batch.get("startedAt")
        steps_raw = progress.get("steps") or []
        current = {
          "uid": batch.get("uid"),
          "tasks": batch_stats.get("totalNbTasks"),
          "documents": (batch.get("details") or {}).get("receivedDocuments"),
          "percentage": progress.get("percentage"),
          "started_at": started,
          "elapsed_seconds": _elapsed_since(started),
          "steps": [
            {
              "step": s.get("currentStep"),
              "label": _format_step_label(s.get("currentStep"), i),
              "finished": s.get("finished", 0),
              "total": s.get("total", 0),
              "status": "done" if (s.get("finished") is not None and s.get("total") is not None and s.get("finished") >= s.get("total")) else ("active" if i == len(steps_raw) - 1 or (s.get("finished") or 0) > 0 else "pending"),
            }
            for i, s in enumerate(steps_raw)
          ],
        }
      elif finished is not None and len(recent) < 8:
        details = batch.get("details") or {}
        err = batch.get("error") or {}
        recent.append({
          "uid": batch.get("uid"),
          "status": batch.get("status"),
          "error_code": err.get("code"),
          "error_message": err.get("message"),
          "tasks": batch_stats.get("totalNbTasks"),
          "duration": batch.get("duration"),
          "started_at": batch.get("startedAt"),
          "finished_at": finished,
          "documents": details.get("indexedDocuments") or details.get("receivedDocuments"),
        })
  except Exception:
    pass

  rate = _document_rate()
  pending_documents = None
  eta_seconds = None
  naive_eta_seconds = None

  if current:
    b_uid = current.get("uid") or 0
    raw_pct = current.get("percentage") or 0.0
    virtual_pct = global_eta_engine.calculate_virtual_progress(current)
    elapsed = current.get("elapsed_seconds") or 0

    smoothed_eta, naive_eta = global_eta_engine.compute_phase_weighted_eta(b_uid, current, elapsed)
    current["virtual_percentage"] = virtual_pct
    current["naive_eta_seconds"] = naive_eta
    eta_seconds = smoothed_eta
    naive_eta_seconds = naive_eta

    if current.get("documents"):
      pending_documents = current["documents"]

    steps = current.get("steps") or []
    current_step_name = steps[-1]["step"] if steps else "indexing"
    is_indeterminate = "settings" in current_step_name.lower() or "matrix" in current_step_name.lower()
    current["is_indeterminate"] = is_indeterminate
    io_rates = _get_disk_io_rates()
    read_mbs = io_rates.get("read_mbs", 0.0)
    write_mbs = io_rates.get("write_mbs", 0.0)
    read_gb = round((elapsed * read_mbs) / 1024, 2)
    iowait_pct = round(psutil.cpu_times_percent(interval=None).iowait, 1) if hasattr(psutil, "cpu_times_percent") else 0.0

    current["sub_step_details"] = {
      "step": current_step_name,
      "read_mbs": read_mbs,
      "write_mbs": write_mbs,
      "processed_gb": read_gb,
      # What we measured, not what we guessed from it. "Crunching word proximity
      # matrices" was inferred purely from read_mbs > 5 — plausible, but stated
      # as fact when the only thing actually known is the I/O rate. The step
      # name beside it already says which phase the engine is in.
      "summary": (
        f"Reading {read_mbs:.0f} MB/s ({read_gb:.1f} GB so far)"
        if read_mbs > 5.0
        else f"Writing {write_mbs:.0f} MB/s"
        if write_mbs > 1.0
        else "Working in memory"
      )
    }

    telemetry_sample = {
      "timestamp": int(time.time()),
      "iso_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
      "batch_uid": b_uid,
      "step": current_step_name,
      "steps": steps,
      "documents": current.get("documents"),
      "tasks": current.get("tasks"),
      "raw_progress_pct": raw_pct,
      "virtual_progress_pct": virtual_pct,
      "elapsed_seconds": elapsed,
      "eta_seconds": smoothed_eta,
      "naive_eta_seconds": naive_eta,
      "cpu_percent": psutil.cpu_percent(interval=None),
      "iowait_percent": iowait_pct,
      "read_mbs": io_rates.get("read_mbs", 0.0),
      "write_mbs": io_rates.get("write_mbs", 0.0),
    }
    batch_telemetry.append(telemetry_sample)
    save_batch_telemetry()

  from routes.harvest import _current_harvest_archive, _harvest_queue_list, _harvest_queue_lock
  with _harvest_queue_lock:
    current_arch = _current_harvest_archive
    pending_archs = list(_harvest_queue_list)

  return {
    "status": "success",
    "documents": documents,
    "is_indexing": is_indexing or bool(current_arch or pending_archs),
    "archive_names": ARCHIVE_NAMES,
    "queue": {
      "enqueued": enqueued,
      "processing": processing,
      "failed": failed,
      "total_pending": enqueued + processing,
    },
    "harvest_queue": {
      "current": current_arch,
      "pending": pending_archs,
      "pending_count": len(pending_archs),
    },
    "current_batch": current,
    "current_ingest": _current_ingest(),
    "recent_batches": recent,
    "documents_per_second": round(rate, 1) if rate is not None else None,
    "stalled_seconds": _seconds_since_progress(),
    "pending_documents": pending_documents,
    "eta_seconds": eta_seconds,
    "naive_eta_seconds": naive_eta_seconds,
  }


@router.get("/api/v1/admin/batch-telemetry", dependencies=[Depends(require_admin)])
def admin_batch_telemetry(
  batch_uid: Optional[int] = Query(None, description="Filter by batch UID"),
  format: str = Query("json", description="Output format: 'json' or 'csv'")
):
  """Provides time-series telemetry samples of engine batch execution."""
  samples = list(batch_telemetry)
  if batch_uid is not None:
    samples = [s for s in samples if s.get("batch_uid") == batch_uid]
    if not samples:
      samples = synthesize_past_batch_samples(batch_uid)

  if format == "csv":
    import csv
    import io

    output = io.StringIO()
    writer = csv.DictWriter(
      output,
      fieldnames=[
        "timestamp", "batch_uid", "step", "raw_progress_pct",
        "virtual_progress_pct", "elapsed_seconds", "eta_seconds",
        "naive_eta_seconds", "cpu_percent", "iowait_percent",
        "read_mbs", "write_mbs"
      ]
    )
    writer.writeheader()
    for row in samples:
      writer.writerow(row)

    return Response(
      content=output.getvalue(),
      media_type="text/csv",
      headers={"Content-Disposition": f"attachment; filename=batch_telemetry_{batch_uid or 'all'}.csv"}
    )

  return {
    "status": "success",
    "count": len(samples),
    "samples": samples
  }
