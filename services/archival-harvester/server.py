import asyncio
import json
import logging
import os
import re
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
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gateway")

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
# 24h at 15s is 5,760 samples, a few hundred kB. Mirrored to disk (see
# METRICS_STATE_PATH below) so a deploy does not blank the chart.
METRICS_INTERVAL_SECONDS = 15
METRICS_WINDOW_SECONDS = 24 * 60 * 60
METRICS_CAPACITY = METRICS_WINDOW_SECONDS // METRICS_INTERVAL_SECONDS

_metrics: Deque[Dict[str, Any]] = deque(maxlen=METRICS_CAPACITY)

# Where the history is kept between restarts.
#
# The buffer used to be memory-only, so every deploy blanked the 24-hour chart
# and reset the stall clock on the indexing panel — precisely when someone is
# most likely to be watching. A bind mount on the host survives the container
# being rebuilt, which is what a deploy actually does.
#
# JSON Lines rather than a single document: appending one line per sample costs
# nothing, and a truncated final line from an unlucky restart loses one sample
# instead of the whole file.
METRICS_STATE_PATH = os.environ.get("METRICS_STATE_PATH", "/state/metrics.jsonl")

# Rewrite the file this often to drop samples that have aged out. At 15s a day
# of history is ~5,760 lines, so this keeps it around half a megabyte.
METRICS_COMPACT_EVERY = 240

_metrics_writable = True
_samples_since_compact = 0


def _load_metrics() -> None:
  """Restores the ring buffer from disk, keeping only what is still in window."""
  global _metrics_writable
  cutoff = time.time() - METRICS_WINDOW_SECONDS
  try:
    with open(METRICS_STATE_PATH, "r", encoding="utf-8") as handle:
      restored = 0
      for line in handle:
        line = line.strip()
        if not line:
          continue
        try:
          sample = json.loads(line)
        except ValueError:
          # A partial last line from an interrupted write. Skip it.
          continue
        if isinstance(sample, dict) and sample.get("t", 0) >= cutoff:
          _metrics.append(sample)
          restored += 1
    logger.info("restored %d metric samples from %s", restored, METRICS_STATE_PATH)
  except FileNotFoundError:
    pass
  except OSError as exc:
    logger.warning("could not read metric history: %s", exc)


def _persist_metric(sample: Dict[str, Any]) -> None:
  """
  Appends one sample, compacting periodically.

  Never raises: history is a convenience, and losing it must not take the
  metrics loop — or the service — down with it.
  """
  global _metrics_writable, _samples_since_compact
  if not _metrics_writable:
    return
  try:
    os.makedirs(os.path.dirname(METRICS_STATE_PATH) or ".", exist_ok=True)
    with open(METRICS_STATE_PATH, "a", encoding="utf-8") as handle:
      handle.write(json.dumps(sample) + "\n")

    _samples_since_compact += 1
    if _samples_since_compact >= METRICS_COMPACT_EVERY:
      _samples_since_compact = 0
      cutoff = time.time() - METRICS_WINDOW_SECONDS
      temp = f"{METRICS_STATE_PATH}.tmp"
      with open(temp, "w", encoding="utf-8") as handle:
        for kept in _metrics:
          if kept.get("t", 0) >= cutoff:
            handle.write(json.dumps(kept) + "\n")
      # Atomic: a crash mid-compaction leaves the old file intact.
      os.replace(temp, METRICS_STATE_PATH)
  except OSError as exc:
    # No mount, or read-only. Say so once and carry on in memory.
    logger.warning("metric history disabled (%s); history will not survive a restart", exc)
    _metrics_writable = False


async def _sample_metrics() -> None:
  """Records one sample per interval for the lifetime of the process."""
  while True:
    try:
      mem = psutil.virtual_memory()
      disk = psutil.disk_usage("/")
      docs = None
      indexing = None
      archives = {}
      try:
        idx = meili_client.index(INDEX_NAME)
        stats = idx.get_stats()
        docs = stats.number_of_documents
        indexing = stats.is_indexing
        facets = idx.search("", {"limit": 0, "facets": ["archive"]})
        archives = facets.get("facetDistribution", {}).get("archive", {}) or {}
      except Exception:
        # Meilisearch being unreachable should not stop CPU/memory history.
        pass

      # I/O wait, tracked separately because `cpu_percent` does not include it.
      # A box pinned at 98 MB/s of page-fault reads reported 4.9% CPU and 20%
      # memory here — idle-looking on every metric we had, while vmstat showed
      # 0% idle and 94% iowait. Without this the dashboard cannot distinguish a
      # machine doing nothing from one saturated on disk, which is exactly the
      # state a stalled harvest puts it in.
      try:
        iowait = round(psutil.cpu_times_percent(interval=None).iowait, 1)
      except (AttributeError, ValueError):
        # Not available on every platform; absent is better than wrong.
        iowait = None

      # Completed tasks, not just documents. A re-ingest updates existing
      # records in place, so the document count is flat for hours while real
      # work happens — judging progress on documents alone reports that as a
      # stall. Task completions move either way.
      done = None
      try:
        done = _count_tasks("succeeded")
      except Exception:
        pass

      # Progress of the batch in flight. Within one long batch no task completes
      # and no document lands, yet the engine reports itself advancing through
      # named steps. Without this a healthy 20-minute merge is indistinguishable
      # from a wedged one, and the panel cries stall over honest work.
      pct = None
      try:
        batches = _meili_get("/batches?limit=1").get("results") or []
        if batches and batches[0].get("finishedAt") is None:
          pct = ((batches[0].get("progress") or {}).get("percentage"))
      except Exception:
        pass

      _metrics.append({
        "t": int(time.time()),
        # interval=None so the first call does not block for a second.
        "cpu": psutil.cpu_percent(interval=None),
        "iowait": iowait,
        "mem": round(mem.percent, 1),
        "disk": round(disk.percent, 1),
        "docs": docs,
        "archives": archives,
        "done": done,
        "pct": pct,
        "indexing": indexing,
      })
      _persist_metric(_metrics[-1])
    except Exception:
      pass
    await asyncio.sleep(METRICS_INTERVAL_SECONDS)


@app.on_event("startup")
async def _start_metrics() -> None:
  psutil.cpu_percent(interval=None)  # prime the counter; the first read is always 0
  _load_metrics()
  asyncio.create_task(_sample_metrics())


@app.get("/api/v1/admin/history", dependencies=[Depends(require_admin)])
def admin_history(minutes: int = Query(360, ge=5, le=1440)):
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
      # The whole stored document, for inspecting a record without leaving the
      # dashboard. This endpoint exists to answer "did that export ingest
      # correctly", and the transformed fields above are exactly what a bad
      # transform would hide.
      "raw": hit,
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
    # No retrieval-path breakdown: every hit here comes from our own index. When
    # the Open Archieven fallback lands, that distinction becomes real and worth
    # reporting again — until then it only implies a choice that is not happening.
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

  # The human name for each archive code comes from the records themselves
  # rather than a table maintained here. `ade` is Archief Delft, which is not
  # what the abbreviation suggests, and a hardcoded list would be wrong the first
  # time an archive is harvested that nobody thought to add. One cheap
  # single-hit query per archive; there are only ever a few dozen.
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
      # A missing label is cosmetic; the count still stands.
      continue

  return {
    "status": "success",
    "total_records": stats.number_of_documents,
    "is_indexing": stats.is_indexing,
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


# --- Indexing progress ----------------------------------------------------
# Meilisearch accepts documents far faster than it indexes them, so "submitted"
# and "searchable" are different numbers and the gap can be hours wide. Nothing
# in /status or /coverage shows that gap: both report the index as it is now, and
# a harvest that has stalled looks identical to one that has finished.
#
# The engine does expose the detail, on /tasks and /batches. This surfaces it,
# plus two things it cannot know on its own: how fast documents are actually
# landing, and how long the count has been standing still.

def _meili_get(path: str) -> Any:
  """
  Reads a Meilisearch endpoint the Python client does not wrap.

  urllib rather than the client because /batches arrived in 1.12 and the client
  version pinned here predates it — going direct avoids tying this to whichever
  helpers a given client release happens to expose.
  """
  import json
  import urllib.request

  request = urllib.request.Request(
    f"{MEILI_HOST}{path}",
    headers={"Authorization": f"Bearer {MEILI_MASTER_KEY}"},
  )
  with urllib.request.urlopen(request, timeout=10) as response:
    return json.loads(response.read().decode("utf-8"))


def _elapsed_since(timestamp: Optional[str]) -> Optional[int]:
  """
  Seconds since an RFC 3339 timestamp, computed here rather than in the browser.

  Meilisearch reports nanosecond precision, which `fromisoformat` rejects, so the
  fraction is truncated to microseconds. Doing this server-side keeps a skewed
  client clock from turning a two-minute batch into a two-hour one on screen.
  """
  if not timestamp:
    return None
  import re
  from datetime import datetime, timezone

  cleaned = re.sub(r"(\.\d{6})\d+", r"\1", timestamp.replace("Z", "+00:00"))
  try:
    started = datetime.fromisoformat(cleaned)
  except ValueError:
    return None
  return max(0, int((datetime.now(timezone.utc) - started).total_seconds()))


def _count_tasks(statuses: str) -> int:
  """Total matching tasks. limit=0 so Meilisearch counts without serialising."""
  try:
    return _meili_get(f"/tasks?statuses={statuses}&limit=0").get("total", 0)
  except Exception:
    return 0


def _document_rate(window_seconds: int = 600) -> Optional[float]:
  """
  Documents per second over the recent metrics samples.

  Measured from the ring buffer rather than by polling twice: a rate needs two
  readings separated in time, and asking the caller to wait for the second one
  would make the dashboard hang.
  """
  cutoff = time.time() - window_seconds
  samples = [p for p in _metrics if p["t"] >= cutoff and p.get("docs") is not None]
  if len(samples) < 2:
    return None
  span = samples[-1]["t"] - samples[0]["t"]
  if span <= 0:
    return None
  return max(0.0, (samples[-1]["docs"] - samples[0]["docs"]) / span)


def _seconds_since_progress() -> Optional[int]:
  """
  How long nothing has moved, across every signal we have.

  Three are needed, because each is blind on its own:

    documents  a re-ingest updates records in place, so the count sits still
               for hours while the engine works perfectly normally
    tasks      no task completes until its whole batch commits
    batch %    the engine's own progress through the batch in flight

  Only when all three are frozen is there something worth reporting. A value
  here is still not proof of a fault — but a figure well past how long the
  surrounding batches took is the symptom worth looking at.
  """
  def signal(sample: Dict[str, Any]):
    return (sample.get("docs"), sample.get("done"), sample.get("pct"))

  samples = [p for p in _metrics if any(v is not None for v in signal(p))]
  if len(samples) < 2:
    return None
  latest = signal(samples[-1])
  for sample in reversed(samples):
    if signal(sample) != latest:
      return int(time.time() - sample["t"])
  # Unchanged across the whole buffer: report its span rather than claim zero.
  return int(time.time() - samples[0]["t"])


# Where the harvester writes its log. Mounted read-only into this container, so
# the dashboard can say *what* is being ingested — something Meilisearch cannot
# know. It only ever sees documents, not which export they came from.
INGEST_LOG_DIR = os.environ.get("INGEST_LOG_DIR", "/ingest-logs")

_INGEST_STREAMING = re.compile(r"streaming ([a-z0-9_]+)\.([a-z0-9_]+)")
_INGEST_SUBMITTED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) submitted \(([\d.]+) rec/s\)"
)
_INGEST_FINISHED = re.compile(
  r"([a-z0-9_]+)\.([a-z0-9_]+): ([\d,]+) records from ([\d,]+) rows"
)


def _current_ingest() -> Optional[Dict[str, Any]]:
  """
  What the harvester is working on, read from the tail of its log.

  Parsing a log is not elegant, but the alternative — having the ingest publish
  status through the API — would mean a run already in flight could not be seen
  at all. This works for jobs started before the feature existed, which is
  exactly when someone wants to know what is happening.

  Returns None when no log exists or nothing has been written recently enough to
  trust; a stale line is worse than no line.
  """
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
    # Nothing written for five minutes means the run is over or wedged. Either
    # way, reporting its last line as "current" would be a lie.
    if age > 300:
      return None

    # Completed files are counted over the whole log, not the tail. Counting
    # them in a 16 kB window undercounted badly — 7 finished files read as 3,
    # because the earlier completion lines had scrolled out of it. The log is
    # tens of kilobytes, so reading all of it costs nothing.
    with open(newest, "r", encoding="utf-8", errors="replace") as handle:
      lines = handle.read().splitlines()
    # The tail is still what decides *current* state: the last file mentioned,
    # not every file the run has ever touched.
    tail = lines[-200:]
  except OSError:
    return None

  archive = kind = None
  submitted = None
  rate = None
  waiting = False
  completed = 0

  for line in lines:
    if _INGEST_FINISHED.search(line):
      completed += 1

  for line in tail:
    match = _INGEST_STREAMING.search(line)
    if match:
      archive, kind = match.group(1), match.group(2)
      submitted, rate = None, None
    match = _INGEST_SUBMITTED.search(line)
    if match:
      archive, kind = match.group(1), match.group(2)
      submitted = int(match.group(3).replace(",", ""))
      rate = float(match.group(4))
    waiting = "waiting for queue" in line

  if not archive:
    return None

  # Total file count comes from a plan the harvester writes when it starts.
  # Without it the panel can say which file is in progress but not how much of
  # the run is left, which is the question people actually have.
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
    # True when the harvester is throttling itself because the queue is full —
    # the normal state under backpressure, and not a problem.
    "waiting_for_queue": waiting,
    "files_completed": completed,
    "log_age_seconds": int(age),
  }


@app.get("/api/v1/admin/indexing", dependencies=[Depends(require_admin)])
def admin_indexing():
  """Queue depth, the batch in flight, and whether it is actually moving."""
  try:
    stats = meili_client.index(INDEX_NAME).get_stats()
    documents = stats.number_of_documents
    is_indexing = stats.is_indexing
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
              "finished": s.get("finished"),
              "total": s.get("total"),
            }
            for s in (progress.get("steps") or [])
          ],
        }
      elif finished is not None and len(recent) < 5:
        # Durations of completed batches are the only honest yardstick for
        # whether the one in flight is taking abnormally long.
        details = batch.get("details") or {}
        recent.append({
          "uid": batch.get("uid"),
          "tasks": batch_stats.get("totalNbTasks"),
          "duration": batch.get("duration"),
          "started_at": batch.get("startedAt"),
          "finished_at": finished,
          # The real document count, so throughput is measured rather than
          # inferred. Deriving it as tasks x batch size silently hardcodes our
          # ingest's INGEST_BATCH_SIZE, and would misreport every batch the
          # moment that changed or another writer submitted differently sized
          # payloads. `indexedDocuments` is what actually landed; fall back to
          # what was received when the engine does not report it.
          "documents": details.get("indexedDocuments") or details.get("receivedDocuments"),
        })
  except Exception:
    # The batches endpoint is informational; losing it should not take the
    # queue counts down with it.
    pass

  rate = _document_rate()
  pending_documents = None
  eta_seconds = None
  if current and current.get("documents"):
    # Only the batch in flight declares a document count. Queued tasks do not,
    # so this is a floor on what is left, not the total.
    pending_documents = current["documents"]
    if rate and rate > 0:
      eta_seconds = int(pending_documents / rate)

  return {
    "status": "success",
    "documents": documents,
    "is_indexing": is_indexing,
    "archive_names": ARCHIVE_NAMES,
    "queue": {
      "enqueued": enqueued,
      "processing": processing,
      "failed": failed,
      "total_pending": enqueued + processing,
    },
    "current_batch": current,
    "current_ingest": _current_ingest(),
    "recent_batches": recent,
    "documents_per_second": round(rate, 1) if rate is not None else None,
    "stalled_seconds": _seconds_since_progress(),
    "pending_documents": pending_documents,
    "eta_seconds": eta_seconds,
  }


# --- Archival Catalog & Ingest Queue Management ----------------------------

import pydantic
import subprocess

ARCHIVE_NAMES = {
  "ade": "Archief Delft",
  "frl": "Tresoar Fryslân",
  "gra": "Groninger Archieven",
  "dha": "Haags Gemeentearchief",
  "hga": "Het Utrechts Archief",
  "utr": "Het Utrechts Archief",
  "zld": "Zeeuws Archief",
  "vkk": "West-Fries Archief",
  "brb": "Brabants Historisch Informatie Centrum",
  "gel": "Gelders Archief",
  "ovr": "Historisch Centrum Overijssel",
  "lim": "Regionaal Historisch Centrum Limburg",
  "dnt": "Drents Archief",
  "nha": "Noord-Hollands Archief",
  "mhi": "Museum & Archief Hoorn",
  "sal": "Stadsarchief Amsterdam",
}

_active_ingest_process = None

@app.get("/api/v1/admin/harvest/exports", dependencies=[Depends(require_admin)])
def admin_harvest_exports():
  """
  Catalog of all ~375 Open Archieven CSV exports across ~83 Dutch regional archives.
  Enriched with searchable document counts, status, and record types.
  """
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
    plan_file = os.path.join(os.environ.get("INGEST_LOG_DIR", "/logs"), "plan.json")
    if os.path.exists(plan_file):
      with open(plan_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        active_plan_files = set(data.get("files", []))
  except Exception:
    pass

  archives_dict = {}
  for file_name in available_files:
    if "." not in file_name:
      continue
    code, kind = file_name.split(".", 1)
    if code not in archives_dict:
      archives_dict[code] = {
        "code": code,
        "name": ARCHIVE_NAMES.get(code, f"Archive {code.upper()}"),
        "kinds": [],
        "files": [],
        "indexed_records": indexed_by_archive.get(code, 0),
        "status": "available"
      }
    archives_dict[code]["kinds"].append(kind)
    archives_dict[code]["files"].append(file_name)

    if indexed_by_archive.get(code, 0) > 0:
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

@app.post("/api/v1/admin/harvest/queue", dependencies=[Depends(require_admin)])
def admin_queue_harvest(req: HarvestQueueRequest):
  """
  Queues selected archive codes for background ingestion using ingest.py.
  """
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

