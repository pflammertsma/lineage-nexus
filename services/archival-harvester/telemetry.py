"""
Telemetry state persistence and fallback synthesis for archival harvester.
"""

import os
import time
import json
import re
import urllib.request
from datetime import datetime, timezone
from collections import deque
from typing import Any, Deque, Dict, List, Optional
from config import MEILI_HOST, MEILI_MASTER_KEY

STATE_DIR = os.environ.get("STATE_DIR", "/state")
TELEMETRY_FILE = os.path.join(STATE_DIR, "batch_telemetry.json")


def _meili_get(path: str) -> Any:
  """Reads a Meilisearch endpoint using standard library urllib."""
  request = urllib.request.Request(
    f"{MEILI_HOST}{path}",
    headers={"Authorization": f"Bearer {MEILI_MASTER_KEY}"},
  )
  with urllib.request.urlopen(request, timeout=10) as response:
    return json.loads(response.read().decode("utf-8"))


def _elapsed_since(timestamp: Optional[str]) -> Optional[int]:
  """Seconds since an RFC 3339 timestamp."""
  if not timestamp:
    return None
  cleaned = re.sub(r"(\.\d{6})\d+", r"\1", timestamp.replace("Z", "+00:00"))
  try:
    started = datetime.fromisoformat(cleaned)
  except ValueError:
    return None
  return max(0, int((datetime.now(timezone.utc) - started).total_seconds()))


def load_batch_telemetry() -> Deque[Dict[str, Any]]:
  if os.path.exists(TELEMETRY_FILE):
    try:
      with open(TELEMETRY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        if isinstance(data, list):
          return deque(data, maxlen=3000)
    except Exception:
      pass
  return deque(maxlen=3000)


def save_batch_telemetry():
  try:
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(TELEMETRY_FILE, "w", encoding="utf-8") as f:
      json.dump(list(batch_telemetry), f)
  except Exception:
    pass


batch_telemetry: Deque[Dict[str, Any]] = load_batch_telemetry()


def synthesize_past_batch_samples(batch_uid: int) -> List[Dict[str, Any]]:
  """Fallback for past completed batches that executed before live telemetry disk persistence was enabled."""
  try:
    batch_data = _meili_get(f"/batches/{batch_uid}")
    if not batch_data or "uid" not in batch_data:
      return []

    started_at = batch_data.get("startedAt")
    finished_at = batch_data.get("finishedAt")
    details = batch_data.get("details") or {}
    docs = details.get("indexedDocuments") or details.get("receivedDocuments")
    tasks_cnt = (batch_data.get("stats") or {}).get("totalNbTasks", 1)

    duration_sec = 0
    if started_at and finished_at:
      dt_start = _elapsed_since(started_at)
      dt_finish = _elapsed_since(finished_at)
      if dt_start is not None and dt_finish is not None:
        duration_sec = max(1, dt_start - dt_finish)

    ts_start = int(time.time()) - (duration_sec or 60)
    ts_end = int(time.time())

    return [
      {
        "timestamp": ts_start,
        "iso_time": started_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts_start)),
        "batch_uid": batch_uid,
        "step": "started",
        "steps": [{"step": "started", "finished": 0, "total": 1}],
        "documents": docs,
        "tasks": tasks_cnt,
        "raw_progress_pct": 0.0,
        "virtual_progress_pct": 0.0,
        "elapsed_seconds": 0,
        "eta_seconds": duration_sec,
        "naive_eta_seconds": duration_sec,
        "cpu_percent": 0.0,
        "iowait_percent": 0.0,
        "read_mbs": 0.0,
        "write_mbs": 0.0,
      },
      {
        "timestamp": ts_end,
        "iso_time": finished_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts_end)),
        "batch_uid": batch_uid,
        "step": "finished",
        "steps": [{"step": "finished", "finished": 1, "total": 1}],
        "documents": docs,
        "tasks": tasks_cnt,
        "raw_progress_pct": 100.0,
        "virtual_progress_pct": 100.0,
        "elapsed_seconds": duration_sec,
        "eta_seconds": 0,
        "naive_eta_seconds": 0,
        "cpu_percent": 0.0,
        "iowait_percent": 0.0,
        "read_mbs": 0.0,
        "write_mbs": 0.0,
      }
    ]
  except Exception:
    return []
