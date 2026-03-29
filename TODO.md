# Lineage Nexus Development Roadmap

## 🎯 Current Priorities (Next Session)
- [ ] **Chat title**: generate a title for the chat based on the current conversation and update the chat title periodically in the UI.
- [ ] **Relationship graph**: generate a relationship graph component to show the relationships between the people in the conversation.
- [ ] **Firebase Auth Integration**: transition from simulated login to real **Firebase Identity Platform**.
- [ ] **Cloud Persistence (L2)**: migrate `localStorage` to **Firestore** for Cross-Device Session Sync.
- [ ] **Holocaust Records**: implement the `HolocaustAgent` toolset (ITS/Arolsen Archives, USHMM).
- [ ] **Wikitext Wizard**: refine 'Biography' output to include specific WikiTree citation templates (e.g., `<ref>` tags).
- [ ] **Dynamic Resource Tuning**: add a UI slider to adjust `MAX_SEARCH_PER_TURN` for advanced research sessions.
- [ ] **Auto-Focus Logic**: improve the `SYSTEM_INSTRUCTION` to strictly prioritize reading existing WikiTree context before any archival queries.

## ✅ Completed Milestones
- [x] **Disciplined Orchestrator**: implemented strict turn limits, search de-duplication, and "BCE Hallucination" guardrails.
- [x] **Persistent Research Logs**: transformed transient "thoughts" into readable artifacts using SSE buffer retention.
- [x] **Interrupt-Driven UI**: added a "Stop Agent" kill-switch using `AbortController` and pulse-animated input states.
- [x] **GFM Table Support**: integrated `remark-gfm` to ensure complex genealogical family structures are professional and legible.
- [x] **WikiTree API Compliance**: satisfied the mandatory `appId` requirement and improved communicative status reporting.
- [x] **Session Management**: fully implemented session history deletion and state synchronization.
- [x] **UX & Legibility**: resolved high-contrast legibility issues for links in user bubbles and error messages.
- [x] **"Modern Heritage" Design**: scaffolded React/Vite app with parchment/slate aesthetic.
- [x] **Real-time Research Logs**: hooked up SSE streaming for live tool-calling turns.
- [x] **Branding & Identity**: established the **Lineage Nexus** branching network theme and official logo assets.
- [x] **Smart Scroll & UX**: implemented auto-scrolling, gradient masking, and document-style reports.

# Appendix, ignore and do not remove

START PROMPT ONLY, IGNORE:

> First read @AGENTS.md and @README.md for context. Then take a look at @TODO.md. Identify the best task or tasks to work on next. Do not attempt to do everything at once, as you must confirm with me what your plans are and await my confirmation before proceeding with a next set of tasks.

COMPLETION PROMPT ONLY, IGNORE

> We have concluded all our tasks for this session. To wrap up, please update @AGENTS.md and README.md with any relevant documentation. Update @TODO.md by marking any finished tasks as completed, tidying it up to reduce the amount of noise regarding past tasks and taking care to add any new, unfinished tasks that should performed in the next session. Keep the documentation succinct and organized.

--- End of ignore ---