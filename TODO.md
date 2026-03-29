# Lineage Nexus Development Roadmap

## 🎯 Current Priorities (Next Session)
- [ ] **WikiTree Integration (Phase 2)**: Port the legacy `WikiTreeProfileAgent` tools to the unified cloud backend.
- [ ] **Holocaust Records**: Implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM) to support deeper historical research.
- [ ] **Authentication**: Transition from simulated login to real **Firebase Auth** (Identity Platform).
- [ ] **Cloud Persistence**: Migrate `localStorage` sessions to **Firestore** to enable cross-device research syncing.
- [ ] **Wikitext Wizard**: refine the 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).

## ✅ Completed Milestones
- [x] **"Modern Heritage" Design**: implemented the parchment/slate aesthetic across the entire React workbench.
- [x] **Real-time Research Logs**: hooked up SSE streaming so the agent's internal tool-calling turns appear live in the UI.
- [x] **Unified Orchestrator**: Migrated from local ADK agents to a cloud-native FastAPI logic with Gemini Flash/Pro support.
- [x] **Branding & Identity**: replaced "Orchestrator" with **Lineage Nexus** and established the branching network theme.
- [x] **Smart Scroll & UX**: implemented auto-scrolling, gradient masking, and document-style report layouts.
- [x] **Session Persistence (L1)**: implemented robust `localStorage` for messages and session history.
- [x] **Automated Actions**: ported Researcher, Formatter, and Profile Fetch prompts to quick-action buttons.
- [x] **Functional Migration**: Replaced the Python ADK framework with a bespoke, stateless integration using the Gemini API directly. (2026-03-28)
- [x] **Search Implementation**: Wired up the "Hero" search input in the Vite frontend to trigger actual archival queries via the new FastAPI backend. (2026-03-28)

- [ ] **Deployment**: Prepare the `Dockerfile` and Cloud Run configurations for the final rollout to [lineage.nexus](https://lineage.nexus).

## ✅ Completed Tasks

- [x] **Project Rebranding**: Renamed project to Lineage Nexus and updated all docs. (2026-03-28)
- [x] **Web Frontend Initialization**: Scaffolded React/Vite app with pnpm. (2026-03-28)
- [x] **Design System Implementation**: Built "Modern Heritage" utility system in `index.css`. (2026-03-28)
- [x] **Core Components**: Implemented Header, Hero, FeatureGrid, and ApiKeyModal with unified styling. (2026-03-28)
- [x] **Asset Integration**: Moved logo to standardized asset path and refined brand presence. (2026-03-28)
- [x] **TODO File Creation**: (2026-03-28)

# Appendix, ignore and do not remove

START PROMPT ONLY, IGNORE:

> First read @AGENTS.md and @README.md for context. Then take a look at @TODO.md. Identify the best task or tasks to work on next. Do not attempt to do everything at once, as you must confirm with me what your plans are and await my confirmation before proceeding with a next set of tasks.

COMPLETION PROMPT ONLY, IGNORE

> We have concluded all our tasks for this session. To wrap up, please update @AGENTS.md and README.md with any relevant documentation. Update @TODO.md by marking any finished tasks as completed, tidying it up to reduce the amount of noise regarding past tasks and taking care to add any new, unfinished tasks that should performed in the next session. Keep the documentation succinct and organized.

--- End of ignore ---