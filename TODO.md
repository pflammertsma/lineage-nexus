# Lineage Nexus Development Roadmap

## 🎯 Current Priorities (Next Session)
- [ ] **Ship to production**: work the Production Readiness Checklist below. Nothing is released yet and the frontend has no hosting target at all.
- [ ] **Relationship graph**: generate a relationship graph component to show the relationships between the people in the conversation.
- [ ] **Holocaust Records**: implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM). Legacy prompts and API clients are in `adk-app/agent/holocaust.py` and `adk-app/api/` for reference.
- [ ] **Wikitext Wizard**: refine 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).
- [ ] **Dynamic Resource Tuning**: add a UI slider to adjust `MAX_SEARCH_PER_TURN` for advanced research sessions.
- [ ] **Auto-Focus Logic**: improve the `SYSTEM_INSTRUCTION` to strictly prioritize reading existing WikiTree context before any archival queries.
- [ ] **Delete Profiles Confirmation**: Add a confirmation dialog before deleting a research profile.
- [ ] **Standardize the Research Suggestion Chips** - All chips below the chat box should use the same styles and be generated using the same code. Currently, the "Holocaust" option incorrectly shows in pink. The size of these chips should be consistent and always on a single line, even on mobile as it scrolls horizontally.

## 🚀 Production Readiness Checklist

Target: publish the web frontend on a custom domain with the API on Cloud Run.
Nothing has ever been deployed. Substitute your own values for every
`<placeholder>` below — nothing here is tied to a particular account or project.

Work the phases in order: 0 and 1 are safety rails, and skipping them is how you
deploy into the wrong project or ship a bundle that silently fakes sign-in.

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
- [x] `--max-instances` decided and wired in — defaults to 2, overridable via
  `LINEAGE_MAX_INSTANCES`.
- [ ] Set a **billing budget + alert** on the project *(console — cannot be done
  from the repo)*. The API is `--allow-unauthenticated` with long-lived SSE
  turns; Gemini spend is on the caller (BYOK) but Cloud Run CPU and egress are
  on you.

### Prerequisites
- One Google Cloud project for the app, with **Firebase added to that same project**, so Cloud Run, Auth and Firestore share a project and billing account.
- `gcloud` and `firebase` CLIs installed and authenticated.
- Copy `.deploy.env.example` to `.deploy.env` and fill it in.

### 1. Firebase console (one-time, manual)
- [ ] Add Firebase to the GCP project.
- [ ] **Authentication → Sign-in method**: enable the **Google** provider.
- [ ] **Authentication → Settings → Authorized domains**: add the production domain (and any preview domains). Sign-in fails on unlisted domains.
- [ ] **Firestore**: create the database, in a region close to users.

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
- [ ] First run prompts to enable the Cloud Run and Cloud Build APIs.
- [ ] Note the service URL it prints — it becomes `VITE_API_BASE_URL`.
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
- [ ] Copy `apps/web-frontend/.env.example` to `.env` and fill in `VITE_API_BASE_URL` (the Cloud Run URL) plus the `VITE_FIREBASE_*` values from **Project settings → Your apps**. *(Blocked on step 1.)*
- These are compiled into the bundle at build time, so changing them requires a rebuild. That is expected: Firebase web config is a public client identifier, and `firestore.rules` is what actually enforces access.

### 4. Firestore rules
```bash
pnpm deploy:rules
```
- [ ] Required. Until this runs, default rules deny every read and write, and sync fails silently.

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
- [ ] Run it. *(Blocked on step 1.)*

### 6. Domain & DNS
- [ ] Point the apex (and `www`, if used) at the chosen host; add both to
  Firebase **Authorized domains** or sign-in fails.
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
- [x] Dismisses on backdrop tap, Escape, choosing a session, and starting a new
  one. Also auto-closes when the viewport crosses the breakpoint, so a resize
  cannot strand the scroll lock on a desktop layout.
- [x] Hamburger toggle added to `Header`, shown only when signed in.
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

**Still to eyeball** *(subjective, or not yet exercised)*
- [ ] Light mode, and 768 / 2560px.
- [ ] Vertical rhythm between message blocks, the wikitext card and the trail.
- [ ] `/privacy` and `/terms` rendering.

### 8. Legal & trust
- [x] `/privacy` and `/terms` added (`components/LegalPage.jsx`) and routed;
  the header's dead `#about` link now points at `/privacy`, and the landing
  footer links both.
- [x] Privacy covers: the API key (browser-local, per-request, never stored,
  never synced), research storage and opt-in sync, what Google sign-in provides,
  the third parties queried, no analytics/ads/training, and a note on the living
  people who appear in genealogical records.
- [x] Deletion documented — per-conversation, delete-everything, and clearing
  site data.
- [x] Terms cover: verify-before-publish (model output can be wrong), that the
  Gemini key and its costs are the user's, fair use of the archives, source
  attribution, availability, and liability.
- [ ] Read them and correct anything that misstates your intent — these are a
  drafted starting point, not legal advice, and they make claims about your
  practices that only you can confirm.

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
- ⚠️ **This does not scale to concurrent users, and that is a launch decision.**
  The OpenArchieven limiter is a process-wide 2 req/s clock shared by everyone on
  the instance, so N simultaneous researchers each get ~2/N req/s — a 30-record
  search goes from ~15s to ~30s with just two users. Scaling out restores speed
  but breaks the global pacing, which reintroduces the silent record-dropping bug
  that pacing was added to fix. Resolve this before advertising the site: either
  move the limiter and cache to shared storage (e.g. Redis), or queue requests.
- Cold starts discard those caches entirely.

## ⚠️ Unverified
- **The Firebase path has never executed.** Google sign-in, the Firestore mirror, `onSnapshot` merges and cloud deletion are all written but untested — there is no project to run them against. What *is* verified: the merge rules (10 unit tests), and that the app runs correctly local-only with Firebase unconfigured. Exercise sign-in, a two-device sync, and delete-all against a real project before trusting it.
- **Multi-device conflict handling is last-writer-wins per session.** Two devices editing the same conversation simultaneously will keep whichever pushed later; there is no message-level merge.

## 🐞 Known Issues / Tech Debt
- [ ] **Resume across a dropped turn**: quota pauses are now absorbed in-process, but if the wait budget is exhausted the turn still unwinds and `current_history` is lost, so Retry re-runs the research from scratch. Needs a resume token: stash `current_history` + `turn_count` + `seen_queries` server-side (or return them to the client), and accept it back on the next request. Requires an API contract change.
- [ ] **Archival latency**: OpenArchieven allows ~2 requests/second, so a 30-record search now takes ~15s. Consider persisting the record cache (currently an in-process LRU, lost on restart) or fetching detail lazily.
- [ ] **`model` is hardcoded**: the frontend always sends `gemini-flash-latest`; `ChatRequest` defaults to `gemini-flash-lite-latest`. Neither is user-selectable.
- [ ] **No test coverage** on the cloud backend. The legacy `adk-app/test/` suite covers the old API clients only.
- [ ] **WikiTree tool surface**: `get_person` and `get_relatives` are exposed to the model but undocumented in `WIKITREE_INSTRUCTIONS`, which still describes the legacy `get_person_info` / `get_relatives_info` names.
- [ ] **Legacy `adk-app/` cannot be imported**: modules import `adk_app.*` while the directory is `adk-app`. Reference-only for now; needs a rename or path shim if it is ever run again.

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
