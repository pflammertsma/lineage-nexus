# Archived implementations

Superseded versions of Lineage Nexus, kept for reference. **None of this runs, and none of
it is part of the build** — `pnpm-workspace.yaml` only globs `apps/*`, so nothing here is
installed, linted, or deployed.

They are retained because the current orchestrator was derived from them: the prompts,
API clients and research strategies here are the reference for behaviour that has not yet
been ported.

| Directory | What it was | Superseded by |
|---|---|---|
| `adk-app/` | The original [Google ADK](https://google.github.io/adk-docs/) multi-agent system — a hierarchical design with specialised sub-agents. | `apps/cloud-backend/` |
| `dash-app/` | A Plotly Dash web client that talked to the ADK API server. `assets/` holds its static CSS/JS. | `apps/web-frontend/` |

## Still useful here

- `adk-app/agent/holocaust.py` and `adk-app/api/` — prompts and API clients for the
  Holocaust research toolset, which is not yet implemented in the current backend.
- `adk-app/test/` — the only test suite in the repository, covering the old API clients.

## Known breakage

`adk-app` modules import themselves as `adk_app` while the directory is hyphenated, so the
package cannot be imported as-is. Running it again would need a rename or a path shim.

See [AGENTS.md](../AGENTS.md) for how the archived architecture compares to the current one.
