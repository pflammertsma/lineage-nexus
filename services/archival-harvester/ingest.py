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

  1. The whole corpus is ~8.3 GB compressed and ~40 GB uncompressed, on a host
     with ~40 GB free. So nothing is ever written to disk: each file is streamed,
     decompressed in flight, transformed, batched to Meilisearch, and discarded.

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

BATCH_SIZE = int(os.environ.get("INGEST_BATCH_SIZE", "10000"))

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
MAX_PENDING_TASKS = int(os.environ.get("INGEST_MAX_PENDING_TASKS", "8"))
QUEUE_POLL_SECONDS = 5

# A queue that has not moved for this long is stuck rather than busy. Not fatal on
# its own — a big merge is legitimately silent for minutes — but it is the point
# at which the run should say so rather than block for ever.
QUEUE_STALL_SECONDS = int(os.environ.get("INGEST_STALL_SECONDS", "900"))

# Role prefixes are derived from each file's own header rather than hardcoded.
#
# The export is not one schema: birth records carry PR_/PR_FTHR_/PR_MTHR_ with
# 180 columns, while marriage records use GROOM_/BRIDE_ (plus their parents) with
# 231. A fixed list silently dropped every marriage record — 111,302 of them in a
# single archive — because none of the expected prefixes matched. Reading the
# header adapts to variants nobody has looked at yet.
_NAME_SUFFIXES = ("_NAME_GN", "_NAME_SURN", "_NAME_PATR", "_NAME_SPRE", "_NAME")

# Only used when a row has no explicit *_RELATIONTYPE.
_ROLE_FALLBACK = {
    "PR": "Hoofdpersoon",
    "PR_FTHR": "Vader",
    "PR_MTHR": "Moeder",
    "GROOM": "Bruidegom",
    "BRIDE": "Bruid",
    "OTHER": "Overig",
}


def role_prefixes(fieldnames: List[str]) -> List[str]:
    """Every prefix in this file that names a person, longest first."""
    prefixes = set()
    for column in fieldnames or []:
        for suffix in _NAME_SUFFIXES:
            if column.endswith(suffix):
                prefix = column[: -len(suffix)]
                if prefix:
                    prefixes.add(prefix)
                break
    # Longest first so PR_FTHR is matched before PR would swallow it.
    return sorted(prefixes, key=lambda p: (-len(p), p))


def _default_role(prefix: str) -> str:
    if prefix in _ROLE_FALLBACK:
        return _ROLE_FALLBACK[prefix]
    if prefix.startswith("WITNESS"):
        return "Getuige"
    if prefix.endswith("_FTHR"):
        return "Vader"
    if prefix.endswith("_MTHR"):
        return "Moeder"
    return prefix.replace("_", " ").title()


_GUID_BRACES = re.compile(r"[{}]")
_TAGS = re.compile(r"<[^>]+>")


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def _person_name(row: Dict[str, str], prefix: str) -> str:
    """Assembles a display name in Dutch order: given, patronym, prefix, surname."""
    parts = [
        _clean(row.get(f"{prefix}_NAME_GN")),
        _clean(row.get(f"{prefix}_NAME_PATR")),
        _clean(row.get(f"{prefix}_NAME_SPRE")),
        _clean(row.get(f"{prefix}_NAME_SURN")),
    ]
    name = " ".join(p for p in parts if p)
    # Some archives fill only the combined field.
    return name or _clean(row.get(f"{prefix}_NAME"))


def transform(row: Dict[str, str], archive: str, kind: str,
              prefixes: List[str]) -> Optional[Dict[str, Any]]:
    """
    One CSV row becomes one search document, or None if it carries no name.

    A record with no person in it cannot be found by name and is only weight in
    the index, so it is dropped rather than stored.
    """
    guid = _GUID_BRACES.sub("", _clean(row.get("SOURCE_RECORD_GUID")))
    if not guid:
        return None

    persons: List[Dict[str, str]] = []
    names: List[str] = []
    for prefix in prefixes:
        name = _person_name(row, prefix)
        if not name:
            continue
        role = _clean(row.get(f"{prefix}_RELATIONTYPE")) or _default_role(prefix)
        # Short keys: this repeats tens of millions of times, and the long form
        # would cost more than the values themselves.
        persons.append({"n": name, "r": role})
        names.append(name)

    if not names:
        return None

    year_raw = _clean(row.get("EVENT_YEAR")) or _clean(row.get("SOURCE_DATE_YEAR"))
    try:
        year = int(year_raw) if year_raw.isdigit() else 0
    except ValueError:
        year = 0

    day = _clean(row.get("EVENT_DAY"))
    month = _clean(row.get("EVENT_MONTH"))

    return {
        # Meilisearch primary keys allow only [A-Za-z0-9_-].
        "id": f"{archive}_{guid}".replace("-", "_"),
        "archive": archive,
        "kind": kind,
        "event_type": _clean(row.get("EVENT_TYPE")) or _clean(row.get("SOURCE_TYPE")),
        "event_year": year,
        "event_date": "-".join(p for p in (year_raw, month, day) if p),
        "event_place": _clean(row.get("EVENT_PLACE")) or _clean(row.get("SOURCE_PLACE")),
        # One blob of every name in the record: the field people actually search,
        # and cheaper for Meilisearch than searching an array of objects.
        "names": " ".join(names),
        "persons": persons,
        "institution": _clean(row.get("SOURCEREFERENCE_INSTITUTIONNAME")),
        # When Open Archieven last changed this record. Our index is a snapshot of
        # an export, so this is what tells you whether a local hit might be stale
        # relative to their live data.
        "last_changed": _clean(row.get("SOURCE_LASTCHANGEDATE")),
        # Enough to reconstruct the permalink and fetch full detail on demand.
        "guid": guid,
        "url": f"https://www.openarchieven.nl/{archive}:{guid}",
    }


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
    index = client.index(INDEX_NAME)
    index.update_settings({
        "searchableAttributes": ["names", "event_place", "event_type", "institution"],
        "filterableAttributes": ["archive", "kind", "event_type", "event_year", "event_place"],
        "sortableAttributes": ["event_year"],
        "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
        # Dutch patronymics and archaic spellings vary a lot, so typo tolerance
        # earns its keep here, but not on short strings where it adds noise.
        "typoTolerance": {
            "enabled": True,
            "minWordSizeForTypos": {"oneTypo": 5, "twoTypos": 9},
        },
        "pagination": {"maxTotalHits": 1000},
    })
    return index


def ingest_file(index, archive: str, kind: str, limit: Optional[int] = None) -> int:
    url = f"{EXPORT_BASE}/{archive}.{kind}.csv.gz"
    logger.info("streaming %s.%s", archive, kind)

    batch: List[Dict[str, Any]] = []
    count = 0
    skipped = 0
    started = time.time()

    rows = stream_rows(url)
    prefixes = role_prefixes(next(rows))
    logger.info("  %s.%s: %d person roles in this schema", archive, kind, len(prefixes))

    for row in rows:
        doc = transform(row, archive, kind, prefixes)
        if doc is None:
            skipped += 1
            continue
        batch.append(doc)
        count += 1

        if len(batch) >= BATCH_SIZE:
            index.add_documents(batch)
            batch = []
            logger.info("  %s.%s: %d submitted (%.0f rec/s)",
                        archive, kind, count, count / max(1e-6, time.time() - started))
            # Backpressure: keep the queue shallow so the engine never groups
            # more into one batch than it can hold in memory.
            await_queue()
        if limit and count >= limit:
            break

    if batch:
        index.add_documents(batch)
        await_queue()

    logger.info("  %s.%s: %d submitted, %d skipped (no name or guid), %.1fs",
                archive, kind, count, skipped, time.time() - started)
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", nargs="*", help="archive codes, e.g. ade frl gra")
    parser.add_argument("--list", action="store_true", help="list available exports")
    parser.add_argument("--limit", type=int, help="stop after N records per file")
    parser.add_argument("--kinds", help="comma-separated record types (default: all)")
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

    client = meilisearch.Client(MEILI_HOST, MEILI_MASTER_KEY)
    index = configure_index(client)

    wanted = set(args.kinds.split(",")) if args.kinds else None
    total = 0
    for archive in args.archives:
        kinds = [n.split(".", 1)[1] for n in available if n.startswith(f"{archive}.")]
        if not kinds:
            logger.warning("no exports found for archive %r", archive)
            continue
        for kind in sorted(kinds):
            if wanted and kind not in wanted:
                continue
            try:
                total += ingest_file(index, archive, kind, args.limit)
            except Exception as exc:
                # One bad file should not abandon the rest of the run.
                logger.error("  %s.%s failed: %s", archive, kind, exc)

    logger.info("done: %d documents submitted", total)
    logger.info("Meilisearch indexes asynchronously; check the admin dashboard for progress.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
