# Indexing telemetry: what we record, and what we have learned from it

The gateway samples the in-flight Meilisearch batch every 15 seconds into
`/opt/ingest-logs/batch_telemetry.json` (mounted from `/state`). This document
records **which version of that data exists**, what each version can and cannot
answer, and the findings so far.

Read this before analysing a capture. The v1 files in particular cannot be taken
at face value.

---

## Schema versions

Rows carry `schema_version`. **A row without one is v1.**

### v1 — up to 2026-08-21

Samples only. One row per poll of a batch that was in flight.

```
batch_uid, step, steps, documents, tasks, elapsed_seconds,
raw_progress_pct, virtual_progress_pct, eta_seconds, naive_eta_seconds,
cpu_percent, iowait_percent, read_mbs, write_mbs, timestamp, iso_time
```

Two defects make it hard to use:

**A batch's duration is not recorded.** `elapsed_seconds` is whatever the last
poll happened to see. A batch that finishes between polls is recorded as far
shorter than it ran — **median 1.2x understated, worst case 702x**. One batch
logged 10 seconds for a run of about 26 minutes.

Recovering the truth required inferring the end from the *next* batch's start,
which only holds while batches run back-to-back. Where the harvester was idle —
throttled by backpressure, or between files — the gap is idle time, not
duration. That left **48 of 71 batches** with a determinable end.

**The strongest predictor is missing.** `documents` is the *batch* size. Nothing
records how large the index already was, which is what actually governs
duration. It had to be proxied by a cumulative sum of batch sizes, which is
confounded with time-into-run and assumes the capture starts from an empty
index.

There is also no record of *what* was being harvested, so throughput cannot be
separated by archive or record type — and a population register, a notarial deed
and a marriage register produce very differently shaped documents.

### v2 — from 2026-08-21

Adds, to every row:

| field | why |
|---|---|
| `schema_version` | so a file identifies itself |
| `event` | `sample` or `complete` |
| `index_documents` | the index size — the actual predictor |
| `archive`, `kind` | separates "this export is slow" from "the index grew" |

And adds **one `event: "complete"` row per batch**, written once, carrying
Meilisearch's own `duration` alongside `documents`, `status`, `started_at` and
`finished_at`. Duration is now read, not reconstructed.

---

## Captures we hold

| capture | version | span | batches | notes |
|---|---|---|---|---|
| `batch_telemetry_all.json` | **v1** | 21.6 h, 1,573 samples | 71 (48 usable) | `arg` then `bhi`, on a 12 GB box, index rebuilt partway through. Durations reconstructed; index size proxied. |

Treat any figure derived from this capture as **order-of-magnitude**.

---

## How to analyse a capture

**v2** — filter to `event == "complete"` and use `duration` and
`index_documents` directly. Nothing else is needed.

**v1** — reconstruct, and discard what cannot be pinned down:

1. True start is `timestamp - elapsed_seconds` (the gateway computes elapsed
   from the engine's `startedAt`, so this is exact).
2. The batch ended somewhere between its last sighting and the next batch's
   start. Keep it only when that window is under ~2.5 poll intervals (~38 s);
   otherwise the gap contains idle time.
3. Proxy index size with a cumulative sum of batch sizes, and treat it as
   confounded with elapsed time.

---

## Findings from the v1 capture

### Batch size does not predict duration; index size does

| predictor | correlation with duration |
|---|---|
| documents in the batch | **r = −0.06** |
| documents already indexed | **r = +0.81** |

Regressing duration on batch size alone gives **R² = 0.004**. Adding index size
raises it to **0.68**.

This corrects an earlier conclusion. Measurements taken during `frl.not` were
read as a *fixed cost per batch* (~232 s) plus a marginal per-document cost.
Index size barely moved over those minutes, so a cost proportional to index size
was indistinguishable from a constant. The constant was an artefact.

### Throughput collapses as the corpus grows

| index size | throughput | I/O wait |
|---|---|---|
| 0–1M | 4,775 docs/s | 0% |
| 1–2M | 775 docs/s | 18% |
| 2–3M | 257 docs/s | 18% |
| 7.2M *(live)* | 64.5 docs/s | — |

A **74x** slowdown. The I/O wait column is the mechanism: once the index exceeds
what page cache can hold, every merge pays for disk.

### Extrapolation is unreliable, and errs optimistic

A power law fitted over 50k–3M gives `docs/s ∝ index^-0.76` (R² 0.58 in log
space). Tested against the live rate at 7.2M — 2.4x beyond the fitted range — it
predicted **170 docs/s against an actual 64.5**. Anchoring on that point gives a
steeper `index^-1.31`.

| remaining work from 7.2M | fitted | anchored |
|---|---|---|
| to 13.7M | 14 h | 46 h |
| to 20M | 34 h | 5 days |
| **to the full 51.6M** | 9 days | **52 days** |

Both are extrapolations far beyond the data — 51.6M is 17x past it. The
directional conclusion is what matters: **the full corpus is not reachable on
this hardware as configured**, and the uncertainty is on the bad side.

### Batch size still matters, second-order

Within one index-size band, batches of ≥40k documents ran at 575 docs/s against
183 for smaller ones. The byte-capped batching was worth doing; it is simply
dwarfed by the index-size effect.

### The existing ETA is a fair progress indicator

| | median error | within 2x | worst |
|---|---|---|---|
| `eta_seconds` | 1.12x | 64% | 5.6x |
| `naive_eta_seconds` | 1.51x | 58% | 8.0x |

The phase-weighted estimate beats the naive one, and both err pessimistic, which
is the right direction. Good enough to watch, not to plan against.

---

## What the next capture should settle

Take it on a **different archive**, so nothing is contaminated by the v1 run.

1. **Does the trim move the curve?** The pending schema trim cuts index size 26%
   and each document a further 17%. Since throughput is governed by index size,
   it should shift the whole curve rather than shave a constant. Same archive,
   same batch sizes, before and after.
2. **How much of the decay is record type?** v2 records `kind`, so throughput can
   finally be split by register instead of assumed uniform.
3. **Where does the knee sit relative to RAM?** With `index_documents` recorded
   directly, the point where throughput falls off can be compared against the
   12 GB the box has, which is the number that decides whether more memory
   changes the answer.
