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
- **Bring Your Own Key (BYOK)**: the backend holds no credentials. Your Gemini key stays in your browser, is sent per request, and is never stored or logged.
- **Disciplined research orchestration**: turn limits, search de-duplication and paced archival queries that stay inside Open Archives' published rate limit.
- **Research trail**: every reply can be expanded to show which profiles were read and which searches were run, including the ones that returned nothing.
- **Sourced WikiTree biographies**: generated wikitext with citations, plus a browser extension that fills the profile form for you to review.
- **Optional cross-device sync**: off until you sign in *and* opt in. Research otherwise stays in your browser, and you can delete a conversation or everything.
- **AI transparency**: generated biographies carry a machine-readable AI-generation marker, per Article 50 of the EU AI Act. See [/ai-transparency](https://lineage.nexus/ai-transparency).
- **Agent kill-switch**: stop a research turn at any point via `AbortController`, keeping the log as a reviewable artefact.
- **Light and dark themes**, resolved before first paint so a stored preference never flashes.

---

## 🗺️ Repository layout

This is a `pnpm` workspace (`apps/*`) that also contains the deprecated Python implementations.

| Path | What it is |
|---|---|
| `apps/web-frontend/` | **Current UI.** React 19 + Vite 8 + Tailwind v4 SPA. |
| `apps/cloud-backend/` | **Current API.** FastAPI + Gemini SDK research orchestrator. |
| `archived/` | *Archived.* Superseded implementations, kept for reference: the Google ADK multi-agent system and the Plotly Dash client. |
| `apps/wikitree-extension/` | **Chrome extension.** Fills WikiTree profile forms from generated biographies. |
| `scripts/` | Deployment driver (`deploy.mjs`) with the wrong-project guard. |
| `docs/` | Logos and screenshots. |

---

## 🛠️ Development

### Web Frontend

```bash
cd apps/web-frontend
pnpm install
pnpm dev
```

Runs on Vite's default port (`5173`), and talks to `http://localhost:8081` unless
`VITE_API_BASE_URL` says otherwise.

Copy `.env.example` to `.env` to configure it. Every integration is optional and inert
when unset — an unconfigured checkout runs local-only, with research stored in the
browser:

| Variable | Effect when unset |
|---|---|
| `VITE_API_BASE_URL` | Falls back to `http://localhost:8081`. |
| `VITE_FIREBASE_*` | No sign-in or sync; a clearly-labelled simulated login is used locally. |
| `VITE_GA_MEASUREMENT_ID` | No analytics; the script is never fetched. |
| `VITE_SENTRY_DSN` | No error monitoring. |

A **production** build refuses to start if `VITE_API_BASE_URL` or the `VITE_FIREBASE_*`
values are missing, because both fall back to something unsafe to publish — the API URL
to the visitor's own machine, and sign-in to the simulated login. Override deliberately
with `VITE_ALLOW_INCOMPLETE_CONFIG=true`.

### Cloud Backend

```bash
cd apps/cloud-backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Serves on port `8081` locally (`PORT` env var otherwise; Cloud Run defaults to `8080`).

From the repo root, `pnpm dev` and `pnpm backend` are shortcuts for the two commands above.
Deployment is covered in [its own section](#-deployment).

### Configuration

The backend stores no API keys. Visit [Google AI Studio](https://aistudio.google.com/app/api-keys)
to get a Gemini key, then paste it into the in-app **API Configuration** dialog. It is kept in
`localStorage` and sent per-request as the `X-Gemini-API-Key` header.

### API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/` | Health/status probe. |
| `POST` | `/api/v1/validate-key` | Checks a Gemini key. Body: `{ apiKey }`. |
| `POST` | `/api/v1/chat` | Server-Sent Events. Body: `{ message, history[], model }`. Requires the `X-Gemini-API-Key` header. |

`/api/v1/chat` is rate limited to 20 requests per 5 minutes per key (hashed, never stored),
caps the request body at 1 MB, and trims history to the most recent 60 messages / 400k
characters rather than rejecting an oversized one.

The SSE stream emits one JSON object per `data:` frame, in one of four shapes:
`{status}` (progress), `{title}` (generated session title), `{response, steps[]}` (final
answer plus the trail of tool calls made to produce it) or `{error, retry}`. Frames are
right-padded to defeat proxy buffering.

The service is **stateless**: conversation history is round-tripped by the client on every
request and nothing is persisted server-side.

---

## 🚀 Deployment

The site runs on Firebase Hosting with the API on Cloud Run, both in one Google Cloud
project. `TODO.md` holds the full first-time checklist, including the console steps;
this is the day-to-day version.

### One-time setup

1. Add Firebase to your Google Cloud project, then in the Firebase console enable the
   **Google** sign-in provider, add your domain under **Authorized domains**, and create a
   **Firestore** database.
2. Register a **Web app** (Project settings → Your apps). The `VITE_FIREBASE_*` values do
   not exist until you do — this is the step that is easy to miss.
3. Copy `.deploy.env.example` to `.deploy.env` (gitignored) and fill it in:

   ```bash
   LINEAGE_GCP_PROJECT=your-project-id
   LINEAGE_REGION=europe-west4
   LINEAGE_ALLOWED_ORIGINS=https://your-domain,https://your-project.web.app
   LINEAGE_MAX_INSTANCES=1
   ```

4. Fill `apps/web-frontend/.env`. The Firebase values can be pulled rather than copied:

   ```bash
   firebase apps:sdkconfig WEB --project your-project-id
   ```

### Deploying

```bash
pnpm deploy:api      # backend  -> Cloud Run
pnpm deploy:rules    # firestore.rules
pnpm deploy:web      # frontend -> Firebase Hosting
pnpm deploy          # all three: rules, then api, then web
```

Every command **refuses to run unless the active `gcloud` project matches
`LINEAGE_GCP_PROJECT`**. `gcloud` otherwise deploys to whatever project happens to be
selected, which is a quiet way to ship your API into something unrelated.

After deploying the API for the first time, put its URL in `VITE_API_BASE_URL` and
redeploy the web app — the frontend compiles that in at build time.

### Things that are load-bearing

- **`--max-instances=1` is a correctness requirement, not a cost control.** Open Archives
  throttles per IP address, all archive traffic egresses from Cloud Run, and the rate
  limiter is a per-process clock. A second instance means a second clock against the same
  IP, at double the agreed rate. Move the limiter to shared storage before scaling out.
- **`ALLOWED_ORIGINS` must be set.** The backend defaults CORS to `*`; the deploy script
  refuses to run without it.
- **The 900s Cloud Run timeout matters.** A research turn spans paced archive searches and
  in-place quota waits; the default 300s cuts the SSE stream mid-research.
- **Do not put a buffering CDN in front of the API.** Long-lived SSE streams are cut by
  proxies that buffer responses or cap request duration. If you proxy your domain, keep
  the API on its own Cloud Run URL.
- **Deploy `firestore.rules` before relying on sync.** Until they exist, the default rules
  deny every read and write, and the failure is silent.

### Configuration reference

| File | Committed? | Purpose |
|---|---|---|
| `.deploy.env` | No | Deployment target: project, region, allowed origins. |
| `apps/web-frontend/.env` | No | Build-time frontend config. |
| `firebase.json` | Yes | Hosting: SPA rewrites, cache and security headers. |
| `firestore.rules` | Yes | Per-user access control for synced sessions. |

No project id, domain or account detail is committed — `firebase --project` is passed
explicitly, so no `.firebaserc` is needed.

---

## 🪵 Legacy ADK Implementation (Deprecated)

The project began as a local-first **Agent Development Kit (ADK)** research toolkit built on
[Google's ADK](https://google.github.io/adk-docs/), with a hierarchical multi-agent design and a
Plotly Dash front end. Full setup and run instructions are in
**[archived/adk-app/README.md](archived/adk-app/README.md)**; [AGENTS.md](AGENTS.md) covers how it compares to the
current orchestrator.

> **Note:** the legacy code imports itself as `adk_app` while the directory is named `archived/adk-app`.
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
