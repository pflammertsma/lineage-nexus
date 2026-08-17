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
- [ ] ⚠️ **Check the active gcloud project.** `pnpm deploy` targets whatever
  `gcloud config get-value project` returns and will silently deploy into an
  unrelated project:
  ```bash
  gcloud config get-value project   # verify BEFORE deploying
  gcloud config set project <your-gcp-project-id>
  ```
- [ ] Add a guard to the `deploy` script so it refuses to run unless the active
  project matches an expected value. The check above is easy to forget; the
  script should not be foot-gun-shaped.
- [ ] Set a **billing budget + alert** on the project. The API is
  `--allow-unauthenticated` with long-lived SSE turns; Gemini spend is on the
  caller (BYOK) but Cloud Run CPU and egress are on you.
- [ ] Decide `--max-instances` before first deploy (see Operational caveats).

### Prerequisites
- One Google Cloud project for the app, with **Firebase added to that same project**, so Cloud Run, Auth and Firestore share a project and billing account.
- `gcloud` and `firebase` CLIs installed and authenticated.

### 1. Firebase console (one-time, manual)
- [ ] Add Firebase to the GCP project.
- [ ] **Authentication → Sign-in method**: enable the **Google** provider.
- [ ] **Authentication → Settings → Authorized domains**: add the production domain (and any preview domains). Sign-in fails on unlisted domains.
- [ ] **Firestore**: create the database, in a region close to users.

### 2. Backend → Cloud Run
```bash
gcloud config set project <your-gcp-project-id>
pnpm deploy
```
- [ ] First run prompts to enable the Cloud Run and Cloud Build APIs.
- [ ] Note the service URL it prints — it becomes `VITE_API_BASE_URL`.
- [ ] Lock down CORS (it defaults to `*`) and raise the request timeout, because SSE research turns are long-lived:
  ```bash
  gcloud run services update lineage-nexus-api --region <region> \
    --set-env-vars ALLOWED_ORIGINS=https://<your-domain> --timeout=900
  ```
  The default 300s timeout is not enough: a turn can span several paced archive
  searches (~15s each) plus quota waits (~47s each), and the connection must stay
  open throughout or the stream is cut mid-research.
- No secrets are needed on the service — BYOK means the Gemini key arrives per-request from the browser.
- [ ] Set `--max-instances` in the same command. Combined with a 900s timeout and
  open access, an unbounded instance ceiling is the main cost risk.

### 3. Frontend config
- [ ] Copy `apps/web-frontend/.env.example` to `.env` and fill in `VITE_API_BASE_URL` (the Cloud Run URL) plus the `VITE_FIREBASE_*` values from **Project settings → Your apps**.
- These are compiled into the bundle at build time, so changing them requires a rebuild. That is expected: Firebase web config is a public client identifier, and `firestore.rules` is what actually enforces access.
- [ ] ⚠️ **Add a build-time guard.** Both fallbacks fail silently and are unsafe
  in production:
  - Unset `VITE_FIREBASE_*` → `isFirebaseConfigured === false` → `useAuth.js`
    falls back to the **simulated login**, so "Sign in with Google" merely sets a
    localStorage boolean and shows the visitor as "Researcher". Shipping that
    publicly is worse than having no sign-in at all.
  - Unset `VITE_API_BASE_URL` → the bundle calls `http://localhost:8081`, i.e.
    the visitor's own machine, blocked as mixed content over HTTPS.
  A production build should **fail loudly** rather than emit either.

### 4. Firestore rules
```bash
firebase deploy --only firestore:rules
```
- [ ] Required. Until this runs, default rules deny every read and write, and sync fails silently.

### 5. Frontend hosting — still to be scaffolded
- [ ] No `firebase.json` or `.firebaserc` exists yet; this is the main outstanding gap. Firebase Hosting is the natural fit (same project, custom domain, SPA rewrites).
- [ ] Needs a hosting config pointing at `apps/web-frontend/dist`, a rewrite of all routes to `/index.html` (the app uses client-side routing, so deep links 404 without it), and a `deploy:web` script.
- [ ] Decide how the project ID is stored. `.firebaserc` normally holds it
  literally; since the repo is public, either gitignore it or pass `--project`
  from an environment variable.

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

### 7. UI optimization (mobile + desktop)

The layout was built desktop-first at one window size and does not currently
hold up at either end of the range.

**Mobile — the sidebar must become an overlay**
- [ ] Today `Sidebar` is `w-64` inside a flex row, so on a 375px viewport it eats
  256px and leaves ~119px for the chat. The research trail degrades to roughly
  one character per line.
- [ ] Convert it to an overlay drawer below `md`: fixed, full height, slid out by
  default, over the chat rather than beside it.
- [ ] Dismiss on tap outside (backdrop), on Escape, and on selecting a session.
- [ ] Add a hamburger toggle to `Header`, shown only on `/chat`.
- [ ] Lock body scroll while the drawer is open.
- [ ] Keep it a plain flex child at `md` and up — no behaviour change on desktop.
- [ ] Fix `Sidebar`'s `h-screen`: its parent is `h-[calc(100vh-70px)]`, so the
  sidebar is 70px taller than the row that contains it.
- [ ] Switch `100vh` to `100dvh` so mobile browser chrome doesn't clip the input.
- [ ] The per-session delete button is `opacity-0` until `group-hover`, which is
  unreachable on touch. Make it always visible below `md`.
- [ ] Audit tap targets to ~44px minimum.
- [ ] `ResearchTrail`: rows use `ml-auto` for the result column and `break-all`
  for the detail. Wrap the row and drop the auto margin on narrow widths, and
  prefer `break-words` so queries break at spaces rather than mid-word.
- [ ] Check the floating input overlay (`right-4`, `max-w-[800px] px-4`) and the
  scroll-to-bottom button (`bottom-[200px] right-8`) at 375px.
- [ ] Add safe-area insets for notched devices.

**Desktop — the weighting is off**
- [ ] **Two different centring axes.** `Header` uses `.container`
  (`max-w-[1100px] mx-auto`) centred on the full viewport, while `ChatInterface`
  uses `.container` capped to 800px centred inside `main`, which is the viewport
  minus the 256px sidebar. The wordmark and the chat column therefore sit on
  different centre lines. Pick one axis and use it for both.
- [ ] On a wide window the 800px column leaves very large empty gutters. Consider
  capping the whole app shell, or offsetting the reading column from the sidebar
  instead of centring it in the leftover space.
- [ ] The bottom spacer (`h-[280px]`) and scroll button offset (`bottom-[200px]`)
  are magic numbers tied to the input's height. Derive them from one token so
  they cannot drift apart.
- [ ] Re-check vertical rhythm between message blocks, the wikitext card, and the
  research trail once the horizontal weighting is settled.

**Both**
- [ ] Verify at 375, 768, 1280, and 2560px wide, in light and dark.
- [ ] Confirm the page body never scrolls horizontally; wide wikitext must scroll
  inside its own container.

### 8. Legal & trust
- [ ] Write a privacy policy and serve it at a real route. `Header.jsx` currently
  links "Privacy" to `#about`, which does not exist.
- [ ] Required because: the Google OAuth consent screen wants a privacy policy
  URL; account data and research records are stored in Firestore for EU users;
  and visitors hand over a Gemini API key that transits the backend.
- [ ] State explicitly that the API key is used per-request and never stored
  server-side, and that research sessions sync only after opt-in.
- [ ] Add terms of use, and a note on the provenance of archival data
  (OpenArchieven, WikiTree) and their attribution requirements.
- [ ] Document how to delete data — the controls exist in Settings, but nothing
  tells the user they do.

### 9. Onboarding & abuse
- [ ] **BYOK has no onboarding.** A visitor's first query pops the settings modal
  with no prior explanation. Explain the key requirement on the landing page and
  link to where a key is obtained.
- [ ] Rate-limit `/api/v1/chat`, or require a Firebase ID token. Unauthenticated
  and unmetered, it is an open proxy to WikiTree and OpenArchieven from your
  Cloud Run IP, which risks getting `appId=LineageNexus` blocked.
- [ ] Cap `ChatRequest.history` length and request body size — both are unbounded.
- [ ] Remove the SSE `console.log` calls in `App.jsx` (~lines 245, 252); they dump
  research content to the browser console in production.

### 10. Observability & polish
- [ ] Add error monitoring. Nothing currently reports that the site is broken.
- [ ] Firestore documents cap at 1 MiB and `messages` is unbounded, so long
  sessions will eventually fail to sync — and `useSyncedSessions` swallows the
  failure into `syncState: 'error'`. Trim, chunk, or surface it properly.
- [ ] Bundle is 1.0 MB (302 kB gzip) in a single chunk, mostly Firebase.
  Lazy-load `firebase/firestore` behind sign-in.
- [ ] Add Open Graph / Twitter card tags, a canonical URL, and `robots.txt`;
  shared links currently render a blank card.
- [ ] Remove `http://localhost:*/*` from the extension's `host_permissions`
  before any Chrome Web Store submission.

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
