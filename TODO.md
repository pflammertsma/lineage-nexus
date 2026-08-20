# Lineage Nexus Development Roadmap

## 🎯 Current Priorities

**The app is live at https://lineage.nexus with real users possible**, so
correctness and observability now outrank new features. Grouped by that.

### A. Live-site risks (do first)
- [x] **Firestore restructured: one document per message.** The session document
  now holds metadata only (`title`, `updatedAt`, `messageCount`); messages live in
  a `messages` subcollection. This removed three problems at once, not just the
  size ceiling:
  - **No session ceiling.** Only a single message would have to exceed 1 MiB,
    which a biography never does. The size guard moved to per-message.
  - **No write amplification.** Appending a message was rewriting the entire
    history — hundreds of kilobytes per turn on a long session. Now one small
    document.
  - **No read amplification, and no last-writer-wins.** Snapshots carry only the
    documents that changed rather than the whole transcript, and two devices
    writing different messages no longer clobber each other. This also closes the
    "multi-device conflict handling" item under Unverified.

  Messages are fetched per open session rather than all at once, so a sidebar of
  fifty conversations does not open fifty listeners. Legacy sessions migrate
  lazily on first load, and `deleteField()` removes the old inline array —
  without which a merge write would leave it in place for ever and the new rules
  would reject the document.

  Deletion now removes the subcollection first; Firestore does not cascade, and a
  session document deleted before its messages leaves orphans nothing can reach.

  *Verified: 25 unit tests on the pure helpers; rules deployed before the client
  so no write hit an outdated ruleset.*
- [x] **Error monitoring built** (`monitoring.js`), scrubbed of research content and
  inert until `VITE_SENTRY_DSN` is set — supply a DSN to switch it on. Original note: We are live and blind — nothing reports a broken
  deploy, an SSE failure, or a Firestore rejection. Sentry (or equivalent) on
  both the frontend and the Cloud Run service. Must be configured to scrub
  research content, to keep the "we do not log your research" claim true.

### A2. Migrate to the self-hosted API (deprecate Cloud Run)

Move the research orchestrator off Cloud Run and onto the OCI-hosted archival
gateway at `api.lineage.nexus`, so there is one API instead of two.

- [x] **SSE through the Cloudflare Tunnel: tested, and it works with keepalives.**
  Measured against the live tunnel with a deliberately silent stream:

  | silence | result |
  |---|---|
  | 20 / 30 / 45 / 90 / 110s | survived |
  | 130s | dropped, ~126s in |

  So the tolerance is about **120 seconds**, and `QUOTA_MAX_WAIT_SECONDS = 120`
  sat exactly on that boundary — a single quota pause was a coin flip.
- [x] **Keepalive added** (`main.py`, `KEEPALIVE_SECONDS = 15`). The stream now
  emits an SSE comment frame during any silence. Wrapping the iterator covers
  every silent period rather than each place that happens to wait, and clients
  skip lines that are not `data: `, so the UI never sees them.
  - Implementation note worth keeping: the pull is held in a Task across
    timeouts. `asyncio.wait_for` cancels the coroutine it is waiting on, which
    tears down the async generator — a unit test caught research turns ending
    silently after the first keepalive.
  - *Verified: all frames delivered across two silent gaps, keepalives invisible
    to the client parser.*
- [ ] Port `apps/cloud-backend` onto the OCI service. Carry over, because these
  are easy to lose in a port: the per-key rate limiter, the request/history caps,
  `LOG_RESEARCH_CONTENT=false` (the privacy policy promises research is not
  logged, and the VM logs to disk by default), and the AI-generation marker.
- [ ] Run both APIs in parallel and complete a full research turn against OCI
  before switching anything.
- [ ] Flip `VITE_API_BASE_URL`; `VITE_ADMIN_API_BASE_URL` then collapses into it.
- [ ] Decommission the Cloud Run service.
- [ ] Accept what Cloud Run was providing: managed TLS, instant revision
  rollback, and no OS to patch. On the VM those become ours.

**Note:** the migration does *not* fix the Open Archieven rate limit. It changes
which single IP the requests come from. The limit only stops mattering when
searches are served from our own index.

- [ ] **Fall back to Open Archieven on an index miss.** The archival API is
  authoritative only for what has been harvested; anything it does not know must
  still be answerable. The research tools should query our index first and fall
  back to Open Archieven when it returns nothing, so coverage grows with the
  index instead of gating on it.
- [ ] Harvest the corpus into Meilisearch. This is the change that actually
  removes the rate-limit constraint, and it is a project rather than a task —
  check Open Archieven's terms on bulk retrieval before starting.
  - [x] `ade` — 773,234 records, indexed.
  - [x] Download and submit `frl` (10,205,019) and `gra` (2,680,560) via
    `services/archival-harvester/ingest.py`. Streamed from the sanctioned bulk
    CSV exports; no file ever staged to disk.
  - [x] **Volume grown to 200 GB** (193 GB filesystem, 179 GB free). The Oracle
    Cloud agent grew the partition live; no reboot, no manual `growpart`. Disk is
    no longer a constraint on the full corpus — at the measured ~1.29 KB/record
    the whole 51.6M-record set is ~66 GB. It does **not** address the stall
    below, which is memory-bound.
  - [x] **Indexing progress exposed on the dashboard**
    (`/api/v1/admin/indexing` + `IndexingProgress.jsx`). Coverage reports what is
    *searchable*; documents accepted but not yet merged are invisible there, so a
    stalled harvest and a finished one looked identical. The panel shows queue
    depth, the batch in flight with the engine's own step counters, throughput,
    and how long the document count has been unchanged. Completed batch durations
    sit underneath as the yardstick — a batch that has run 20x longer than the
    ones before it is the signal worth acting on.
  - [x] **Diagnosed and cleared: the engine was thrashing, not working.** The
    ingest submitted far faster than the engine indexes, so 1,289 tasks (5.4 GB
    of pending payloads) piled up and Meilisearch auto-grouped 266 of them into
    one 2.66M-document batch. That batch ran 45 minutes and indexed nothing.

    Proving it was genuinely stuck, rather than slow, needed `/proc/<pid>/io` —
    the engine's own counters could not distinguish the two:

    | signal | reading |
    |---|---|
    | `read_bytes` | +7.5 GB in 81s (~92 MB/s), 178 GB cumulative |
    | `write_bytes` | +20 KB in 81s |
    | `rchar` | unchanged |

    `rchar` flat while `read_bytes` climbs means memory-mapped page faults, not
    `read()` calls — LMDB faulting pages back in. 178 GB of reads against a 5 GB
    database is the same data ~35 times over, and near-zero writes means nothing
    was being produced. Note the process to measure is the container's *child*:
    `docker inspect -f '{{.State.Pid}}'` returns the tini shim, which is idle and
    reads zero, and measuring it suggests a healthy engine doing nothing.

    Fixed by recreating the container with `MEILI_MAX_INDEXING_MEMORY=2GiB` so the
    indexer spills to disk instead of thrashing the page cache. Non-destructive:
    enqueued tasks are durable and LMDB is crash-safe, so all 3,659,141 documents
    and all 1,121 tasks survived — only the wasted in-flight batch was discarded.
    The step counter, frozen at `payload 200/266` for 45 minutes, resumed
    immediately and passed 800 within three minutes.
  - [x] **Backpressure added to `ingest.py`.** After each submission it waits for
    the queue to fall to `INGEST_MAX_PENDING_TASKS` (default 8) before sending
    more, which bounds how much the engine can group into one batch — the thing
    that actually has to fit in memory. It gives up after
    `INGEST_STALL_SECONDS` (default 900) rather than blocking for ever, and skips
    waiting entirely if the count cannot be read, so a broken status endpoint
    slows the ingest rather than halting it. Costs nothing in throughput: the
    engine was always the bottleneck. *Verified against stubs: drains, unreadable
    count, frozen queue, and already-empty all behave.*
    **Not yet deployed** — deploying restarts the gateway and wipes the metrics
    history, which is worth avoiding while the current run is being watched.
  - [ ] Consider more RAM before attempting the full corpus. 6 GB was enough to
    thrash at 13M documents; the 2 GiB cap works but leaves little headroom.
  - [x] **Dashboard polish.** Rate reads `—` when the index is idle rather than
        `0/s`, which looked like a stall instead of "nothing to do" (`0/s` still
        shows while actively indexing, where it genuinely means stalled).
        "Records held" is now "Records", with a `?` that opens a glossary of both
        archive codes and record types — `title` tooltips need a mouse, so on a
        phone the abbreviations were simply unexplained. Archive names come from
        the index's own `institution` field rather than a table maintained here:
        `ade` is **Archief Delft**, which the abbreviation does not suggest, and a
        hardcoded list would be wrong the first time an unfamiliar archive is
        harvested. Chart readouts moved from the legend into a card pinned to the
        crosshair, flipping side near the right edge, with touch scrubbing.
        *Verified in a temporary harness against real geometry: card stays inside
        the plot at 25% and 95%, clears on mouseout and touchend, glossary opens
        and closes, nested steps render indented.*
- [x] **VM scaled to 2 OCPU / 12 GB** — `VM.Standard.A1.Flex` in `eu-zurich-1`,
  up from 1 OCPU / 6 GB. The stop/start was clean: `gateway` and `meilisearch`
  are `restart: always`, `cloudflared` is an enabled systemd unit, Docker starts
  at boot, and the Meilisearch bind mount is on the root filesystem.

  **Correction to earlier advice in this file, which said to go to 4 OCPU /
  24 GB: that is no longer free.** Oracle halved the Always Free Ampere
  allowance to **2 OCPUs / 12 GB** effective 15 June 2026 (documented as 1,500
  OCPU hours and 9,000 GB hours per month), with no announcement — the docs
  simply changed. Tenancies over the limit had until **18 August 2026** to
  comply. 2/12 is now the ceiling, and the instance sits exactly on it.
- [ ] **Idle reclamation is a live risk.** Oracle may reclaim an Always Free A1
  instance idle for 7 days — 95th-percentile CPU under 20%, network under 20%,
  *and* memory under 20% (the memory clause applies to A1 only). With no users,
  this box is idle nearly all the time. Worth confirming what the sampled
  metrics actually show against those thresholds before assuming we are safe.
- [x] **Metrics history now survives a deploy.** The ring buffer is mirrored to
  `/opt/archival-state/metrics.jsonl` through a bind mount, as JSON Lines so a
  truncated final line costs one sample rather than the file. Loaded on startup
  filtered to the retention window, compacted hourly to stay ~0.5 MB, and it
  degrades to memory-only rather than raising if the path is unwritable.
  The dashboard also tolerates one missed poll — a redeploy shows
  "Reconnecting…" with the last good reading still on screen, instead of an
  error banner, since a rebuild takes the API down for a few seconds.
  *Verified end to end: 5 samples before a redeploy, same oldest timestamp
  after, gateway logged `restored 5 metric samples`. Unit tests cover reload,
  window filtering, truncated lines, compaction and an unwritable path.*
  - [x] **It finished: 11,782,742 records searchable, 0 tasks failed.** That one
        batch took **9h 2m** (`PT32555.9S`). It was thrashing the whole time and
        still completed, so "no forward progress" was the wrong call — the right
        reading was "progressing at a rate that makes the run untenable".
  - [x] **Dashboard now shows I/O wait.** `cpu_percent` excludes it, so a box
        pinned at 98 MB/s of page-fault reads reported 4.9% CPU and 20% memory
        while `vmstat` showed 0% idle and 94% iowait — idle-looking on every
        metric we had. Memory misleads the same way: psutil counts page cache as
        "available", but during indexing the cache *is* the working set (4.87 GB
        cached, 70 MB free). Both now visible.
  - [x] **Nested step counters no longer read as contradictory.** Meilisearch
        reports a stack — `processing tasks 0/2` contains `computing document
        changes 1/3` contains `payload 911/1121` — and rendering it flat made one
        batch look like four disagreeing progress bars.
  - [x] **Found and fixed silent person-loss in `not` and `bev`.** Confirmed
        against the finished index: six of eight `frl` record types matched their
        submitted counts exactly, while `bev` lost 320,907 and `not` lost
        1,555,164.

        Cause: those exports emit **one row per person**, not one per record. In
        `frl.not`, 40,000 rows carry 17,930 distinct GUIDs, and a single notarial
        deed appears as three rows naming three different people. Keying on
        `{archive}_{guid}` made Meilisearch treat them as repeated updates of one
        document, so only the last person survived and the rest became
        unfindable. The earlier 30,000-row GUID check missed it because it
        sampled `dtb_d`, which is genuinely one row per record.

        `merged_documents()` now merges consecutive rows sharing a GUID into one
        document holding every person. Safe to stream: across 200,000 rows of
        `frl.not`, zero GUIDs reappear after a gap, so runs are always contiguous
        and only one record is held at a time.

        *Verified against the live export: 40,000 rows collapse to exactly 17,930
        records with unique ids, retaining 39,912 people where the old code kept
        17,930.* Longest legitimate run is 127 people on one deed.
  - [ ] **Re-ingest `frl` and `gra` to recover the lost people.** The index is
        complete-looking but wrong: ~1.88M records are missing everyone except
        one person. Needs the RAM decision first — a repeat at 9h per batch is
        not worth doing twice.
  - [ ] Confirm the final document count against the 13,658,813 submitted.
    Per-task stats report ~9% fewer `indexedDocuments` than received. Sampling
    30,000 rows of `frl.dtb_d` found no repeated `SOURCE_RECORD_GUID`, so it is
    not intra-file duplication; if the final count really is ~9% short, the id
    scheme (`{archive}_{guid}`, no `kind`) is collapsing records that appear in
    two exports, and needs `kind` mixed in.

### B. Post-launch cleanups
- [x] **Admin dashboard** at `/admin`, gated on a Firebase `admin` custom claim,
  with the gateway verifying the ID token against Google's public certs — no
  service account key on the VM, and no shared secret in the browser.
- [x] **Rotated the archival secrets.** `MEILI_MASTER_KEY` and
  `ADMIN_SECRET_TOKEN` were pasted into a chat transcript and were briefly staged
  for commit to a public repository. They are gitignored now, but the values are
  burned. Generate new ones, update `.deploy.env`, redeploy the gateway.
- [ ] **Rotate `MEILI_MASTER_KEY` again.** The replacement value was printed into
  a chat transcript a second time, by a `docker inspect ... .Config.Env` whose
  filter matched `MEILI_MASTER_KEY` alongside the memory settings it was actually
  looking for. Same remedy as above. Reading a container's environment is the
  hazard here — filter for the specific variable wanted, never a prefix that a
  secret also matches.
- [x] **Admin token comparison is now constant-time** (`secrets.compare_digest`); it was
  a plain `!=`, which is not constant-time and leaks length/prefix information through
  timing. Use `secrets.compare_digest`.
- [x] **Simplify API key management** *(implemented, not yet deployed)*. One
  prominent "Gemini API key" field; the second key is now behind an understated
  "Add a backup key" link, expanded automatically if one is already set. The
  "Paid / Main" and "Optional Free Tier" badges are gone — they implied we bill
  for something, when every key is the user's own Google account, and framed the
  backup as expected rather than optional.
- [x] **Firestore lazy-loaded** — first load dropped 307 kB -> 182 kB gzip (-41%).
  Superseded note: The bundle is ~1 MB (307 kB gzip) in a single
  chunk, mostly Firebase. `useAuth` calls `getFirebaseAuth()` synchronously, so
  this needs an async init path rather than a config tweak.
- [ ] **Ask Open Archives to raise the per-IP limit** — see Known Issues. Worth
  doing now that we send a descriptive user-agent, since they can reach us.
- [ ] **`www.lineage.nexus` does not resolve.** Only the apex is configured. If
  wanted, it needs its own DNS record plus adding the domain in Firebase Hosting.
- [ ] **Uncommitted work.** Analytics, consent banner, confirm dialog, chips,
  hero, auth hardening and the deploy script are all live but uncommitted.
- [ ] **Visual pass at 768 / 2560px**, and the vertical rhythm between message
  blocks, the wikitext card and the research trail. Never eyeballed.

### C. Product features
- [ ] **Self-Hosted Archival Engine (OCI)**: Replace OpenArchieven and WieWasWie HTTP dependencies with a self-hosted OCI search mirror to eliminate rate-limit bottlenecks and reduce search turn latency to <500ms. Architectural plan drafted in [`docs/self_hosted_archive_plan.md`](file:///c:/Users/pflam/StudioProjects/lineage-nexus/docs/self_hosted_archive_plan.md).
- [ ] **Relationship graph**: generate a relationship graph component to show the relationships between the people in the conversation.
- [ ] **Holocaust Records**: implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM). Legacy prompts and API clients are in `archived/adk-app/agent/holocaust.py` and `archived/adk-app/api/` for reference.
- [ ] **Wikitext Wizard**: refine 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).
- [ ] **Dynamic Resource Tuning**: add a UI slider to adjust `MAX_SEARCH_PER_TURN` for advanced research sessions.
- [ ] **Auto-Focus Logic**: improve the `SYSTEM_INSTRUCTION` to strictly prioritize reading existing WikiTree context before any archival queries.
- [x] **Delete Profiles Confirmation**: `ConfirmDialog` names the conversation
  being deleted, and says explicitly when sync is on that it will disappear from
  other devices too. Cancel takes focus rather than Confirm, so a stray Enter
  dismisses rather than destroys. *Verified: click does not delete; Cancel and
  Escape both keep it; Confirm removes only the targeted session; body scroll
  lock released in every path.*
- [x] **Standardize the Research Suggestion Chips**: one `ACTIONS` array and one
  render path replace four near-duplicate JSX blocks — which is how the Holocaust
  chip drifted to a rose palette and read as a warning rather than a peer. All
  four now share sizing and colour, with `shrink-0`/`whitespace-nowrap` keeping
  them on a single horizontally-scrolling line on mobile.

## 🚀 Production Readiness Checklist

Target: publish the web frontend on a custom domain with the API on Cloud Run.
**Both are now live**; what remains is listed unchecked below. Substitute your
own values for every `<placeholder>` — nothing here is tied to a particular
account or project.

Phases 0 and 1 are the safety rails: skipping them is how you deploy into the
wrong project or ship a bundle that silently fakes sign-in. Both proved their
worth — the project guard caught a real mismatch, and the simulated login had
already fooled us into thinking there was no login at all.

### 0. Safety rails (do these first)
- [x] ⚠️ **Guard against deploying into the wrong project.** `gcloud` deploys to
  whatever `gcloud config get-value project` returns; at the time this was
  written that was an unrelated project, so `pnpm deploy` would have shipped the
  API into it. Every command in `scripts/deploy.mjs` now refuses to run unless
  the configured project is also the active one, and prints the fix.
  *Verified: it caught exactly that mismatch and exited 1 without deploying.*
- [x] Configuration lives in a gitignored `.deploy.env` (template:
  `.deploy.env.example`), so no project id, domain or account detail is committed
  to this public repository. `firebase --project` is passed explicitly, so no
  `.firebaserc` is needed either.
- [x] `--max-instances` defaults to **1**, overridable via
  `LINEAGE_MAX_INSTANCES`, which warns when raised. This is a correctness
  requirement, not a cost tweak — see Operational caveats.
- [ ] Set a **billing budget + alert** on the project *(console — cannot be done
  from the repo)*. The API is `--allow-unauthenticated` with long-lived SSE
  turns; Gemini spend is on the caller (BYOK) but Cloud Run CPU and egress are
  on you.

### Prerequisites
- One Google Cloud project for the app, with **Firebase added to that same project**, so Cloud Run, Auth and Firestore share a project and billing account.
- `gcloud` and `firebase` CLIs installed and authenticated.
- Copy `.deploy.env.example` to `.deploy.env` and fill it in.

### 1. Firebase console (one-time, manual)

Google sign-in is **already implemented** — `useAuth.js` uses `signInWithPopup`
with `GoogleAuthProvider`, plus `onAuthStateChanged` and `signOut`. It is inert
only because no project is configured, in which case the hook falls back to the
simulated local login. These console steps are all that stand between the
existing code and a working login.

- [x] Firebase added to the GCP project.
- [x] **Google provider enabled** — confirmed via the Identity Toolkit admin API
      (`google.com -> enabled: True`), not assumed.
- [x] **Authorized domains** include `lineage.nexus`, `localhost` and the two
      default Firebase domains. (Missing these gives `auth/unauthorized-domain`.)
- [x] **OAuth consent screen** configured in *Google Cloud Console* → Google Auth
      Platform → Branding — it is **not** in the Firebase console, which is the
      confusing part. App name, support email, home page and privacy URL set.
- [x] **Firestore** database created.
- [x] **Publishing status is "In production"** (Audience page). In Testing
      only manually-added test users can sign in, which for a public site means
      nobody.
- [ ] Brand verification is pending, triggered *solely by uploading a logo*. The
      failures listed were all "URL unresponsive", caused by nothing being
      deployed yet; they should clear once the domain resolves. "Not registered
      to you" needs domain ownership verification in Google Search Console.
      Removing the logo skips this entirely.
- [x] Client-side auth hardening done ahead of the above:
  - [x] **Popup → redirect fallback.** `signInWithPopup` fails outright in
    in-app browsers (a link opened from a mail or social app), behind popup
    blockers, and in some privacy modes. Those cases now fall back to
    `signInWithRedirect`, with `getRedirectResult` on mount to surface errors
    that would otherwise strand the user back on the landing page.
  - [x] **Actionable error messages.** Firebase's raw text is written for
    developers; the two configuration failures above are now named explicitly,
    since they are exactly what a fresh deployment hits.
  - [x] **Fixed a routing race that would have appeared on day one.** The routes
    read `isSignedIn` before `onAuthStateChanged` had fired, so a signed-in user
    reloading `/chat` was bounced to the landing page and only then redirected
    back — a visible flash and a lost deep link. Routing now waits on
    `auth.ready`, which is true immediately when Firebase is unconfigured.
  - [x] **The simulated login is now labelled.** It was indistinguishable from a
    real session, which is how it gets shipped by accident — and it is why the
    app appeared to have no login process at all. The header shows an amber
    "Simulated login" badge whenever Firebase is unconfigured. *Verified in the
    browser.*

### 2. Backend → Cloud Run
```bash
pnpm deploy:api
```
- [x] CORS, the 900s timeout and `--max-instances` are all applied by the deploy
  script, which also refuses to run if `LINEAGE_ALLOWED_ORIGINS` is unset —
  the backend defaults CORS to `*`, and that default must never reach production.
  The default 300s timeout is not enough: a turn can span several paced archive
  searches (~15s each) plus quota waits (~47s each), and the connection must stay
  open throughout or the stream is cut mid-research.
- [x] **Deployed.** Cloud Run, Cloud Build and Artifact Registry enabled;
  service live at the printed URL, `max-instances=1`, 900s timeout.
- [x] Service URL wired into `VITE_API_BASE_URL`.
- [x] *Verified live:* health 200; CORS allows both deployed origins and
  **rejects a foreign origin with 400**; `/api/v1/chat` returns 401 without a
  key header; `/api/v1/validate-key` round-trips correctly.
- No secrets are needed on the service — BYOK means the Gemini key arrives per-request from the browser.

### 3. Frontend config
- [x] ⚠️ **Build-time guard added** (`vite.config.js`). Both config fallbacks fail
  silently and are unsafe in production, so a production build now refuses to
  emit either:
  - Unset `VITE_FIREBASE_*` → `isFirebaseConfigured === false` → `useAuth.js`
    falls back to the **simulated login**, so "Sign in with Google" merely sets a
    localStorage boolean and shows the visitor as "Researcher". Shipping that
    publicly is worse than having no sign-in at all.
  - Unset `VITE_API_BASE_URL` → the bundle calls `http://localhost:8081`, i.e.
    the visitor's own machine, blocked as mixed content over HTTPS.

  Also rejects a non-HTTPS API URL. Escape hatch for a deliberate local-only
  build: `VITE_ALLOW_INCOMPLETE_CONFIG=true`.
  *Verified: `pnpm build` fails with both problems listed, and succeeds with the
  escape hatch set.*
- [x] `.env` written. The `VITE_FIREBASE_*` values were pulled with
  `firebase apps:sdkconfig WEB` rather than copied by hand. Note a Web app had
  to be **registered first** (`firebase apps:create WEB`) — the config does not
  exist until one does, which is why Project settings showed nothing.
- These are compiled into the bundle at build time, so changing them requires a rebuild. That is expected: Firebase web config is a public client identifier, and `firestore.rules` is what actually enforces access.

### 4. Firestore rules
```bash
pnpm deploy:rules
```
- [x] Deployed — rules compiled and released.

### 5. Frontend hosting
- [x] `firebase.json` added: serves `apps/web-frontend/dist`, rewrites all routes
  to `/index.html` (client-side routing would otherwise 404 on deep links and
  refreshes), caches hashed assets immutably while keeping `index.html`
  uncached, and sets `X-Content-Type-Options`, `Referrer-Policy` and
  `X-Frame-Options`.
- [x] `pnpm deploy:web` builds and deploys; `pnpm deploy` does rules, API, then
  web, in that order — rules first, because sync fails silently against
  default deny-all rules and should never lag behind the client.
- [x] Project id stays out of the repo (see phase 0).
- [x] **Live at the Firebase Hosting URL.** *Verified:* SPA rewrites serve
  `/privacy`, `/terms`, `/chat` and unknown paths instead of 404ing;
  robots.txt and sitemap.xml serve; security headers present.
- [x] Fixed two cache-header bugs found only after deploying: the `no-cache`
  rule targeted `/index.html`, which never matches because the rewritten path
  stays `/privacy`, so HTML was served with `max-age=3600` and deploys would
  take an hour to reach users. Then the catch-all overrode the asset rule —
  Firebase applies **every** matching rule with the **last** winning, the
  opposite of first-match. Final state confirmed by curl: HTML `no-cache`,
  hashed assets `immutable`, security headers on both.

### 6. Domain & DNS
- [x] Apex A + TXT records created; `lineage.nexus` already in Firebase
  Authorized domains (verified via the Identity Toolkit API, along with the
  Google provider being enabled).
- [x] **Proxy disabled on the A record.** While proxied it resolved to the CDN
  edge instead of Firebase, so Firebase served its default `firebaseapp.com`
  certificate and a "Site Not Found" body — `https://lineage.nexus` failed with
  a name-mismatch error. DNS-only now resolves to `199.36.158.100` on both
  8.8.8.8 and 1.1.1.1, with no leftover AAAA records.
- [x] Certificate issued and live (`CN=lineage.nexus`). Was: waiting on Firebase (async, minutes to ~24h).
  Status moves Needs setup → Pending → **Connected**; only Connected means the
  cert is live. Nothing else depends on this.
- [ ] ⚠️ **Do not proxy the API through a CDN that buffers responses.** Research
  turns are long-lived SSE streams; a buffering proxy (or a short edge request
  timeout) will cut them mid-turn. Keep the API on its Cloud Run URL, or set the
  DNS record to DNS-only rather than proxied.
- [ ] A proxying CDN in front of Firebase Hosting's own CDN and certificate is a
  common source of redirect loops and cert errors. If it fights you, host the
  static site on the CDN provider's own static hosting instead.
- [ ] Force HTTPS; verify the certificate covers apex and `www`.
- [ ] If the production domain ever changes, update it in `index.html`
  (canonical + OG), `public/robots.txt`, `public/sitemap.xml`, the extension's
  `manifest.json` and `popup/popup.js`, and `content_script.js`'s
  `isLineageAppPage()`.

### 7. UI optimization (mobile + desktop)

**Mobile — sidebar is now an overlay**
- [x] `Sidebar` was `w-64` inside a flex row, so on a 375px viewport it took
  256px and left ~119px for the chat, which wrapped the research trail to
  roughly one character per line.
- [x] Below `md` it is a fixed drawer over the transcript; at `md` and up it is
  an ordinary flex child again, so desktop behaviour is unchanged.
- [x] Dismisses on backdrop tap, Escape, the hamburger, choosing a session, and
  starting a new one. Also auto-closes when the viewport crosses the breakpoint,
  so a resize cannot strand the scroll lock on a desktop layout.
- [x] Hamburger toggle added to `Header`, shown only when signed in. It toggles
  rather than only opening, and the drawer starts below the header, so it stays
  reachable while the drawer is open — no in-drawer close button needed.
- [x] Body scroll locked while open, restoring the previous value on close.
- [x] `Sidebar`'s `h-screen` fixed — it was 70px taller than its own row.
- [x] `100vh` → `100dvh` so mobile browser chrome no longer clips the composer.
- [x] Per-session delete is always visible below `md` (hover is not a gesture a
  phone has) and is a 40px target; drawer controls are 44px.
- [x] `ResearchTrail` rows wrap: below `sm` the result drops to its own line
  instead of being pushed by `ml-auto`, and `break-all` → `break-words`.
- [x] Safe-area insets on the composer and the sidebar footer.
- [x] `ChatInput` action row: `.no-scrollbar` was **referenced but never
  defined**, so the row showed a raw scrollbar on a phone (the same failure mode
  as the missing colour tokens). Defined it, tightened the gutters, and raised
  the action buttons from 24px to 36px tall on touch while leaving the dense
  desktop row unchanged.

**Desktop — weighting**
- [x] **The two competing centre lines are gone.** `Header` used `.container`
  (max 1100px, centred on the viewport) while the transcript was capped to 800px
  centred inside `main` — i.e. the viewport minus the sidebar — leaving the
  wordmark ~320px left of the column it sat above. On `/chat` the header is now
  full-bleed with the wordmark over the sidebar, so the transcript is the only
  centred element.
- [x] Magic numbers replaced by tokens: `--h-header`, `--w-sidebar`,
  `--w-reading`, `--h-composer` in `index.css`. The scroll spacer and the
  scroll-to-bottom offset are both derived from the composer height, and the
  composer shares `.reading-column` with the transcript so it can never be a
  different width from the text it answers.
- [x] Measure widened 800 → 820px with padding that grows at `sm`/`lg`.

**Verified in the browser**
- [x] 375px: drawer overlays the transcript with a dimmed backdrop; closes on
  backdrop tap, Escape, and choosing a session, releasing the body scroll lock
  each time. When closed it is `visibility: hidden`, so it is out of the tab
  order rather than merely off-screen.
- [x] 375px: the research trail is readable — label, query, then the result on
  its own line. Previously one character per line.
- [x] 1440px: sidebar reverts to `static` (272px flex child); transcript and
  composer both span exactly 438→1258px, i.e. perfectly aligned at 820px wide;
  the wordmark sits at x=60 over the sidebar instead of competing with the
  column at x=450. Gutters are symmetric (166 / 182px).
- [x] No horizontal document overflow at either width; the wikitext block
  scrolls inside its own container as intended.
- [x] `pnpm lint` clean, `pnpm build` succeeds, and the generated CSS contains
  every new token and component class.

- [x] **Theme toggle left stale colours** (found while checking the policy page,
  but it affected the whole app). Elements with `transition-colors` take their
  colour from a theme custom property; changing the property does not restart a
  running transition, so they kept the outgoing palette. Switching light → dark
  left small links at the light colour on a dark ground — about 2:1, effectively
  invisible — and it persisted rather than settling. `applyPreference()` now
  suppresses transitions for one frame across the swap, with a forced reflow so
  the browser cannot coalesce the two class changes. *Verified across a full
  light → dark → system → light cycle: no stale colours.*
- [x] `/privacy` and `/terms` render, all routes resolve, unknown paths fall back
  to `/`, and contrast passes AA in both themes (prose 13.7–16.4:1, links
  5.8–8.9:1, small print 5.1–7.6:1). Raised the page's small text from the muted
  chrome tokens, which measured 3.4–4.3:1.

**Still to eyeball** *(subjective)*
- [ ] 768 / 2560px.
- [ ] Vertical rhythm between message blocks, the wikitext card and the trail.

### 8. Legal & trust
- [x] `/privacy` and `/terms` added (`components/LegalPage.jsx`) and routed.
- [x] **Linked from everywhere**, which it was not at first — the header's
  marketing nav and the landing footer both disappear once signed in, and `/`
  redirects to `/chat`, so a signed-in user had no route to the policy at all.
  Now also in the sidebar footer and the account dropdown, and the two pages
  cross-link each other.
- [x] Fixed the header nav on non-landing routes: "Platform" was `href="#features"`,
  which resolved against the current path (`/privacy#features`) and went nowhere.
  It is now "Home" → `/` off the landing page, and the wordmark is a home link.
- [x] Privacy covers: the API key (browser-local, per-request, never stored,
  never synced), research storage and opt-in sync, what Google sign-in provides,
  the third parties queried, no analytics/ads/training, and a note on the living
  people who appear in genealogical records.
- [x] Deletion documented — per-conversation, delete-everything, and clearing
  site data.
- [x] Terms cover: verify-before-publish (model output can be wrong), that the
  Gemini key and its costs are the user's, fair use of the archives, source
  attribution, availability, and liability.
- [x] Claims checked against the code. Two proposed wordings were **false** and
  have been corrected or made true:
  - *"We don't have access to your keys, they are passed directly to Gemini"* —
    **not true, and not fixable without a rearchitecture.** The orchestrator runs
    server-side, so `main.py` receives the key in a header and constructs
    `genai.Client(api_key=...)` on our server. The policy now says plainly that
    the key reaches our server, is held in memory for the request only, and is
    never stored or logged. Making the original claim true would mean calling
    Gemini from the browser, which the tool-calling loop cannot do.
  - *"We don't track your research, not even in our server logs"* — was false,
    **now true.** `orchestrator.py` printed the full user query, and
    `report_status` printed every status line (names, archives, queries) to
    stdout, which Cloud Run persists to Cloud Logging. Content-bearing output now
    goes through `debug_log()`, off unless `LOG_RESEARCH_CONTENT=true`. Error
    paths log the exception *type* only. *Verified: suppressed by default,
    emitted when opted in.*
  - *"We don't train on your research"* — true of us, with a caveat now stated:
    queries are processed by Google under the user's own key, and Google's free
    API tier may use submitted content to improve its services.
  - *"Only Google Analytics for analytics"* — policy updated to name it. The
    previous blanket "no analytics" claim is gone.
- [ ] **Google Analytics is not integrated yet** — the policy now describes it,
  so either add it or drop that paragraph before launch. When adding:
  - [ ] **A consent banner is now required**, and GA must stay off until the
    visitor agrees. GA sets cookies and processes a device identifier, so under
    EU ePrivacy rules consent is needed before it loads — this is a harder
    requirement than a cookieless EU-hosted tool would have been, and it is new
    work the PostHog plan did not need.
  - [ ] Disable Google Signals and ads data sharing, or the "no advertising"
    line in the policy stops being true.
  - [ ] Send page views only. Never pass the query, a biography, a person's name
    or an archive result into an event parameter or a custom dimension — that
    would contradict the "we do not log your research" claim made two paragraphs
    earlier in the same policy.
  - [ ] Note `/chat` is `Disallow`ed in robots.txt but still reports page views;
    that is fine, the URL carries no research content.
- [ ] Read the pages and correct anything that still misstates your intent —
  these are a drafted starting point, not legal advice.

### 9. Onboarding & abuse
- [x] BYOK explained on the landing page, with a link to Google AI Studio and an
  inline way to add the key. Previously the first search silently bounced into
  the settings modal, which reads as an error rather than a setup step. Hidden
  once a key is present.
- [x] `/api/v1/chat` rate-limited: 20 requests per 5 minutes per key, in a
  sliding window, returning 429 with `Retry-After`. Keyed on a SHA-256 of the
  API key rather than the IP, so the limiter never holds a credential and a
  shared network is not collectively punished.
- [x] Request caps: 8k chars per message, 60 messages and 400k chars of history,
  1MB body. History is **trimmed rather than rejected** — a long research session
  is the normal case, and a 422 partway through one is indistinguishable from the
  app breaking.
  *Verified: 5 unit tests on trimming and the limiter.*
- [x] SSE `console.log` calls removed from `App.jsx`.
- [ ] Consider requiring a Firebase ID token as well. The rate limit bounds abuse
  per key but the endpoint is still open, and the in-process bucket is
  per-instance.

### 10. Observability & polish
- [x] Open Graph / Twitter tags, canonical URL, per-scheme `theme-color`,
  `robots.txt` and `sitemap.xml` added.
- [x] Extension: `http://localhost:*/*` removed from `host_permissions`, replaced
  with the production origin. The app-page bridge (`isLineageAppPage`) now
  recognises the real domain instead of only localhost, so the direct
  "Send to extension" push works in production rather than being dead code, and
  the popup's hardcoded `localhost:5173` link is now the deployed URL with a
  `chrome.storage` override for development.
- [x] `pnpm lint` clean again — fixed an unused `isAtBottom` state, two empty
  catch blocks, a stale `useEffect` import, and a `setState`-in-effect that now
  adjusts during render instead.
- [ ] Add error monitoring. Nothing currently reports that the site is broken.
- [ ] Firestore documents cap at 1 MiB and `messages` is unbounded, so long
  sessions will eventually fail to sync — and `useSyncedSessions` swallows the
  failure into `syncState: 'error'`. Trim, chunk, or surface it properly.
- [ ] Bundle is 1.0 MB (306 kB gzip) in a single chunk, mostly Firebase.
  Lazy-load `firebase/firestore` behind sign-in. Not attempted: `useAuth` calls
  `getFirebaseAuth()` synchronously, so this needs an async init path rather
  than a config tweak.

### 11. Post-deploy verification
These paths have never executed — see "Unverified" below.
- [ ] Google sign-in, end to end.
- [ ] Consent dialog appears once per account; declining leaves sync off.
- [ ] Two-device sync: a session created on one device appears on the other.
- [ ] Deleting one conversation removes it on both devices.
- [ ] "Delete everything" empties the Firestore subcollection.
- [ ] SSE streaming survives Cloud Run — verify no proxy buffering and no mid-turn disconnects.

### Operational caveats
- The backend keeps **in-process** state only: the OpenArchieven LRU cache and the global rate-limit clock. With more than one Cloud Run instance these are per-instance, so the archive pacing is no longer globally correct and cache hits drop. Consider `--max-instances=1` initially, or move both to shared storage.
- ⚠️ **`--max-instances=1` is a correctness requirement, not a cost tweak.**
  All archive traffic egresses from Cloud Run, so Open Archives sees a single IP
  for every user of the site — and their throttle is documented as **per IP
  address**. The pacing clock is per-process: with one instance it stays globally
  correct no matter how many people are researching, but each additional instance
  adds an independent clock, so N instances hit the archive at up to N x the
  documented rate from one address, risking a **block** rather than merely slow
  research. The deploy script defaults to 1 and warns if raised.
  - The cost is concurrency: simultaneous researchers share the budget, so a
    30-record search slows roughly in proportion to the number of active users.
  - To scale out safely, the limiter and cache must move to shared storage
    (e.g. Redis) so the rate is enforced across instances rather than per
    process. Until then, leave the ceiling at 1.
  - Their docs invite a request to raise the per-IP limit. Worth asking, now
    that we identify ourselves — see below.
- Cold starts discard those caches entirely.

## ⚠️ Unverified
- **The Firebase path has never executed.** Google sign-in, the Firestore mirror, `onSnapshot` merges and cloud deletion are all written but untested — there is no project to run them against. What *is* verified: the merge rules (10 unit tests), and that the app runs correctly local-only with Firebase unconfigured. Exercise sign-in, a two-device sync, and delete-all against a real project before trusting it.
- ~~**Multi-device conflict handling is last-writer-wins per session.**~~ Fixed by
  the per-message schema: concurrent edits write different documents, so they
  merge instead of overwriting. Still worth exercising on two real devices.

## 🐞 Known Issues / Tech Debt
- [ ] **Resume across a dropped turn**: quota pauses are now absorbed in-process, but if the wait budget is exhausted the turn still unwinds and `current_history` is lost, so Retry re-runs the research from scratch. Needs a resume token: stash `current_history` + `turn_count` + `seen_queries` server-side (or return them to the client), and accept it back on the next request. Requires an API contract change.
- [x] **Archival pacing corrected against the published limit.** Open Archives
  documents 4 req/s per IP; we had been pacing at 2 req/s from an empirical
  guess, i.e. half the allowance. Now ~3.3 req/s, keeping headroom because the
  clock stamps when a request is *issued* and jitter can bunch arrivals. A
  30-record search drops from ~15s to ~9s.
- [x] **We now identify ourselves.** Their docs ask for "a descriptive
  user-agent (with project url or e-mail) ... so we can contact you in case of
  curiousity or problems", and we were sending httpx's default — anonymous.
  Requests now carry `LineageNexus/0.1 (+https://lineage.nexus)`, with an
  optional contact address via `OPENARCH_CONTACT`. This is what makes a courtesy
  email possible instead of a silent block.
- [ ] **Ask Open Archives to raise the per-IP limit.** Their docs invite it
  ("contact Open Archives to increase this value"). A single Cloud Run egress IP
  serving many researchers is exactly the case worth explaining, and it is far
  cheaper than re-architecting. Do this before considering the browser-routing
  option or the self-hosted OCI mirror plan ([`docs/self_hosted_archive_plan.md`](file:///c:/Users/pflam/StudioProjects/lineage-nexus/docs/self_hosted_archive_plan.md)).
- [ ] **Persist the record cache.** Currently an in-process LRU, lost on every
  cold start. Their responses are already cached server-side for a day and carry
  `max-age`, so a shared cache mostly avoids re-asking for what we have seen.
- [ ] **Optional: route archive fetches through the user's browser.** Viable —
  the API sends `Access-Control-Allow-Origin: *`, allows `GET, OPTIONS`, and
  needs no credentials for search/show, and the throttle being per-IP means each
  user would spend their own budget rather than a shared one. Costs: the tool
  loop is server-side and synchronous, so it would need inverting over a
  WebSocket (SSE cannot carry results back); and it forfeits the shared cache,
  which for a tool where users cluster on the same parishes and registries could
  mean *more* total load on the archive, not less. Ask them first.
- [ ] **`model` is hardcoded**: the frontend always sends `gemini-flash-latest`; `ChatRequest` defaults to `gemini-flash-lite-latest`. Neither is user-selectable.
- [ ] **No test coverage** on the cloud backend. The archived `archived/adk-app/test/` suite covers the old API clients only.
- [ ] **WikiTree tool surface**: `get_person` and `get_relatives` are exposed to the model but undocumented in `WIKITREE_INSTRUCTIONS`, which still describes the legacy `get_person_info` / `get_relatives_info` names.
- [ ] **Archived `archived/adk-app/` cannot be imported**: modules import `adk_app.*` while the directory is `archived/adk-app`. Reference-only; needs a rename or path shim if it is ever run again.

## ✅ Completed Milestones
- [x] **Opt-in Cross-Device Sync**: Google sign-in via Firebase Auth replaces the simulated boolean login. Sync is off until the user accepts a consent dialog shown once per account, which states how many existing sessions will be uploaded. localStorage remains the working copy and Firestore mirrors it, so the app is unchanged offline or with no project configured. Users can delete individual conversations (removed locally and in the cloud) or erase everything from Settings behind a confirmation. `firestore.rules` restricts every document to its owner and validates session shape. The Gemini API key is deliberately never synced.
- [x] **Quota Pauses Instead of Restarts**: a 429 no longer unwinds the research turn. `generate_with_quota_retry` parses the server's advised `retryDelay` and waits in place, so the accumulated tool calls and results stay in memory and the turn genuinely continues — previously every archive lookup was re-run and every record re-sent as input tokens.
- [x] **Theme Toggle**: light / dark / system, driven by `data-theme` and resolved pre-paint in `index.html` so the stored preference never flashes. Replaces the `prefers-color-scheme`-only styling, which a user could not override.
- [x] **Brand Theme from the Logo**: navy/blue/gold palette sampled from `logo.svg`, with per-mode role assignment for contrast, gold reserved for the wikitext biography artefact, and a serif/sans split between agent prose and UI chrome. Also defined `--color-card`/`--color-muted`/`--color-accent-primary`, which were referenced throughout the components but never existed, leaving most secondary surfaces transparent.
- [x] **Frontend Defect Sweep**: fixed an undefined `navigate` (crashed sign-in and hero search), a stale-closure bug that silently discarded the first exchange and generated title of every new session, and the unused/mismatched API-key storage key.
- [x] **Deployable Frontend Config**: backend URL moved from a hardcoded `localhost:8081` into `src/config.js` / `VITE_API_BASE_URL` (see `.env.example`).
- [x] **Complete Archival Retrieval**: OpenArchieven enforces a global per-second rate limit; unpaced parallel fetches were silently dropping ~2/3 of records, which could make the orchestrator conclude a record did not exist. Requests are now paced process-wide with `Retry-After` handling, and any shortfall is reported to the user instead of hidden.
- [x] **Backend Hardening**: bounded LRU record cache, corrected CORS credentials, configurable `ALLOWED_ORIGINS`, and dead-code removal.
- [x] **Kill-Switch Preserves State**: stopping the agent now keeps the research log as a reviewable artifact rather than discarding it.
- [x] **Lint Clean**: `pnpm lint` passes with zero errors; `ignoreRestSiblings` added so prop-stripping destructures don't false-positive.
- [x] **Session Title Generation**: the orchestrator generates a 2–5 word title and streams it as a `{title}` SSE frame.
- [x] **Disciplined Orchestrator**: implemented strict turn limits, search de-duplication, and "BCE Hallucination" guardrails.
- [x] **Persistent Research Logs**: transformed transient "thoughts" into readable artifacts using SSE buffer retention.
- [x] **Interrupt-Driven UI**: added a "Stop Agent" kill-switch using `AbortController` and pulse-animated input states.
- [x] **GFM Table Support**: integrated `remark-gfm` to ensure complex genealogical family structures are professional and legible.
- [x] **WikiTree API Compliance**: satisfied the mandatory `appId` requirement and improved communicative status reporting.
- [x] **Session Management**: fully implemented session history deletion and state synchronization.
- [x] **"Modern Heritage" Design**: scaffolded React/Vite app with parchment/slate aesthetic.

# Appendix, ignore and do not remove

START PROMPT ONLY, IGNORE:

> First read @AGENTS.md and @README.md for context. Then take a look at @TODO.md. Identify the best task or tasks to work on next. Do not attempt to do everything at once, as you must confirm with me what your plans are and await my confirmation before proceeding with a next set of tasks.

COMPLETION PROMPT ONLY, IGNORE

> We have concluded all our tasks for this session. To wrap up, please update @AGENTS.md and README.md with any relevant documentation. Update @TODO.md by marking any finished tasks as completed, tidying it up to reduce the amount of noise regarding past tasks and taking care to add any new, unfinished tasks that should performed in the next session. Keep the documentation succinct and organized.

--- End of ignore ---
