# -*- coding: utf-8 -*-
"""
Guards the three storage tiers and the resolution the API serves.

The all-time tier only records days on which the corpus moved, so the two
properties worth pinning are that a quiet stretch costs nothing and that a
rebuild's drop to zero is still recorded — it is real history, not a glitch.
"""
import importlib.util, json, os, sys, tempfile, types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.modules.setdefault("psutil", types.ModuleType("psutil"))
sys.modules["psutil"].disk_io_counters = lambda: None

tmp = tempfile.mkdtemp()
os.environ["METRICS_STATE_PATH"] = os.path.join(tmp, "m.jsonl")
os.environ["METRICS_30D_STATE_PATH"] = os.path.join(tmp, "m30.jsonl")
os.environ["METRICS_DAILY_STATE_PATH"] = os.path.join(tmp, "md.jsonl")
spec = importlib.util.spec_from_file_location("metrics", os.path.join(HERE, "metrics.py"))
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)

fails = []
def check(label, got, want):
    if got != want: fails.append("%s: got %r want %r" % (label, got, want))
    else: print("  OK   %s" % label)

DAY, base = 86400, 1787000000
rec = metrics._record_daily_if_changed

check("first sample recorded", rec({"t": base, "docs": 1_000_000}), True)
check("same day, unchanged, skipped", rec({"t": base + 3600, "docs": 1_000_000}), False)
check("new day, unchanged, skipped", rec({"t": base + DAY, "docs": 1_000_000}), False)
check("a quiet week, still skipped", rec({"t": base + 7 * DAY, "docs": 1_000_000}), False)
check("growth recorded", rec({"t": base + 8 * DAY, "docs": 2_500_000}), True)
check("a rebuild's drop recorded", rec({"t": base + 9 * DAY, "docs": 0}), True)
check("no document count, skipped", rec({"t": base + 10 * DAY}), False)
check("eleven days cost three rows",
      sum(1 for _ in open(os.environ["METRICS_DAILY_STATE_PATH"])), 3)
check("survives a restart",
      [r["docs"] for r in metrics.load_metrics_daily_history()], [1_000_000, 2_500_000, 0])

# --- what the API serves ---------------------------------------------------
src = open(os.path.join(HERE, "routes", "indexing.py"), encoding="utf-8").read()
ns = {}
exec(compile(src[src.index("_RATE_FIELDS = ("):src.index('@router.get("/api/v1/admin/history"')],
             "block", "exec"), ns)
down = ns["_downsample_points"]

pts = [{"t": i, "cpu": float(i % 10), "docs": i * 100} for i in range(1440)]
out = down(pts, 360)
check("6h of 15s samples becomes 360 points (60s)", len(out), 360)
check("docs keeps the last value in a bucket", out[0]["docs"], pts[3]["docs"])
check("so growth stays monotonic", all(a["docs"] <= b["docs"] for a, b in zip(out, out[1:])), True)
check("rates are averaged", out[0]["cpu"], round(sum(p["cpu"] for p in pts[:4]) / 4, 2))
check("a short series is left alone", len(down(pts[:100], 360)), 100)

# Tier selection thresholds, as documented on the endpoint.
for secs, want in ((3600, "15s"), (86400, "15s"), (86401, "15m"),
                   (30 * 86400, "15m"), (30 * 86400 + 1, "1d")):
    tier = "15s" if secs <= 86400 else ("15m" if secs <= 30 * 86400 else "1d")
    check("%8ds selects the %s tier" % (secs, want), tier, want)

if fails:
    print("\nFAILURES:")
    for f in fails: print("  -", f)
    raise SystemExit(1)
print("\nALL METRICS TIER TESTS PASSED")
