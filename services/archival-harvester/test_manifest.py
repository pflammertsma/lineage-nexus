# -*- coding: utf-8 -*-
"""
Guards the rules that decide whether a file is re-harvested.

Getting these wrong is expensive in one direction and silently wrong in the
other: skip a file that did change and records go missing for good; re-harvest
one that did not and the run costs hours it need not.
"""
import os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import manifest

fails = []
def check(label, got, want):
    if got != want: fails.append("%s: got %r want %r" % (label, got, want))
    else: print("  OK   %s" % label)

V = {"etag": "abc123", "last_modified": "Sat, 29 Mar 2025 15:14:56 GMT", "bytes": 2400000}

# --- skip decisions --------------------------------------------------------
done = {"complete": True, "source_etag": "abc123",
        "source_last_modified": "Sat, 29 Mar 2025 15:14:56 GMT"}
check("identical version is skipped", manifest.is_unchanged(done, V), True)
check("a new etag is re-harvested",
      manifest.is_unchanged(dict(done, source_etag="zzz"), V), False)
check("a new modification time is re-harvested",
      manifest.is_unchanged(dict(done, source_last_modified="Mon, 01 Jan 2026 00:00:00 GMT"), V), False)
check("never harvested is not skipped", manifest.is_unchanged(None, V), False)

# An interrupted pass has no guarantee its records are all in the index.
check("an incomplete pass is never skipped",
      manifest.is_unchanged(dict(done, complete=False), V), False)

# A failed HEAD must not read as "unchanged", or a network blip skips real work.
check("an unreadable version is not skipped", manifest.is_unchanged(done, {}), False)
check("a version with no etag is not skipped",
      manifest.is_unchanged(done, {"last_modified": V["last_modified"]}), False)

# --- delta watermark -------------------------------------------------------
check("watermark from a completed pass",
      manifest.delta_watermark({"complete": True, "max_last_changed": "2023-11-14"}), "2023-11-14")
check("no watermark without a completed pass",
      manifest.delta_watermark({"complete": False, "max_last_changed": "2023-11-14"}), None)
check("no watermark when never harvested", manifest.delta_watermark(None), None)

# --- recording -------------------------------------------------------------
m = {}
manifest.record(m, "bhi", "dtb_d", V, rows=6883742, records=6468742,
                max_last_changed="2023-11-14")
e = m["bhi.dtb_d"]
check("keyed archive.kind", sorted(m), ["bhi.dtb_d"])
check("records the source version", e["source_etag"], "abc123")
check("records what was taken", (e["rows"], e["records"]), (6883742, 6468742))
check("full pass marked complete", (e["mode"], e["complete"]), ("full", True))

# A delta pass saw only part of the file, so the watermark may only advance.
first_seen = e["first_harvested_at"]
manifest.record(m, "bhi", "dtb_d", V, rows=12, records=12,
                max_last_changed="2020-01-01", mode="delta")
check("a delta pass cannot move the watermark backwards",
      m["bhi.dtb_d"]["max_last_changed"], "2023-11-14")
check("first harvest time is preserved",
      m["bhi.dtb_d"]["first_harvested_at"], first_seen)

# A --limit run only saw part of the file and must not be treated as complete.
manifest.record(m, "arg", "bsg", V, rows=100, records=100,
                max_last_changed="2023-01-01", complete=False)
check("a partial pass is not skippable later",
      manifest.is_unchanged(m["arg.bsg"], V), False)

# --- persistence -----------------------------------------------------------
path = os.path.join(tempfile.mkdtemp(), "harvest_manifest.json")
manifest.save(m, path)
check("survives a restart", sorted(manifest.load(path)), ["arg.bsg", "bhi.dtb_d"])
check("a missing manifest reads as empty", manifest.load(path + ".nope"), {})

s = manifest.summary(m)
check("summary counts files", s["files"], 2)
check("summary rolls up by archive", [a["archive"] for a in s["archives"]], ["arg", "bhi"])
check("and flags incomplete files",
      [a["incomplete"] for a in s["archives"] if a["archive"] == "arg"], [1])

if fails:
    print("\nFAILURES:")
    for f in fails: print("  -", f)
    raise SystemExit(1)
print("\nALL MANIFEST TESTS PASSED")
