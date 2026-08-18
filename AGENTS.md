# Instructions for AI Agents

This project is transitioning from a local-first ADK implementation to a fully hosted web
platform. Three generations of the same product currently coexist in the repo; read this file
before assuming which one you are working on.

| Layer | Path | Status |
|---|---|---|
| React 19 + Vite SPA | `apps/web-frontend/` | Current |
| FastAPI + Gemini SDK | `apps/cloud-backend/` | Current |
| Plotly Dash UI | `archived/dash-app/` | Archived (client of the ADK API server) |
| Google ADK multi-agent | `archived/adk-app/` | Archived |

## 🧠 Agent Architecture (Cloud Native)

The platform uses a **Unified Research Orchestrator** powered by the Gemini family of models.
Where the legacy ADK version used distinct file-based agents, the cloud-native version uses
**Dynamic Role Simulation**:

- **Unified Intelligence**: a single `ResearchOrchestrator` (`apps/cloud-backend/orchestrator.py`)
  runs the entire research loop as a hand-rolled function-calling loop against the Gemini SDK —
  not an ADK agent and not a `chat` session. It is capped at `MAX_RESEARCH_TURNS = 6`; on
  exhaustion it forces one final tool-less summarisation call.
- **Strict Safeguards**:
  - `MAX_SEARCH_PER_TURN = 2` throttles `open_archives_search` / `search_profiles`.
  - A `get_profile` call in a turn **cancels** all archival searches in that same turn
    (WikiTree context wins).
  - A `seen_queries` set returns a synthetic "redundant query, broaden your search" tool
    response instead of re-hitting the upstream API.
  - Prompt-level "BCE Hallucination" guardrails (never search before 1500 or after the current
    year) and a zero-result protocol that mandates broadening rather than sliding year windows.
- **Modular Instructions**: `SYSTEM_INSTRUCTION` is assembled at import time as
  `ROOT_STRATEGY + OPEN_ARCHIVES_INSTRUCTIONS + WIKITREE_INSTRUCTIONS`, so each tool module owns
  its own skill prompt.
- **Role Simulation**: the Research / Biography / Fetch Profile buttons in `ChatInput.jsx` are
  purely client-side — they prefill the textarea with canned prompts. The only genuine
  delegation left is `format_biography`, a nested tool that makes a **separate** Gemini call at
  temperature 0.4 with the ~400-line Wikitext style guide in `tools/biography.py`.
- **Stateful Research Logs**: `tools/utils.py` keeps a task-id → `asyncio.Queue` registry so
  deeply nested tool code can `report_status()` back to the SSE stream. `orchestrator.chat()`
  runs the research as a background `asyncio.Task` and drains that queue concurrently (with a
  30s heartbeat), so progress streams while the model is still thinking. The frontend
  **persists** those statuses into `currentLogs` and attaches them to error bubbles as an
  "Interrupted Research Log".
- **Session Titles**: after the final answer, the orchestrator makes a second Gemini call to
  generate a 2–5 word title and emits it as a `{title}` SSE frame.
- **Session Termination**: users can instantly stop the agent via an `AbortController`
  kill-switch, which captures the current research state for review.

### Tools

All tools are plain `async` Python functions handed straight to the Gemini SDK:

- `tools/openarchieven.py` — search and record fetch. Sanitises queries (collapses multiple
  `&~&` to `&`, auto-completes open year ranges), caps at 30 results, fetches record detail in
  parallel batches of 10, and flattens the archive's `RelationEP` / `RelationPP` cross-reference
  structure into per-person `RelationType` fields. Holds a process-wide `_SEARCH_CACHE`.
- `tools/wikitree.py` — official `appId=LineageNexus`. `get_profile` is a composite that calls
  `getRelatives` and reshapes parents / spouses / children / siblings into a single object.
- `tools/biography.py` — the Wikitext formatter: category whitelist, template rules,
  `<ref name="...">` citation discipline, and the Lammertsma Name Study special case.

### Backend contract

Stateless and BYOK. `POST /api/v1/chat` returns SSE; the Gemini key arrives per-request in the
`X-Gemini-API-Key` header and a `genai.Client` is constructed per request. Conversation history
is round-tripped by the client on every request — nothing is persisted server-side. Frames are
right-padded to 4096 chars to defeat proxy buffering, and the client strips that padding by
trimming before `JSON.parse`.

### Frontend contract

Nearly all state lives in `App.jsx` — no context, no store. `sessions`, `isLoggedIn`,
`activeSessionId` and the API key persist to `localStorage`. Auth is currently simulated (a
boolean). The SSE stream is read manually via `fetch` + `getReader()` and dispatched on four
payload shapes: `status`, `title`, `response`, `error`.

## ⚠️ Legacy ADK Implementation (Deprecated)

An ADK **hierarchical multi-agent** system — the opposite design from the current one. To
understand it:
- **Core Orchestrator**: [`root_agent.py`](archived/adk-app/root_agent.py) (`gemini-2.5-pro`) delegates via
  ADK's transfer mechanism to four `sub_agents`.
- **Specialized Agents**, in `archived/adk-app/agent/`:
  - `OpenArchievenResearcher` — archival searches (~340 lines of prompt on query syntax,
    patronymics and multi-page paging).
  - `WikiTreeProfileAgent` — WikiTree integration.
  - `WikitreeFormatterAgent` — the ancestor of today's `tools/biography.py`.
  - `HolocaustAgent` — Joods Monument and Oorlogsbronnen. **Never ported** to the cloud backend.
  - Defined but unwired: `RecordCombiner`, `GenerationalFileComparisonAgent`.
- **Key differences from the cloud version**: shared session state via `ToolContext`
  (`current_subject`, `found_records` — see `util/state_util.py`); synchronous rate-limited
  `requests` rather than async `httpx`; a mandatory "transfer back to the orchestrator" protocol
  ending every agent prompt; and extra sources (WieWasWie, ancestors/descendants) that the new
  backend dropped.
- **Interfaces**: `adk web`, or `adk api_server` plus the Plotly Dash client
  (`python archived/dash-app/lineage_app.py`). Note the Dash app is Dash, not Streamlit, despite older docs.

> **Caveat**: every legacy module does `from adk_app...` while the directory is `archived/adk-app`. The
> legacy stack is unrunnable as checked in without a rename or path shim.

### Next Steps for Multi-Agency
As we move towards production, we will evolve this into a true multi-agent system by:
1.  **Tool Partitioning**: Moving WikiTree and Archival tools into isolated "Skill" sets.
2.  **Stateful Memory**: Transitioning from `localStorage` to **Firestore** for centralized
    session database and cross-device sync.
3.  **Authentication**: Integrating **Firebase Auth** to manage research profiles.
