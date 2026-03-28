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

## 🚀 Next-Generation Web Platform (Fully Hosted)

We are currently building the next evolution of Lineage Nexus:
- **Frontend**: A modern **React** application (Vite-based) located in `apps/web-frontend`.
  - **Design System**: "Modern Heritage" featuring Parchment/Slate tones and grid-based precision.
  - **Shared UI**: Centralized `index.css` utility system for consistent spacing and dimensions.
- **Hosting**: Deployed via **Docker** to **Google Cloud Run** at [lineage.nexus](https://lineage.nexus).
- **Architecture**:
  - **Stateless Agents**: Migrating ADK logic to a cloud-hosted environment.
  - **Security**: "Bring-Your-Own-Key" model using browser local storage for user AI keys.
  - **Aesthetic**: Premium researcher experience with refined typography and professional layout.
