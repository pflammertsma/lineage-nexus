# Instructions for AI Agents

This project is transitioning from a local-first ADK implementation to a fully hosted web platform.

## ⚠️ Current ADK Implementation (Deprecated)

The current system is an **ADK Multi-Agent System** designed for local execution. To understand this implementation:
- **Core Orchestrator**: Read [`root_agent.py`](adk-app/root_agent.py) to see how research tasks are delegated.
- **Specialized Agents**: Located in `adk-app/agent/`, including:
  - `OpenArchievenResearcher`: For archival searches.
  - `WikiTreeProfileAgent`: For WikiTree integration.
  - `HolocaustAgent`: For Holocaust-related records.
- **Framework**: Built using [Google's ADK](https://google.github.io/adk-docs/).
- **Interfaces**: Accessible via `adk web` (default) or `python apps/lineage_app.py` (Streamlit).

## 🧠 Agent Architecture (Cloud Native)

The next-generation platform utilizes a **Unified Research Orchestrator** powered by the Gemini family of models. While the legacy ADK version used distinct file-based agents, the new cloud-native version uses **Dynamic Role Simulation**:

- **Unified Intelligence**: A single `ResearchOrchestrator` handles the entire research loop, enforcing **Strict Safeguards** (MAX_SEARCH_PER_TURN = 2) to prevent excessive archival queries and "BCE Hallucination" guardrails for chronological accuracy.
- **Role Simulation**: Action buttons in the UI (Research, Biography, Fetch) inject specialized instructions that simulate distinct expert personas (Researcher vs. Formatter) within a single orchestration sequence.
- **Function Calling**: The orchestrator has native access to `OpenArchieven` and `WikiTree` (via `LineageNexus` AppId), allowing it to perform autonomous searches, analyze results, and reformulate queries in real-time.
- **Stateful Research Logs**: Progress is streamed via Server-Sent Events (SSE). Unlike transient UI labels, these logs are now **Persisted** in the frontend, transforming agent "thoughts" into permanent research artifacts even if the task is interrupted.
- **Session Termination**: Users can instantly stop the agent via an `AbortController` kill-switch, which captures the current research state for review.

### Next Steps for Multi-Agency
As we move towards production, we will evolve this into a true multi-agent system by:
1.  **Tool Partitioning**: Moving WikiTree and Archival tools into isolated "Skill" sets.
2.  **Stateful Memory**: Transitioning from `localStorage` to **Firestore** for centralized session database and cross-device sync.
3.  **Authentication**: Integrating **Firebase Auth** to manage research profiles.
