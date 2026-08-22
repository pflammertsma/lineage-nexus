# -*- coding: utf-8 -*-
"""
Guards `--backfill`: reconstructing manifest entries for files that were
indexed before provenance tracking existed, without touching the search
engine.

This ran against a real export once, by hand, to prove the shape of the
thing: a dry-run pass records source_etag, source_last_modified and a real
max_last_changed by actually downloading and parsing the file, a second
dry-run pass is skipped as unchanged, and a genuine `--delta` pass against
the backfilled watermark submits nothing. That network-touching proof does
not belong in the regular suite; this guards the same logic with a stub.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ingest

fails = []
def check(label, got, want):
    if got != want: fails.append("%s: got %r want %r" % (label, got, want))
    else: print("  OK   %s" % label)


class ExplodingIndex:
    """Any write here means a dry run was not actually dry."""
    def add_documents(self, *a, **k):
        raise AssertionError("dry_run submitted documents to the search engine")


ROWS = [
    ["SOURCE_RECORD_GUID", "PR_NAME_GN", "PR_NAME_SURN", "EVENT_YEAR", "SOURCE_LASTCHANGEDATE"],
    {"SOURCE_RECORD_GUID": "1", "PR_NAME_GN": "Jan", "PR_NAME_SURN": "de Vries",
     "EVENT_YEAR": "1850", "SOURCE_LASTCHANGEDATE": "2016-01-01"},
    {"SOURCE_RECORD_GUID": "2", "PR_NAME_GN": "Klaas", "PR_NAME_SURN": "Bakker",
     "EVENT_YEAR": "1851", "SOURCE_LASTCHANGEDATE": "2022-06-15"},
    {"SOURCE_RECORD_GUID": "3", "PR_NAME_GN": "Antje", "PR_NAME_SURN": "Visser",
     "EVENT_YEAR": "1852", "SOURCE_LASTCHANGEDATE": "2023-03-09"},
]


def _stage(monkeypatch_rows):
    import manifest as manifest_module
    orig_rows_from_file = ingest.rows_from_file
    orig_download = ingest.download_export
    orig_version = manifest_module.source_version

    def fake_rows_from_file(path, progress=None):
        if progress is not None:
            progress["bytes"] = progress["total_bytes"] = 1
        for r in monkeypatch_rows:
            yield r

    def fake_download(url, destination):
        with open(destination, "wb") as f:
            f.write(b"stub")
        return 4

    def fake_version(url, user_agent, timeout=30):
        return {"etag": "stub-etag", "last_modified": "Sat, 29 Mar 2025 00:00:00 GMT", "bytes": 4}

    ingest.rows_from_file = fake_rows_from_file
    ingest.download_export = fake_download
    manifest_module.source_version = fake_version
    return orig_rows_from_file, orig_download, orig_version


def _restore(originals):
    import manifest as manifest_module
    ingest.rows_from_file, ingest.download_export, manifest_module.source_version = originals


import manifest

originals = _stage(ROWS)
try:
    manifest_data = {}

    # --- pass 1: backfill, index=None, must not need one --------------------
    n = ingest.ingest_file(None, "tst", "bsg", manifest_data=manifest_data, dry_run=True)
    check("backfill accounts for every record", n, 3)

    entry = manifest_data.get("tst.bsg")
    check("entry exists", entry is not None, True)
    check("marked complete", entry.get("complete"), True)
    check("mode is full", entry.get("mode"), "full")
    check("real max_last_changed captured", entry.get("max_last_changed"), "2023-03-09")
    check("real version captured", entry.get("source_etag"), "stub-etag")

    # --- pass 2: backfilling again is a no-op ------------------------------
    n2 = ingest.ingest_file(None, "tst", "bsg", manifest_data=manifest_data, dry_run=True)
    check("second backfill is skipped as unchanged", n2, 0)

    # --- pass 3: a real delta pass against the backfilled watermark --------
    since = manifest.delta_watermark(manifest_data.get("tst.bsg"))
    check("delta_watermark reads the backfilled value", since, "2023-03-09")
    n3 = ingest.ingest_file(ExplodingIndex(), "tst", "bsg", since=since,
                            manifest_data=manifest_data, force=True)
    check("nothing new to submit against the backfilled watermark", n3, 0)
finally:
    _restore(originals)

if fails:
    print("\nFAILURES:")
    for f in fails:
        print("  " + f)
    sys.exit(1)
print("\nALL BACKFILL TESTS PASSED")
