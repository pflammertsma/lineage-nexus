# <image src="docs/logo.svg" height="24" alt="Lineage Nexus"/> Lineage Nexus

## Background

*Lineage Nexus* (available at [https://lineage.nexus](https://lineage.nexus)) is a genealogical research agent that (in its current form) performs research solely through queries to [OpenArchieven](https://www.openarchieven.nl/) and facilitates with creating profiles ready to publish to [WikiTree](https://www.wikitree.com/).

## Capabilities

Lineage Nexus is a chat-based interface that connects to:
* [Open Archives API](https://www.openarchieven.nl/api/docs/)
* [WikiTree API](https://github.com/wikitree/wikitree-api)

This enables it to understand queries like:
* _`Who was Jan Lammertsma (d. 1847)?`_
* _`Create a WikiTree profile for Jan from this record: https://www.openarchieven.nl/gra:fb3d078b-fd79-feb3-9000-947e38cbc0a3`_
* _`Research the WikiTree profile 'Jans-10027' and amend it with additional information`_

### Features
- **Modern Heritage Design**: A premium research experience with high-fidelity "Parchment & Slate" aesthetics.
- **Disciplined Research Orchestration**: Advanced agent guardrails with turn-throttling to prevent "BCE Hallucination" and redundant archival queries.
- **Persistent Research Logs**: Stateful SSE monitoring that preserves agent "thoughts" even during interruptions or failures.
- **Agent Kill-Switch**: Full user control via `AbortController` to instantly terminate research turns.
- **WikiTree Integration**: Deep-linked profile retrieval and context analysis with official AppId compliance.
- **Bring Your Own Key (BYOK)**: The backend holds no credentials; your Gemini key stays in your browser and is passed per-request.

---

## 🗺️ Repository layout

This is a `pnpm` workspace (`apps/*`) that also contains the deprecated Python implementations.

| Path | What it is |
|---|---|
| `apps/web-frontend/` | **Current UI.** React 19 + Vite 8 + Tailwind v4 SPA. |
| `apps/cloud-backend/` | **Current API.** FastAPI + Gemini SDK research orchestrator. |
| `apps/` (root files) | *Legacy.* Plotly Dash client for the ADK API server. |
| `adk-app/` | *Deprecated.* The original Google ADK multi-agent system. |
| `docs/`, `assets/` | Logos, screenshots and legacy Dash static assets. |

---

## 🛠️ Development

### Web Frontend

```bash
cd apps/web-frontend
pnpm install
pnpm dev
```

Runs on Vite's default port (`5173`). The backend URL is currently **hardcoded** to
`http://localhost:8081` in `src/App.jsx`; see [TODO.md](TODO.md).

### Cloud Backend

```bash
cd apps/cloud-backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Serves on port `8081` locally (`PORT` env var otherwise; Cloud Run defaults to `8080`).

From the repo root, `pnpm dev` and `pnpm backend` are shortcuts for the two commands above,
and `pnpm deploy` pushes the backend to Cloud Run.

### Configuration

The backend stores no API keys. Visit [Google AI Studio](https://aistudio.google.com/app/api-keys)
to get a Gemini key, then paste it into the in-app **API Configuration** dialog. It is kept in
`localStorage` and sent per-request as the `X-Gemini-API-Key` header.

### API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/` | Health/status probe. |
| `POST` | `/api/v1/chat` | Server-Sent Events. Body: `{ message, history[], model }`. Requires the `X-Gemini-API-Key` header. |

The SSE stream emits one JSON object per `data:` frame, in one of four shapes:
`{status}` (progress), `{title}` (generated session title), `{response}` (final answer) or
`{error, retry}`. Frames are right-padded to defeat proxy buffering.

The service is **stateless**: conversation history is round-tripped by the client on every
request and nothing is persisted server-side.

---

## 🪵 Legacy ADK Implementation (Deprecated)

The project began as a local-first **Agent Development Kit (ADK)** research toolkit built on
[Google's ADK](https://google.github.io/adk-docs/), with a hierarchical multi-agent design and a
Plotly Dash front end. Full setup and run instructions are in
**[adk-app/README.md](adk-app/README.md)**; [AGENTS.md](AGENTS.md) covers how it compares to the
current orchestrator.

> **Note:** the legacy code imports itself as `adk_app` while the directory is named `adk-app`.
> It will not run as-is without a rename or path shim.

## License

This project is licensed. See the [LICENSE.md](LICENSE.md) file for details.

## Thanks!

Please feel free to contribute to this project in any way:
* Contributing code and submitting pull requests
* Reporting bugs or feature requests
* General discussion through [our Discord channel](https://discord.gg/qbxpQJPC)

Thanks!

<image src="docs/logo.svg" height="128" alt="Lineage Nexus"/>
