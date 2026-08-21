# -*- coding: utf-8 -*-
"""
What we harvested, when, and which version of the source we got.

Without this a re-harvest is indistinguishable from a first harvest: every file
is downloaded, parsed and re-indexed whether or not anything changed. Indexing
is the expensive part by a wide margin — throughput falls from ~4,800 docs/s on
an empty index to ~65 at 7M — so re-indexing unchanged records is close to the
worst thing the harvester can spend its time on.

Two signals make that avoidable, and they work at different levels.

**Per file.** Every export carries `Last-Modified` and `ETag`:

    arg.bsg    Sat, 29 Mar 2025 15:14:56 GMT
    bhi.dtb_d  Sat, 29 Mar 2025 15:16:51 GMT
    frl.bev    Sat, 29 Mar 2025 15:10:12 GMT

A HEAD request costs nothing, so a file whose version we already hold can be
skipped outright — no download, no parse, no indexing.

**Per record.** Each row carries `SOURCE_LASTCHANGEDATE`, and those are spread
over years rather than clustered at the export date. In `arg.bsg`: 73% last
changed in 2016, 13.4% in 2022, 11.3% in 2023.

That second signal matters because of a trap in the first: all three files above
share one modification time, which is when Open Archieven *regenerated the
exports*, not when their contents changed. A regeneration therefore changes
every file's `Last-Modified` even where nothing inside moved. When that happens
the per-file check is useless and the per-record dates are what still separate
new work from old.
"""
import json
import os
import time
import urllib.request
from typing import Any, Dict, Optional, Tuple

MANIFEST_PATH = os.environ.get(
    "HARVEST_MANIFEST_PATH",
    os.path.join(os.environ.get("INGEST_LOG_DIR", "/logs"), "harvest_manifest.json"),
)


def load(path: Optional[str] = None) -> Dict[str, Any]:
    """Every file we have harvested, keyed `archive.kind`."""
    try:
        with open(path or MANIFEST_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(manifest: Dict[str, Any], path: Optional[str] = None) -> None:
    """Rewrites the manifest atomically, so a crash cannot truncate it."""
    target = path or MANIFEST_PATH
    try:
        os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
        temp = target + ".tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, sort_keys=True)
        os.replace(temp, target)
    except OSError:
        pass


def source_version(url: str, user_agent: str, timeout: int = 30) -> Dict[str, Any]:
    """
    The published version of one export, from a HEAD request.

    Returns empty on any failure. A version we cannot read must not be mistaken
    for a version that matches, or an unchanged-looking file would be skipped on
    the strength of a network error.
    """
    try:
        request = urllib.request.Request(
            url, headers={"User-Agent": user_agent}, method="HEAD"
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            headers = response.headers
            return {
                "etag": (headers.get("ETag") or "").strip('"'),
                "last_modified": headers.get("Last-Modified") or "",
                "bytes": int(headers.get("Content-Length") or 0),
            }
    except Exception:
        return {}


def is_unchanged(entry: Optional[Dict[str, Any]], version: Dict[str, Any]) -> bool:
    """
    True when the published file is the exact one we already ingested.

    Requires a *complete* previous pass. A file that was interrupted, or was
    ingested as a delta, has not necessarily got all of its records in the
    index, and skipping it would make that permanent.
    """
    if not entry or not version:
        return False
    if not entry.get("complete"):
        return False
    if not version.get("etag") or not version.get("last_modified"):
        return False
    return (
        entry.get("source_etag") == version["etag"]
        and entry.get("source_last_modified") == version["last_modified"]
    )


def delta_watermark(entry: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    The date beyond which records are new to us, or None if we cannot tell.

    Only a completed full pass establishes one. After a delta pass the watermark
    advances, but a file we have never fully ingested has no floor to compare
    against and must be taken whole.
    """
    if not entry or not entry.get("complete"):
        return None
    return entry.get("max_last_changed") or None


def record(
    manifest: Dict[str, Any],
    archive: str,
    kind: str,
    version: Dict[str, Any],
    rows: int,
    records: int,
    max_last_changed: str,
    mode: str = "full",
    complete: bool = True,
) -> Dict[str, Any]:
    """Notes one harvested file. `mode` is "full" or "delta"."""
    key = "%s.%s" % (archive, kind)
    previous = manifest.get(key) or {}

    # A delta pass only saw part of the file, so the watermark may only move
    # forward — never back to whatever this particular pass happened to see.
    watermark = max_last_changed or ""
    if mode == "delta":
        watermark = max(watermark, previous.get("max_last_changed") or "")

    manifest[key] = {
        "archive": archive,
        "kind": kind,
        "harvested_at": int(time.time()),
        "harvested_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": mode,
        "complete": complete,
        "source_etag": version.get("etag", ""),
        "source_last_modified": version.get("last_modified", ""),
        "source_bytes": version.get("bytes", 0),
        "rows": rows,
        "records": records,
        "max_last_changed": watermark,
        # Kept so a file harvested repeatedly still shows when it first landed.
        "first_harvested_at": previous.get("first_harvested_at") or int(time.time()),
    }
    return manifest[key]


def summary(manifest: Dict[str, Any]) -> Dict[str, Any]:
    """Per-archive rollup, for the dashboard."""
    archives: Dict[str, Dict[str, Any]] = {}
    for entry in manifest.values():
        if not isinstance(entry, dict):
            continue
        code = entry.get("archive")
        if not code:
            continue
        bucket = archives.setdefault(code, {
            "archive": code, "files": 0, "records": 0,
            "harvested_at": 0, "incomplete": 0,
        })
        bucket["files"] += 1
        bucket["records"] += entry.get("records") or 0
        bucket["harvested_at"] = max(bucket["harvested_at"], entry.get("harvested_at") or 0)
        if not entry.get("complete"):
            bucket["incomplete"] += 1
    return {"archives": sorted(archives.values(), key=lambda a: a["archive"]),
            "files": len(manifest)}
