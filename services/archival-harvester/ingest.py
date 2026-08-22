#!/usr/bin/env python3
"""
Ingests Open Archieven's published CSV exports into Meilisearch.

    python ingest.py ade                 # one archive, all record types
    python ingest.py frl gra             # several
    python ingest.py --list              # what is available, with sizes
    python ingest.py ade --limit 5000    # a slice, for measuring

Uses the sanctioned bulk exports rather than the search API. The API is throttled
to 4 requests/second per IP, so pulling ~51 million records through it would take
months and is exactly what that limit exists to prevent. The exports are published
for this purpose.

Two constraints shape the design:

  1. Each export is staged to local disk, then parsed from there. Streaming
     straight off the socket was the original design — the host had ~40 GB free
     for a ~40 GB corpus — but backpressure blocks inside the row loop, and an
     HTTPS connection held idle for minutes gets closed underneath us. The
     volume is now 200 GB and the largest export is under a gigabyte, so the
     constraint that justified the risk is gone. Staged files are deleted as
     soon as they are read.

  2. The source has 180 columns per record. Storing all of them would multiply
     the index for fields nobody searches. We keep what identifies and locates a
     record, plus every person's name, and link back to Open Archieven for the
     full detail — which the agent only needs for the handful of records it cites.
"""
import argparse
import csv
import gzip
import io
import json
import logging
import os
import re
import sys
import time
import urllib.request
from typing import Any, Dict, Iterator, List, Optional

import meilisearch

import manifest
import schema
from schema import transform, role_prefixes

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingest")

EXPORT_BASE = "https://oa-export.s3.nl-ams.scw.cloud/csv"
EXPORT_INDEX = "https://www.openarchieven.nl/exports/csv/"
USER_AGENT = os.environ.get(
    "OPENARCH_USER_AGENT", "LineageNexus/0.1 (+https://lineage.nexus)"
)

MEILI_HOST = os.environ.get("MEILI_HOST", "http://127.0.0.1:7700")
MEILI_MASTER_KEY = os.environ.get("MEILI_MASTER_KEY", "")
INDEX_NAME = os.environ.get("MEILI_INDEX", "records")

# Documents per submission.
#
# Raised from 10,000 after measuring what small batches cost. Meilisearch starts
# a batch the instant it is idle — measured gaps between consecutive batches are
# 0.00-0.03s — while one submission takes us ~0.3-0.5s round trip. We therefore
# *cannot* get a second task in before the scheduler grabs the first, so batch
# size is not something we can influence by queuing more tasks. The only lever
# is how much each task carries.
#
# The cost model, measured within a single file so difficulty is held constant
# (frl.not, alternating 6- and 19-task batches):
#
#     fixed     ~232 seconds per batch, whatever its size
#     marginal  ~0.55 ms per document
#
# At 10,000 per task a one-task batch spent ~232s of overhead on ~5s of work.
# Half the wall-clock time went to batches carrying a quarter of the documents.
BATCH_SIZE = int(os.environ.get("INGEST_BATCH_SIZE", "100000"))

# Hard ceiling on one submission's payload, which the document count alone does
# not bound. A document under the old flat schema was small; under the per-role
# schema it serialises to ~923 bytes, so 100,000 of them is an **88 MB POST**.
# One of those wedged the harvester for 40 minutes: 324 MB written, then the
# socket stopped draining with 4.2 MB stuck in its send buffer and six stalled
# relay connections behind it. The engine sat idle throughout, because the body
# never arrived.
#
# Size, not count, is what the transport cares about, and the count is a poor
# proxy for it whenever the schema changes.
MAX_BATCH_BYTES = int(os.environ.get("INGEST_MAX_BATCH_BYTES", str(32 * 1024 * 1024)))

# Backpressure. Submitting is ~10,000 records/second; indexing is far slower, so
# an unthrottled run does not "finish" — it just moves the whole corpus into
# Meilisearch's queue and leaves. That is what happened on the first frl+gra run:
# 1,289 tasks and 5.4 GB of pending payloads piled up, Meilisearch auto-grouped
# 266 of them into one 2.66M-document batch, and that batch then read 178 GB off
# the disk over 45 minutes without indexing a single document. Its working set no
# longer fit in RAM, so it thrashed the page cache instead of making progress.
#
# Waiting for the queue to drain bounds how much work the engine can group into a
# single batch, which is the thing that actually has to fit in memory. It costs
# nothing in total throughput: the engine was always the bottleneck, and a shallow
# queue just stops us from pretending otherwise.
# Cap on tasks in flight, which bounds how much the engine can group into one
# batch — the thing that has to fit in memory. Five 100,000-document tasks is at
# most ~500k documents per batch, against the 11.1M batch that thrashed a 6 GB
# box for nine hours, on a host that now has twice the RAM.
#
# Note this cap is also what creates the alternating batch sizes: while a batch
# of N processes, the harvester fills the remaining slots, and those become the
# next batch. Making each task larger is what stops that from mattering.
MAX_PENDING_TASKS = int(os.environ.get("INGEST_MAX_PENDING_TASKS", "5"))
QUEUE_POLL_SECONDS = 5

# A queue that has not moved for this long is stuck rather than busy. Not fatal on
# its own — a big merge is legitimately silent for minutes — but it is the point
# at which the run should say so rather than block for ever.
QUEUE_STALL_SECONDS = int(os.environ.get("INGEST_STALL_SECONDS", "900"))

# Row -> document now lives in schema.py, which also owns the role map, the
# phonetic keys and the derived birth years. Kept here: the two helpers the
# merge loop still needs.
_GUID_BRACES = re.compile(r"[{}]")


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def download_export(url: str, destination: str) -> int:
    """
    Fetches one export to local disk, returning its size in bytes.

    Downloading first, rather than parsing straight off the socket, exists
    because of a failure this cost us: backpressure blocks inside the row loop,
    and with the queue full that block lasts minutes. Holding an idle HTTPS
    connection to the export host that long gets it closed underneath us, and
    the next read dies with `[Errno 32] Broken pipe`. It killed `frl.not` after
    a 340s wait and `ade.bsg` after 270s — the two longest waits of the run.

    The original design streamed to avoid ever staging a file, because the host
    had ~40 GB free for a ~40 GB corpus. That volume is now 200 GB with 171 GB
    free and the largest single export is under a gigabyte, so the constraint
    that justified the risk is gone. The file is removed as soon as it is read.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    written = 0
    with urllib.request.urlopen(request, timeout=120) as response:
        with open(destination, "wb") as handle:
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                handle.write(chunk)
                written += len(chunk)
    return written


def rows_from_file(path: str, progress: Optional[Dict[str, Any]] = None) -> Iterator[Any]:
    """
    Yields the header, then each row, from a local gzipped pipe-delimited export.

    When `progress` is given it is updated in place with `bytes` and
    `total_bytes`, tracking position in the **compressed** file. Row counts
    cannot give a percentage — the total is unknown until the file has been
    read — but the file is staged to disk before parsing, so its size is known
    exactly and byte position is a real fraction of the work.

    This slightly overstates progress, because the reader buffers ahead of the
    row being yielded. On a file of any size that is a fraction of a percent.
    """
    total = os.path.getsize(path)
    if progress is not None:
        progress["total_bytes"] = total
        progress["bytes"] = 0

    raw = open(path, "rb")
    try:
        with gzip.GzipFile(fileobj=raw) as gz:
            text = io.TextIOWrapper(gz, encoding="utf-8", errors="replace", newline="")
            reader = csv.DictReader(text, delimiter="|", quoting=csv.QUOTE_NONE)
            yield reader.fieldnames or []
            for row in reader:
                if progress is not None:
                    progress["bytes"] = raw.tell()
                yield row
    finally:
        raw.close()


def stream_rows(url: str) -> Iterator[Dict[str, str]]:
    """
    Yields rows from a remote gzipped, pipe-delimited CSV without staging it.

    The response is decompressed as it arrives. A 400 MB export never exists as a
    file, and peak memory stays at one batch.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            text = io.TextIOWrapper(gz, encoding="utf-8", errors="replace", newline="")
            # Some rows carry unescaped quotes inside remarks; QUOTE_NONE keeps a
            # stray quote from swallowing the rest of the file.
            reader = csv.DictReader(text, delimiter="|", quoting=csv.QUOTE_NONE)
            # First item is the header, so the caller can work out which columns
            # name people before it starts transforming rows.
            yield reader.fieldnames or []
            for row in reader:
                yield row


def list_exports() -> List[str]:
    request = urllib.request.Request(EXPORT_INDEX, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        html = response.read().decode("utf-8", errors="replace")
    found = re.findall(r"([a-z0-9_]+\.[a-z0-9_]+)\.csv\.gz", html)
    return sorted(set(found))


def pending_tasks() -> Optional[int]:
    """
    How many tasks Meilisearch still has to work through.

    urllib rather than the client so this does not depend on which task helpers a
    given client release exposes. `limit=0` asks for the count without making the
    engine serialise a page of results.
    """
    url = f"{MEILI_HOST}/tasks?statuses=enqueued,processing&limit=0"
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {MEILI_MASTER_KEY}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8")).get("total")
    except Exception:
        # Never let a failed status check stop an ingest that is otherwise fine.
        return None


def _failed_task_count(since: Optional[str] = None) -> int:
    """
    How many indexing tasks the engine rejected, optionally only since a time.

    Scoped by default to this run: a count of every failure ever recorded stays
    non-zero for good once anything has failed, and a check that always fires is
    a check nobody reads.
    """
    url = f"{MEILI_HOST}/tasks?statuses=failed&limit=0"
    if since:
        url += f"&afterEnqueuedAt={since}"
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {MEILI_MASTER_KEY}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8")).get("total", 0)
    except Exception:
        return 0


def await_queue(threshold: int = MAX_PENDING_TASKS) -> None:
    """
    Blocks until the queue is shallow enough to accept more work.

    Returns immediately if the count cannot be read — a broken status endpoint
    should slow the ingest down, not halt it.
    """
    waited = 0.0
    last_count = None
    unchanged_for = 0.0

    while True:
        count = pending_tasks()
        if count is None or count <= threshold:
            if waited:
                logger.info("    queue drained to %s after %.0fs", count, waited)
            return

        if count == last_count:
            unchanged_for += QUEUE_POLL_SECONDS
            if unchanged_for >= QUEUE_STALL_SECONDS:
                logger.warning(
                    "    queue stuck at %d tasks for %.0fs — the engine is not "
                    "draining. Check the indexing panel on the admin dashboard; "
                    "continuing anyway.",
                    count, unchanged_for,
                )
                return
        else:
            unchanged_for = 0.0
            last_count = count

        if waited and waited % 60 < QUEUE_POLL_SECONDS:
            logger.info("    waiting for queue: %d tasks pending", count)

        time.sleep(QUEUE_POLL_SECONDS)
        waited += QUEUE_POLL_SECONDS


def configure_index(client) -> Any:
    """
    Applies index settings. Cheap while they are unchanged — expensive the day
    they are not.

    Meilisearch reindexes every document when `searchableAttributes`,
    `filterableAttributes` or `typoTolerance` actually change, because those
    decide what the inverted index contains. Calling this on every run is free
    today: all five settings tasks so far finished in between 5ms and 0.5s,
    because the values are identical and the engine no-ops.

    Change any of them, though, and this one line rebuilds the index over every
    record. At 11.8M documents and the ~1,200 docs/s this host sustains, that is
    hours of work triggered by an edit that looks like a config tweak. Make such
    a change deliberately, and expect the rebuild.
    """
    # The primary key must be stated, not inferred. Meilisearch refuses to guess
    # when more than one field ends in "id", and this schema has both `id` and
    # `guid` — so on a fresh index every document submission fails with
    # `index_primary_key_multiple_candidates_found`. The old index predated the
    # check and carried a primary key already, which is why it only appeared
    # after the index was rebuilt from empty.
    # create_index is asynchronous: calling it when the index exists enqueues a
    # task that then fails with "Index `records` already exists". Thirteen of
    # those had accumulated, each one polluting the failed-task count the
    # dashboard shows and the run's own success check reads. Ask first.
    try:
        client.get_index(INDEX_NAME)
    except Exception:
        try:
            client.create_index(INDEX_NAME, {"primaryKey": "id"})
        except Exception as exc:
            logger.warning("could not create index %s: %s", INDEX_NAME, exc)

    index = client.index(INDEX_NAME)
    # One definition, in schema.py. See the note there about why this used to
    # live in two files.
    index.update_settings(schema.index_settings())
    return index


# Guard against a pathological source record. The longest legitimate run seen is
# 165 rows (a single notarial deed naming 165 people); this only exists so one
# malformed GUID cannot accumulate an unbounded document.
MAX_PERSONS_PER_RECORD = 1000


def merged_documents(rows: Iterator[Dict[str, str]], archive: str, kind: str,
                     prefixes: List[str]) -> Iterator[Dict[str, Any]]:
    """
    One document per *source record*, not per CSV row.

    Some exports emit a row per person rather than a row per record: in
    `frl.not`, 40,000 rows carry only 17,930 distinct GUIDs, and a single
    notarial deed appears as three rows naming three different people. Keying on
    `{archive}_{guid}` and submitting each row separately meant Meilisearch
    treated them as repeated updates of one document, so only the last person
    survived — 1,555,164 rows of `frl.not` and 320,907 of `frl.bev` silently
    collapsed, and the people on the discarded rows became unfindable.

    Rows sharing a GUID are always contiguous (verified across 200,000 rows of
    `frl.not`: zero reappear after a gap), so they can be merged while streaming.
    A dictionary keyed by GUID would work too, but would have to hold the whole
    file — this holds one record at a time.
    """
    current: Optional[Dict[str, Any]] = None
    current_guid: Optional[str] = None
    seen: set = set()

    for row in rows:
        guid = _GUID_BRACES.sub("", _clean(row.get("SOURCE_RECORD_GUID")))

        if guid != current_guid:
            if current is not None:
                yield current
            current, current_guid, seen = None, guid, set()

        doc = transform(row, archive, kind, prefixes)
        if doc is None:
            continue

        if current is None:
            current = doc
            seen = {(p["n"], p["role"]) for p in doc["persons"]}
            continue

        # Same record, more people. Deduplicated on name-and-role, since one
        # person can legitimately appear twice in different roles.
        for person in doc["persons"]:
            key = (person["n"], person["role"])
            if key in seen or len(current["persons"]) >= MAX_PERSONS_PER_RECORD:
                continue
            seen.add(key)
            current["persons"].append(person)

        for field in ("event_type", "event_date", "event_place", "institution",
                      "last_changed"):
            if not current.get(field) and doc.get(field):
                current[field] = doc[field]
        if not current.get("event_year") and doc.get("event_year"):
            current["event_year"] = doc["event_year"]

        # Every phonetic key, role field and derived birth year is a function of
        # `persons`, so rebuild them once the merge is done rather than patching
        # incrementally — that is exactly how the old `names` blob drifted out of
        # step with the persons it was meant to summarise.
        schema.rebuild_search_fields(current)

    if current is not None:
        yield current


def ingest_file(index, archive: str, kind: str, limit: Optional[int] = None,
                since: Optional[str] = None, manifest_data: Optional[Dict[str, Any]] = None,
                force: bool = False, dry_run: bool = False) -> int:
    url = f"{EXPORT_BASE}/{archive}.{kind}.csv.gz"

    # Ask what version is published before spending anything on it. A HEAD is
    # free; a download, parse and re-index of an unchanged file is not.
    version = manifest.source_version(url, USER_AGENT)
    entry = (manifest_data or {}).get("%s.%s" % (archive, kind))
    if not force and manifest.is_unchanged(entry, version):
        logger.info("  %s.%s: unchanged since %s - skipped",
                    archive, kind, entry.get("harvested_iso"))
        return 0

    logger.info("streaming %s.%s%s", archive, kind,
                " (backfill: reconstructing the manifest, nothing is sent "
                "to the search engine)" if dry_run else "")
    if since:
        logger.info("  %s.%s: delta mode, only records changed after %s",
                    archive, kind, since)

    batch: List[Dict[str, Any]] = []
    started = time.time()

    staged = os.path.join(
        os.environ.get("INGEST_TMP_DIR", "/tmp"), f"{archive}.{kind}.csv.gz"
    )
    size = download_export(url, staged)
    logger.info("  %s.%s: fetched %.0f MB in %.0fs",
                archive, kind, size / (1 << 20), time.time() - started)

    try:
        return _ingest_staged(index, staged, archive, kind, limit, started, batch,
                          since, manifest_data, version, dry_run)
    finally:
        # The staged copy exists only for the duration of one file.
        try:
            os.unlink(staged)
        except OSError:
            pass


def _record_task_archive(task_res: Any, archive_code: str):
    if not task_res:
        return
    task_uid = getattr(task_res, "task_uid", None) or getattr(task_res, "uid", None)
    if isinstance(task_res, dict):
        task_uid = task_res.get("taskUid") or task_res.get("uid")
    if not task_uid:
        return
    try:
        log_dir = os.environ.get("INGEST_LOG_DIR", "/logs")
        os.makedirs(log_dir, exist_ok=True)
        mapping_path = os.path.join(log_dir, "task_archives.json")
        data = {}
        if os.path.exists(mapping_path):
            try:
                with open(mapping_path, "r", encoding="utf-8") as f:
                    data = json.load(f) or {}
            except Exception:
                data = {}
        data[str(task_uid)] = archive_code
        with open(mapping_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as exc:
        logger.warning("could not record task archive mapping: %s", exc)


def _ingest_staged(index, staged: str, archive: str, kind: str,
                   limit: Optional[int], started: float,
                   batch: List[Dict[str, Any]],
                   since: Optional[str] = None,
                   manifest_data: Optional[Dict[str, Any]] = None,
                   version: Optional[Dict[str, Any]] = None,
                   dry_run: bool = False) -> int:
    count = 0
    batch_bytes = 0
    file_progress: Dict[str, Any] = {}
    rows = rows_from_file(staged, file_progress)
    prefixes = role_prefixes(next(rows))
    logger.info("  %s.%s: %d person roles in this schema", archive, kind, len(prefixes))

    row_count = 0
    last_log_t = time.time()

    def counted(source):
        nonlocal row_count, last_log_t
        for item in source:
            row_count += 1
            now = time.time()
            if row_count % 5000 == 0 or (now - last_log_t) >= 0.5:
                rate = row_count / max(1e-6, now - started)
                done = file_progress.get("bytes") or 0
                size = file_progress.get("total_bytes") or 0
                pct = (100.0 * done / size) if size else 0.0
                logger.info(
                    "  %s.%s: %d rows parsed, %d records generated (%.0f rows/s, %.1f%%)",
                    archive, kind, row_count, count, rate, pct)
                last_log_t = now
            yield item

    max_changed = ""
    skipped_unchanged = 0

    for doc in merged_documents(counted(rows), archive, kind, prefixes):
        changed = doc.get("last_changed") or ""
        if changed > max_changed:
            max_changed = changed

        # Delta mode. The file still has to be downloaded and parsed — there is
        # no way to seek into a gzip stream by date — but parsing is seconds and
        # indexing is the part that takes hours, so filtering here skips almost
        # all of the cost.
        #
        # A record with no date is always taken: treating "unknown" as "old"
        # would drop it permanently.
        if since and changed and changed <= since:
            skipped_unchanged += 1
            continue

        count += 1

        # A backfill run exists to learn what is already true of the index, not
        # to change it — every one of these records was indexed by a run before
        # provenance tracking existed. Skip the submission, keep the counting.
        if not dry_run:
            batch.append(doc)
            batch_bytes += len(json.dumps(doc, ensure_ascii=False))

            if len(batch) >= BATCH_SIZE or batch_bytes >= MAX_BATCH_BYTES:
                task_res = index.add_documents(batch)
                _record_task_archive(task_res, archive)
                logger.info("  %s.%s: %d submitted, %d docs / %.0f MB this batch (%.0f rec/s)",
                            archive, kind, count, len(batch), batch_bytes / (1 << 20),
                            count / max(1e-6, time.time() - started))
                batch = []
                batch_bytes = 0
                await_queue()
        if limit and count >= limit:
            break

    if batch:
        task_res = index.add_documents(batch)
        _record_task_archive(task_res, archive)
        logger.info("  %s.%s: final batch, %d docs / %.0f MB",
                    archive, kind, len(batch), batch_bytes / (1 << 20))
        batch = []
        batch_bytes = 0
        await_queue()

    if since:
        logger.info("  %s.%s: %d records changed since %s, %d unchanged and skipped",
                    archive, kind, count, since, skipped_unchanged)
    logger.info("  %s.%s: %d records from %d rows (%d merged or dropped), %.1fs",
                archive, kind, count, row_count, row_count - count,
                time.time() - started)

    # Note what we took and which version of the source it came from, so a later
    # run can tell whether there is anything new to do.
    if manifest_data is not None:
        manifest.record(manifest_data, archive, kind, version or {},
                        rows=row_count, records=count,
                        max_last_changed=max_changed,
                        mode="delta" if since else "full",
                        complete=not limit)
        manifest.save(manifest_data)
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", nargs="*", help="archive codes, e.g. ade frl gra")
    parser.add_argument("--list", action="store_true", help="list available exports")
    parser.add_argument("--limit", type=int, help="stop after N records per file")
    parser.add_argument("--kinds", help="comma-separated record types (default: all)")
    parser.add_argument(
        "--files",
        help="specific exports by label, e.g. bhi.dtb_d or bhi.dtb_d,bhi.bsg. "
             "Takes precedence over positional archives and --kinds.",
    )
    parser.add_argument(
        "--delta", action="store_true",
        help="only ingest records changed since the last full harvest of each "
             "file. Requires a completed previous pass; falls back to a full "
             "pass for any file without one.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="ingest even when the published file is byte-identical to the one "
             "already harvested.",
    )
    parser.add_argument(
        "--backfill", action="store_true",
        help="reconstruct manifest entries for files that were indexed before "
             "provenance tracking existed, or for which it was lost. Downloads "
             "and parses each file exactly as a normal run would, to learn its "
             "published version and its newest record date, but submits "
             "nothing to the search engine. A file the manifest already has a "
             "complete entry for is left alone, same as any other unchanged "
             "file, so this is safe to run repeatedly or across the whole "
             "catalog.",
    )
    args = parser.parse_args()

    available = list_exports()

    if args.list:
        by_archive: Dict[str, List[str]] = {}
        for name in available:
            code, kind = name.split(".", 1)
            by_archive.setdefault(code, []).append(kind)
        for code in sorted(by_archive):
            print(f"  {code:6} {','.join(sorted(by_archive[code]))}")
        print(f"\n{len(by_archive)} archives, {len(available)} files")
        return 0

    if not args.archives:
        parser.error("give at least one archive code, or --list")

    # A backfill run writes nothing to the search engine, so it has no need of
    # it — skip the connection and the settings poke entirely rather than
    # reaching for a client this run will never call.
    if args.backfill:
        index = None
    else:
        # Without a timeout the client waits indefinitely. The 40-minute hang
        # above produced no error, no log line and no failed task — it simply
        # stopped, and the dashboard went on reporting "Working".
        client = meilisearch.Client(MEILI_HOST, MEILI_MASTER_KEY,
                                    timeout=int(os.environ.get("MEILI_TIMEOUT", "600")))
        index = configure_index(client)

    wanted = set(args.kinds.split(",")) if args.kinds else None

    # Publish the plan before doing any work, so the dashboard can say "file 8
    # of 15" rather than only naming the file in progress. Written where the log
    # goes, which the gateway already mounts.
    plan = [
        f"{archive}.{kind}"
        for archive in args.archives
        for kind in sorted(n.split(".", 1)[1] for n in available if n.startswith(f"{archive}."))
        if not wanted or kind in wanted
    ]
    try:
        plan_dir = os.environ.get("INGEST_LOG_DIR", "/logs")
        os.makedirs(plan_dir, exist_ok=True)
        with open(os.path.join(plan_dir, "plan.json"), "w", encoding="utf-8") as handle:
            json.dump({"started": time.time(), "files": plan}, handle)
        logger.info("plan: %d files — %s", len(plan), ", ".join(plan))
    except OSError as exc:
        logger.warning("could not write run plan: %s", exc)

    run_started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    total = 0
    failures: List[str] = []
    manifest_data = manifest.load()

    # One flat list of (archive, kind), however it was asked for. `--files`
    # names exports directly, which is what you want when re-running a single
    # one rather than a whole archive.
    targets: List[tuple] = []
    if args.files:
        for label in args.files.split(","):
            label = label.strip()
            if not label:
                continue
            if label.endswith(".csv.gz"):
                label = label[: -len(".csv.gz")]
            if "." not in label:
                logger.error("  %r is not an export label; expected archive.kind", label)
                failures.append(label)
                continue
            if label not in available:
                logger.error("  %r is not a published export", label)
                failures.append(label)
                continue
            targets.append(tuple(label.split(".", 1)))
    else:
        for archive in args.archives:
            kinds = [n.split(".", 1)[1] for n in available if n.startswith(f"{archive}.")]
            if not kinds:
                logger.warning("no exports found for archive %r", archive)
                continue
            for kind in sorted(kinds):
                if not wanted or kind in wanted:
                    targets.append((archive, kind))

    if not targets:
        logger.error("nothing to harvest")
        return 1

    logger.info("harvesting %d file(s): %s", len(targets),
                ", ".join("%s.%s" % t for t in targets))

    for archive, kind in targets:
        if True:
            for attempt in (1, 2):
                try:
                    since = None
                    if args.delta:
                        since = manifest.delta_watermark(
                            manifest_data.get("%s.%s" % (archive, kind)))
                        if since is None:
                            logger.info("  %s.%s: no completed full harvest to "
                                        "compare against - taking the whole file",
                                        archive, kind)
                    total += ingest_file(index, archive, kind, args.limit,
                                         since=since, manifest_data=manifest_data,
                                         force=args.force, dry_run=args.backfill)
                    break
                except Exception as exc:
                    # One bad file should not abandon the rest of the run, but it
                    # must not vanish either: the first run exited 0 having
                    # silently skipped frl.not and ade.bsg, and the dashboard had
                    # no way to know.
                    if attempt == 1:
                        logger.warning("  %s.%s failed (%s) — retrying once",
                                       archive, kind, exc)
                        time.sleep(10)
                        continue
                    logger.error("  %s.%s FAILED after retry: %s", archive, kind, exc)
                    failures.append(f"{archive}.{kind}")

    if failures:
        logger.error("done with FAILURES: %d file(s) did not complete: %s",
                     len(failures), ", ".join(failures))

    if args.backfill:
        logger.info("backfill done: %d record(s) accounted for across %d file(s)",
                    total, len(targets) - len(failures))
        return 1 if failures else 0

    logger.info("done: %d documents submitted", total)

    # Submitting is not indexing. Every task of the first arg run failed on a
    # primary-key error while the run still logged "110971 documents submitted"
    # and exited 0 — the same shape of silent success as the skipped files.
    await_queue(threshold=0)
    rejected = _failed_task_count(since=run_started)
    if rejected:
        logger.error("%d indexing task(s) FAILED - see /tasks?statuses=failed", rejected)
        return 1
    logger.info("Meilisearch indexes asynchronously; check the admin dashboard for progress.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
