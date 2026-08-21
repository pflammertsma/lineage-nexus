"""
Ring-buffer metrics collection and disk IO rate sampling.
Supports 24h high-res (15s) and 30d low-res (15m) storage tiers.
"""

import os
import time
import json
import psutil
from collections import deque
from typing import Any, Deque, Dict, Optional

METRICS_INTERVAL_SECONDS = 15
METRICS_WINDOW_SECONDS = 24 * 60 * 60
METRICS_CAPACITY = METRICS_WINDOW_SECONDS // METRICS_INTERVAL_SECONDS
METRICS_STATE_PATH = os.environ.get("METRICS_STATE_PATH", "/state/metrics.jsonl")

METRICS_30D_INTERVAL_SECONDS = 900  # 15 minutes
METRICS_30D_CAPACITY = (30 * 24 * 60 * 60) // METRICS_30D_INTERVAL_SECONDS  # 2,880 samples
METRICS_30D_STATE_PATH = os.environ.get("METRICS_30D_STATE_PATH", "/state/metrics_30d.jsonl")

_metrics: Deque[Dict[str, Any]] = deque(maxlen=METRICS_CAPACITY)
_metrics_30d: Deque[Dict[str, Any]] = deque(maxlen=METRICS_30D_CAPACITY)

_prev_disk_io = None
_prev_disk_io_t = None


def _get_disk_io_rates() -> Dict[str, Any]:
  global _prev_disk_io, _prev_disk_io_t
  read_mbs = 0.0
  write_mbs = 0.0
  iops = 0
  try:
    counters = psutil.disk_io_counters()
    now = time.time()
    if counters and _prev_disk_io and _prev_disk_io_t and (now > _prev_disk_io_t):
      dt = now - _prev_disk_io_t
      if dt > 0:
        read_mbs = max(0.0, round((counters.read_bytes - _prev_disk_io.read_bytes) / (dt * 1024 * 1024), 2))
        write_mbs = max(0.0, round((counters.write_bytes - _prev_disk_io.write_bytes) / (dt * 1024 * 1024), 2))
        iops = max(0, int(((counters.read_count - _prev_disk_io.read_count) + (counters.write_count - _prev_disk_io.write_count)) / dt))
    _prev_disk_io = counters
    _prev_disk_io_t = now
  except Exception:
    pass
  return {"read_mbs": read_mbs, "write_mbs": write_mbs, "iops": iops}


METRICS_COMPACT_EVERY = 240


def compact_metrics_file():
  try:
    os.makedirs(os.path.dirname(METRICS_STATE_PATH), exist_ok=True)
    with open(METRICS_STATE_PATH, "w", encoding="utf-8") as f:
      for pt in _metrics:
        f.write(json.dumps(pt) + "\n")
  except OSError:
    pass


def compact_30d_metrics_file():
  try:
    os.makedirs(os.path.dirname(METRICS_30D_STATE_PATH), exist_ok=True)
    with open(METRICS_30D_STATE_PATH, "w", encoding="utf-8") as f:
      for pt in _metrics_30d:
        f.write(json.dumps(pt) + "\n")
  except OSError:
    pass


def load_metrics_history() -> Deque[Dict[str, Any]]:
  buf: Deque[Dict[str, Any]] = deque(maxlen=METRICS_CAPACITY)
  if not os.path.exists(METRICS_STATE_PATH):
    return buf
  try:
    with open(METRICS_STATE_PATH, "r", encoding="utf-8") as f:
      for line in f:
        line = line.strip()
        if not line:
          continue
        try:
          obj = json.loads(line)
          if isinstance(obj, dict) and "t" in obj:
            buf.append(obj)
        except ValueError:
          continue
  except OSError:
    pass
  return buf


def load_metrics_30d_history() -> Deque[Dict[str, Any]]:
  buf: Deque[Dict[str, Any]] = deque(maxlen=METRICS_30D_CAPACITY)
  if not os.path.exists(METRICS_30D_STATE_PATH):
    return buf
  try:
    with open(METRICS_30D_STATE_PATH, "r", encoding="utf-8") as f:
      for line in f:
        line = line.strip()
        if not line:
          continue
        try:
          obj = json.loads(line)
          if isinstance(obj, dict) and "t" in obj:
            buf.append(obj)
        except ValueError:
          continue
  except OSError:
    pass
  return buf


_metrics = load_metrics_history()
_metrics_30d = load_metrics_30d_history()

# Seed 30-day buffer from 24-hour high-res metrics if 30-day buffer is currently empty
if not _metrics_30d and _metrics:
  last_ts = 0
  for pt in _metrics:
    t = pt.get("t", 0)
    if t - last_ts >= METRICS_30D_INTERVAL_SECONDS:
      _metrics_30d.append(pt)
      last_ts = t
  compact_30d_metrics_file()


async def start_metrics_sampler():
  """Background task running every 15s to record system and indexing metrics to disk."""
  import asyncio
  import urllib.request
  from config import meili_client, INDEX_NAME, MEILI_HOST, MEILI_MASTER_KEY

  def count_tasks(statuses: str) -> int:
    try:
      req = urllib.request.Request(
        f"{MEILI_HOST}/tasks?statuses={statuses}&limit=0",
        headers={"Authorization": f"Bearer {MEILI_MASTER_KEY}"},
      )
      with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8")).get("total", 0)
    except Exception:
      return 0

  samples_count = 0
  last_30d_sample_t = _metrics_30d[-1]["t"] if _metrics_30d else 0

  while True:
    try:
      now = time.time()
      docs_cnt = None
      is_idx = False
      try:
        stats = meili_client.index(INDEX_NAME).get_stats()
        docs_cnt = getattr(stats, "number_of_documents", 0) if not isinstance(stats, dict) else stats.get("numberOfDocuments", 0)
        is_idx = getattr(stats, "is_indexing", False) if not isinstance(stats, dict) else stats.get("isIndexing", False)
      except Exception:
        pass

      enqueued = count_tasks("enqueued")
      processing = count_tasks("processing")

      mem = psutil.virtual_memory()
      disk = psutil.disk_usage("/")
      iowait_pct = 0.0
      try:
        iowait_pct = round(psutil.cpu_times_percent(interval=None).iowait, 1)
      except (AttributeError, ValueError):
        iowait_pct = 0.0

      archive_dist = {}
      kind_dist = {}
      try:
        facets = meili_client.index(INDEX_NAME).search("", {"limit": 0, "facets": ["archive", "kind"]})
        facet_dist = facets.get("facetDistribution", {}) or {}
        archive_dist = facet_dist.get("archive", {}) or {}
        kind_dist = facet_dist.get("kind", {}) or {}
      except Exception:
        pass

      point = {
        "t": int(now),
        "cpu": psutil.cpu_percent(interval=None),
        "iowait": iowait_pct,
        "mem": round(mem.percent, 1),
        "disk": round(disk.percent, 1),
        "docs": docs_cnt,
        "archives": archive_dist,
        "kinds": kind_dist,
        "indexing": is_idx,
        "is_indexing": is_idx,
        "enqueued": enqueued,
        "processing": processing,
        "io": _get_disk_io_rates(),
      }
      _metrics.append(point)

      try:
        os.makedirs(os.path.dirname(METRICS_STATE_PATH), exist_ok=True)
        with open(METRICS_STATE_PATH, "a", encoding="utf-8") as f:
          f.write(json.dumps(point) + "\n")
      except OSError:
        pass

      # Record 30-day low-resolution sample every 15 minutes (900 seconds)
      if int(now) - last_30d_sample_t >= METRICS_30D_INTERVAL_SECONDS:
        _metrics_30d.append(point)
        last_30d_sample_t = int(now)
        try:
          os.makedirs(os.path.dirname(METRICS_30D_STATE_PATH), exist_ok=True)
          with open(METRICS_30D_STATE_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(point) + "\n")
        except OSError:
          pass

      samples_count += 1
      if samples_count % METRICS_COMPACT_EVERY == 0:
        compact_metrics_file()
        compact_30d_metrics_file()
    except Exception:
      pass

    await asyncio.sleep(METRICS_INTERVAL_SECONDS)
