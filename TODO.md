# Lineage Nexus Development Roadmap

## 🎯 Current Priorities (Next Session)
- [ ] **Relationship graph**: generate a relationship graph component to show the relationships between the people in the conversation.
- [ ] **Firebase Auth Integration**: transition from simulated login to real **Firebase Identity Platform**. Sign-in is currently a boolean in `localStorage`; `Sidebar.jsx` also hardcodes the user's name and plan.
- [ ] **Cloud Persistence (L2)**: migrate `localStorage` to **Firestore** for Cross-Device Session Sync.
- [ ] **Holocaust Records**: implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM). Legacy prompts and API clients are in `adk-app/agent/holocaust.py` and `adk-app/api/` for reference.
- [ ] **Wikitext Wizard**: refine 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).
- [ ] **Dynamic Resource Tuning**: add a UI slider to adjust `MAX_SEARCH_PER_TURN` for advanced research sessions.
- [ ] **Auto-Focus Logic**: improve the `SYSTEM_INSTRUCTION` to strictly prioritize reading existing WikiTree context before any archival queries.

## 🐞 Known Issues / Tech Debt
- [ ] **Archival latency**: OpenArchieven allows ~2 requests/second, so a 30-record search now takes ~15s. Consider persisting the record cache (currently an in-process LRU, lost on restart) or fetching detail lazily.
- [ ] **`model` is hardcoded**: the frontend always sends `gemini-flash-latest`; `ChatRequest` defaults to `gemini-flash-lite-latest`. Neither is user-selectable.
- [ ] **No test coverage** on the cloud backend. The legacy `adk-app/test/` suite covers the old API clients only.
- [ ] **WikiTree tool surface**: `get_person` and `get_relatives` are exposed to the model but undocumented in `WIKITREE_INSTRUCTIONS`, which still describes the legacy `get_person_info` / `get_relatives_info` names.
- [ ] **Legacy `adk-app/` cannot be imported**: modules import `adk_app.*` while the directory is `adk-app`. Reference-only for now; needs a rename or path shim if it is ever run again.

## ✅ Completed Milestones
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
