# -*- coding: utf-8 -*-
"""
Guards `_search_with_variants`: the exact/phonetic merge that backs
`/api/v1/admin/query`.

Two properties matter here. First, whether a hit is tagged "exact" or
"phonetic" must reflect its own spelling, not which of the two searches
happened to surface it — a common surname can have far more exact hits than
either pass returns, so a genuinely exact spelling can rank outside the
exact pass's own result window while still landing inside the phonetic
pass's. Second, the two searches are independent HTTP calls and must run
concurrently rather than adding their latencies together.
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "routes"))
import search as search_module

fails = []
def check(label, got, want):
    if got != want: fails.append("%s: got %r want %r" % (label, got, want))
    else: print("  OK   %s" % label)


class StubIndex:
    """
    Simulates the exact scenario reported: querying "lammertsma" where the
    exact-text pass's own top-N (out of 1000+ real hits) does not include a
    record that is nonetheless spelled exactly "Lammertsma", while the
    phonetic pass (over the folded key "lamertsma") does surface it.
    """
    def __init__(self, delay=0.0):
        self.delay = delay
        self.calls = []

    def search(self, query, params):
        self.calls.append((query, dict(params)))
        if self.delay:
            time.sleep(self.delay)
        if params.get("attributesToSearchOn") == ["names_p"]:
            # Phonetic pass: both an exact-spelled record the exact pass
            # missed, and a genuinely different-spelled variant.
            return {
                "hits": [
                    {"id": "fri_1", "names": "Tjaltje Lammertsma"},
                    {"id": "arg_9", "names": "Doutje Lamerdsma"},
                ],
                "estimatedTotalHits": 2,
                "processingTimeMs": 3,
            }
        # Exact pass: its own top-N, none of which is fri_1.
        return {
            "hits": [{"id": "arg_%d" % i, "names": "Someone Lammertsma"} for i in range(3)],
            "estimatedTotalHits": 1000,
            "processingTimeMs": 4,
        }


index = StubIndex()
result = search_module._search_with_variants(index, "lammertsma", {"limit": 50}, fuzzy=True)
by_id = {h["id"]: h for h in result["hits"]}

check("exact pass hits stay exact", by_id["arg_0"]["_match"], "exact")
check("a real exact spelling found only by the phonetic pass is reclassified",
      by_id["fri_1"]["_match"], "exact")
check("a genuine spelling variant stays phonetic",
      by_id["arg_9"]["_match"], "phonetic")
check("both searches ran", len(index.calls), 2)
check("exact pass searched the raw query", index.calls[0][0], "lammertsma")
check("phonetic pass searched the folded key", index.calls[1][0], "lamertsma")

# --- the two searches run concurrently, not one after the other -----------
slow_index = StubIndex(delay=0.2)
started = time.time()
search_module._search_with_variants(slow_index, "lammertsma", {"limit": 50}, fuzzy=True)
elapsed = time.time() - started
check("two 0.2s searches overlap rather than add up", elapsed < 0.35, True)

# --- fuzzy=False skips the phonetic pass entirely --------------------------
off_index = StubIndex()
search_module._search_with_variants(off_index, "lammertsma", {"limit": 50}, fuzzy=False)
check("fuzzy=False makes exactly one call", len(off_index.calls), 1)

if fails:
    print("\nFAILURES:")
    for f in fails:
        print("  " + f)
    sys.exit(1)
print("\nALL SEARCH VARIANT TESTS PASSED")
