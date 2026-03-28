# TODOs

Instructions:

- Update AFTER finishing a task. Always read the file first as it may have changed in the meantime. Then mark the task as completed, providing the completion date in parentheses.
- ONLY focus on one task at a time, asking for feedback before proceeding with another. NEVER attempt to work through the entire list.

## 🚀 Active Tasks

- [ ] **Functional Migration**: Replace the Python ADK framework with a bespoke, stateless integration using the Gemini API directly (`google-genai`) to ensure total ownership and Bring-Your-Own-Key compatibility. Use a recent model, depending on the application needs: `gemini-flash-lite-latest`, `gemini-flash-latest` or `gemini-pro-latest`.
  - [ ] **1. Architecture & Scaffold:** Scaffold a Python FastAPI application in `apps/cloud-backend`.
  - [ ] **2. API Integration:** Implement direct `google-genai` client initializations that dynamically accept the user's `GOOGLE_API_KEY` per request via headers.
  - [ ] **3. Tool Refactoring:** Port the existing business logic functions (OpenArchieven searches, WikiTree API) into standalone Python functions that Gemini tool calling can natively invoke without ADK wrappers.
  - [ ] **4. Orchestration:** Build a custom, stateless chat router that handles multi-agent tool delegation and context manually.
  - [ ] **5. Containerization:** Create a `Dockerfile` for the API, mapping routing to the container environment's `PORT` for GCP Cloud Run support.
- [ ] **Search Implementation**: Wire up the "Hero" search input in the Vite frontend to trigger actual archival queries via the new backend.
- [ ] **UI/UX Refinement**: Continue polishing the "Modern Heritage" design, focusing on header responsiveness and better interactive feedback.
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