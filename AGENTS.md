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

The next-generation platform utilizes a **Unified Research Orchestrator** powered by Gemini 2.0. While the legacy ADK version used distinct file-based agents, the new cloud-native version uses **Dynamic Role Delegation**:

- **Unified Intelligence**: A single `ResearchOrchestrator` handles the entire research loop, maintaining deep context across multiple tool-calling turns.
- **Prompt-Based Specialization**: Action buttons in the UI (Research, Biography, Fetch) inject specialized instructions that steer the model into specific personas (Researcher vs. Formatter).
- **Function Calling**: The orchestrator has native access to the `OpenArchieven` toolset, allowing it to perform autonomous searches, analyze results, and reformulate queries in real-time.
- **SSE Streaming**: Progress is streamed via Server-Sent Events (SSE), providing a live "Research Log" of the agent's internal reasoning and tool execution.

### Next Steps for Multi-Agency
As we move towards production, we will evolve this into a true multi-agent system by:
1.  **Tool Partitioning**: Moving WikiTree and Archival tools into isolated "Skill" sets.
2.  **Stateful Memory**: Transitioning from `localStorage` to a centralized session database.
3.  **Authentication**: Integrating Firebase Auth to manage cross-device research profiles.
