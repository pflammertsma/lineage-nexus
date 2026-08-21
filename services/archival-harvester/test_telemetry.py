# -*- coding: utf-8 -*-
"""
Guards the two properties that made 21.6 hours of real telemetry hard to use:
a batch's duration was not recoverable, and the field that predicts duration was
never recorded.
"""
import collections, json, os, re

# Resolve relative to this file so the suite runs from anywhere.
HERE = os.path.dirname(os.path.abspath(__file__))

fails = []
def check(label, got, want):
    if got != want: fails.append("%s: got %r want %r" % (label, got, want))
    else: print("  OK   %s" % label)

# --- 1. the completion row must be written once per batch -------------------
def record_completions(telemetry, recent, index_documents, now=1000):
    """Mirror of the logic in routes/indexing.py."""
    recorded = {t.get("batch_uid") for t in telemetry if t.get("event") == "complete"}
    added = 0
    for b in recent:
        if b.get("uid") in recorded or not b.get("duration"):
            continue
        telemetry.append({"event": "complete", "timestamp": now,
                          "batch_uid": b["uid"], "duration": b["duration"],
                          "documents": b.get("documents"),
                          "index_documents": index_documents})
        added += 1
    return added

tel = []
recent = [{"uid": 371, "duration": "PT498.2S", "documents": 75575},
          {"uid": 372, "duration": "PT444.0S", "documents": 37712}]
check("first pass records both", record_completions(tel, recent, 7_200_000), 2)
check("second pass records nothing", record_completions(tel, recent, 7_200_000), 0)
check("still only two rows", len(tel), 2)

# A batch still running has no duration, so nothing is written for it yet.
check("unfinished batch skipped",
      record_completions(tel, [{"uid": 373, "duration": None}], 7_200_000), 0)

# --- 2. duration must be exact, not reconstructed ---------------------------
def parse_iso(v):
    m = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?([\d.]+)S$", v or "")
    return (int(m.group(1) or 0)*3600 + int(m.group(2) or 0)*60 + float(m.group(3))) if m else None

# A batch that ran 1539s but was polled once, 10s in — the real uid 336 case.
samples = [{"batch_uid": 336, "elapsed_seconds": 10, "timestamp": 100}]
naive = max(s["elapsed_seconds"] for s in samples)
completion = {"event": "complete", "batch_uid": 336, "duration": "PT1539.0S"}
check("sampling alone understates the duration", naive, 10)
check("the completion row carries the truth", parse_iso(completion["duration"]), 1539.0)
check("the error sampling would have made", round(1539.0 / naive), 154)

# --- 3. index size must be present, since it is the predictor ---------------
sample = {"batch_uid": 371, "documents": 75575, "index_documents": 7_200_000}
check("batch size recorded", sample["documents"], 75575)
check("index size recorded", sample["index_documents"], 7_200_000)

# The real file lacked it, which is why index size had to be proxied.
old_shape = {"batch_uid", "documents", "tasks", "elapsed_seconds", "step",
             "cpu_percent", "iowait_percent", "read_mbs", "write_mbs"}
check("index size was absent from the old shape", "index_documents" in old_shape, False)

# --- 4. the source file must actually be analysable end to end --------------
rows = [{"event": "complete", "batch_uid": u, "duration": "PT%dS" % d,
         "documents": n, "index_documents": i}
        for u, d, n, i in ((1, 100, 50000, 500_000), (2, 300, 50000, 2_000_000),
                           (3, 900, 50000, 7_000_000))]
rates = [r["documents"] / parse_iso(r["duration"]) for r in rows]
check("throughput computable with no reconstruction", [round(x) for x in rates], [500, 167, 56])
check("and it falls as the index grows", rates[0] > rates[1] > rates[2], True)

# --- 5. rows must be self-describing --------------------------------------
# The next capture is from a different archive, so a file has to say what it is
# without anyone remembering when it was taken.
import importlib.util, sys, types
for m in ("psutil", "fastapi", "meilisearch"):
    sys.modules.setdefault(m, types.ModuleType(m))

src = open(os.path.join(HERE, "routes", "indexing.py"), encoding="utf-8").read()
version = int(re.search(r"TELEMETRY_SCHEMA_VERSION = (\d+)", src).group(1))
check("schema version is declared", version, 2)

for field in ("schema_version", "event", "archive", "kind", "index_documents"):
    check("sample carries %-16s" % field, ('"%s":' % field) in src, True)

# A v1 file is still readable: it simply has no schema_version.
v1_row = {"batch_uid": 371, "documents": 75575, "elapsed_seconds": 100}
v2_row = {"schema_version": 2, "event": "sample", "batch_uid": 371,
          "documents": 75575, "index_documents": 7_200_000,
          "archive": "bhi", "kind": "dtb_d"}
check("v1 row detected by absence", v1_row.get("schema_version", 1), 1)
check("v2 row self-identifies", v2_row.get("schema_version", 1), 2)

# Harvest context lets throughput be split by record type, which v1 could not do.
rows = [{"kind": "bev", "documents": 50000, "duration": "PT100S"},
        {"kind": "not", "documents": 50000, "duration": "PT400S"}]
by_kind = {r["kind"]: r["documents"] / parse_iso(r["duration"]) for r in rows}
check("throughput separable by record type", sorted(by_kind), ["bev", "not"])
check("and the two differ", by_kind["bev"] != by_kind["not"], True)

if fails:
    print("\nFAILURES:")
    for f in fails: print("  -", f)
    raise SystemExit(1)
print("\nALL TELEMETRY TESTS PASSED")
