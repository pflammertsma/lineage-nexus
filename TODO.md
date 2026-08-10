# Lineage Nexus Development Roadmap

## 🎯 Current Priorities (Next Session)
- [ ] **Activate sync**: create the Firebase project, enable the Google auth provider, fill `apps/web-frontend/.env` from `.env.example`, and `firebase deploy --only firestore:rules`. The code is in place but has never run against a live project — see "Unverified" below.
- [ ] **Relationship graph**: generate a relationship graph component to show the relationships between the people in the conversation.
- [ ] **Holocaust Records**: implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM). Legacy prompts and API clients are in `adk-app/agent/holocaust.py` and `adk-app/api/` for reference.
- [ ] **Wikitext Wizard**: refine 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).
- [ ] **Dynamic Resource Tuning**: add a UI slider to adjust `MAX_SEARCH_PER_TURN` for advanced research sessions.
- [ ] **Auto-Focus Logic**: improve the `SYSTEM_INSTRUCTION` to strictly prioritize reading existing WikiTree context before any archival queries.

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
