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

## Metrics storage tiers

Separate from batch telemetry, the sampler keeps three tiers of system and
corpus metrics:

| tier | resolution | retention | file |
|---|---|---|---|
| high | 15 s | 24 h | `metrics.jsonl` |
| medium | 15 min | 30 d | `metrics_30d.jsonl` |
| **all-time** | **1 day** | **unbounded** | `metrics_daily.jsonl` |

The all-time tier records a day **only when the corpus changed**. A flat stretch
is already described by the two points that bracket it, so an idle week costs
nothing; eleven days of which three saw change is three rows. A decade of active
days is a few thousand rows.

Two consequences worth knowing:

- **A rebuild appears as a drop to zero.** That is real history — the index has
  been deleted and rebuilt several times — not a rendering fault.
- **The series can end before now**, since a quiet day writes nothing. The
  history endpoint appends the live sample as a final point so the line still
  reaches the present.

`/api/v1/admin/history` picks the tier from the requested window and buckets the
result to at most 360 points. Rates are averaged within a bucket; the document
count takes the **last** value, because averaging a monotonically growing series
understates it inside every bucket.

---

## Harvest provenance and deltas

`harvest_manifest.json` (in the log directory) records one entry per export:
when we harvested it, which published version we got, how many rows and records
it yielded, and the newest `SOURCE_LASTCHANGEDATE` seen.

Two signals let a re-harvest skip work, and they operate at different levels.

**Per file.** Every export serves `Last-Modified` and `ETag`. A HEAD request
costs nothing, so a file whose exact version we already hold is skipped
outright — no download, no parse, no indexing.

**Per record.** Each row carries `SOURCE_LASTCHANGEDATE`, spread over years
rather than clustered at the export date. In `arg.bsg`: 73% last changed in
2016, 13.4% in 2022, 11.3% in 2023.

The second matters because of a trap in the first. All three files below share
one modification time:

```
arg.bsg    Sat, 29 Mar 2025 15:14:56 GMT
bhi.dtb_d  Sat, 29 Mar 2025 15:16:51 GMT
frl.bev    Sat, 29 Mar 2025 15:10:12 GMT
```

That is when Open Archieven **regenerated the exports**, not when their contents
changed. A regeneration therefore invalidates the per-file check for every file,
even those whose records did not move — and the per-record dates are what still
separate new work from old.

Delta mode still downloads and parses the whole file, because a gzip stream
cannot be seeked by date. That is fine: parsing is seconds and indexing is
hours, so filtering before submission skips almost all of the cost.

Measured end to end on `arg.bsg`:

| pass | documents sent to the engine |
|---|---|
| full harvest | 23,769 |
| re-run, file unchanged | **0** |
| delta at the watermark | **0** |
| delta from 2021-01-01 | 5,916 (25%) |

**Safety rules**, each covered by a test:

- A file with no *completed* full pass is never skipped and never delta'd —
  its records may not all be in the index, and skipping would make that
  permanent.
- A failed HEAD is not "unchanged". A network blip must not skip real work.
- A `--limit` run is recorded as incomplete.
- A delta pass may only move the watermark **forwards**, since it saw part of
  the file.
- A record with no change date is always taken; treating unknown as old would
  drop it for good.

### Selecting individual exports

```
python ingest.py --files bhi.dtb_d            # one export
python ingest.py --files bhi.dtb_d,bhi.bsg    # several
python ingest.py bhi --kinds dtb_d            # equivalent, by record type
python ingest.py bhi --delta                  # only what changed
python ingest.py bhi --force                  # ignore the manifest
```

The queue API takes the same labels: an entry of `bhi` harvests the archive,
`bhi.dtb_d` harvests one export. Re-running a single failed export no longer
costs a whole archive. The dashboard's catalog lets a file be selected the
same way, and shows each file's manifest entry — when it was last harvested,
in full or delta mode, and whether that pass was complete.

**Delta is now the default**, both from the CLI and the queue API — a full
re-harvest of a file already in the index is the expensive case, not the
normal one. Pass `--force` for a genuine full re-pull, or uncheck "delta" in
the queue request (the dashboard's "Full harvest" checkbox). A file with no
completed prior harvest is unaffected either way: there is no watermark to
delta against, so it is taken whole regardless of the flag.

### Backfilling files harvested before the manifest existed

Every file indexed before this feature landed has no manifest entry, which
means the default delta behaviour above would treat the next harvest of any
of them as a first-time full pass — re-submitting records already sitting in
the index, exactly the cost this system exists to avoid.

```
python ingest.py bhi aal bor ade arg dev --backfill
```

`--backfill` runs the same download-and-parse pipeline as a normal harvest —
so the version and the newest `SOURCE_LASTCHANGEDATE` it records are real,
not guessed — but skips the search engine entirely: no connection is made to
Meilisearch, nothing is submitted, nothing is settings-poked. It writes only
to `harvest_manifest.json`. Safe to run repeatedly or across the whole
catalog: a file the manifest already covers is skipped exactly like any
other unchanged file, via the same HEAD check `--delta` uses.

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
