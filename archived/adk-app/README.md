# <image src="../docs/logo.svg" height="24" alt="Lineage Nexus"/> Lineage Nexus — Legacy ADK Implementation

> **⚠️ Deprecated.** This is the original local-first implementation, built on
> [Google's Agent Development Kit (ADK)](https://google.github.io/adk-docs/). It has been
> superseded by the hosted platform in `apps/cloud-backend` and `apps/web-frontend`.
> It is kept for reference — in particular for the Holocaust sources and the WieWasWie client,
> which have not yet been ported. See the root [README.md](../README.md) for the current stack.

> **⚠️ Does not run as checked in.** Every module imports itself as `adk_app` (underscore) while
> this directory is named `adk-app` (hyphen), which is not a valid Python package name. Running
> it again requires renaming the directory to `adk_app` or adding a path shim.

## Background

*Lineage Nexus* is a genealogical research agent that performs research through queries to
[OpenArchieven](https://www.openarchieven.nl/) and facilitates creating profiles ready to publish
to [WikiTree](https://www.wikitree.com/).

It is a chat-based interface that connects to:
* [Open Archives API](https://www.openarchieven.nl/api/docs/)
* [WikiTree API](https://github.com/wikitree/wikitree-api)
* [Joods Monument](https://www.joodsmonument.nl/) and [Oorlogsbronnen](https://www.oorlogsbronnen.nl/) (Holocaust records)
* [WieWasWie](https://www.wiewaswie.nl/) — a partial client exists in `api/wiewaswie.py`, but no
  agent uses it

This enables it to understand queries like:
* _`Who was Jan Lammertsma (d. 1847)?`_
* _`Create a WikiTree profile for Jan from this record: https://www.openarchieven.nl/gra:fb3d078b-fd79-feb3-9000-947e38cbc0a3`_
* _`Research the WikiTree profile 'Jans-10027' and amend it with additional information`_

<image src="docs/chat-screen.png" width="480" alt="ADK web interface"/>

## Architecture

Unlike the current single-orchestrator design, this is a **hierarchical multi-agent system**. The
root agent delegates to sub-agents using ADK's transfer mechanism; every sub-agent prompt ends
with a mandatory "transfer back to `LineageNexusOrchestrator`" protocol.

| Agent | Name | Model | Source |
|---|---|---|---|
| Orchestrator | `LineageNexusOrchestrator` | `gemini-2.5-pro` | [`root_agent.py`](root_agent.py) |
| Archival research | `OpenArchievenResearcher` | `gemini-2.5-flash` | [`agent/openarchieven.py`](agent/openarchieven.py) |
| WikiTree reads | `WikiTreeProfileAgent` | `gemini-2.5-flash-lite` | [`agent/wikitree.py`](agent/wikitree.py) |
| Wikitext formatting | `WikitreeFormatterAgent` | `gemini-2.5-flash` | [`agent/wikitree_format.py`](agent/wikitree_format.py) |
| Holocaust records | `HolocaustAgent` | `gemini-2.5-flash-lite` | [`agent/holocaust.py`](agent/holocaust.py) |

Defined but **not wired into** `root_agent.sub_agents`: `RecordCombiner`
([`agent/combiner.py`](agent/combiner.py)) and `GenerationalFileComparisonAgent`
([`agent/comparison.py`](agent/comparison.py)).

Supporting layers:
- `api/` — plain HTTP clients (synchronous `requests`, rate-limited via `util/utils.py`).
- `util/state_util.py` — shared session state through ADK's `ToolContext`. Agents call
  `set_current_subject` / `add_records_to_subject` so the research subject and its found records
  are visible to every other agent, and the session title is pushed back to the API server.
- `constants.py` — model tiers (`MODEL_SMART` / `MODEL_MIXED` / `MODEL_FAST`) and logging.
- `test/` — unit tests for the API clients.

Model choice is deliberate: comments in `agent/openarchieven.py` note that `MODEL_FAST` was
tested and rejected for the researcher, as it became confused by the record data it received.

## Quickstart

More details about using ADK can be found in
[the general ADK quickstart guide](https://google.github.io/adk-docs/get-started/quickstart/).

### Dependencies

 - [Python3](https://www.python.org/downloads/)
 - [pip](https://pypi.org/project/pip/), Python package installer
 - [venv](https://docs.python.org/3/library/venv.html), Virtual environments for Python
 - [Google's ADK](https://google.github.io/adk-docs/), Agent Development Kit

### Directory setup

The **repository root** is the base directory from which ADK projects are run. ADK treats every
subdirectory as an agent project, which is why this agent lives in its own directory rather than
at the root.

This means that adding any directories into the root of this repository may appear
(unexpectedly) as agent projects in the ADK Dev UI when executing `adk web`.

### Configuration

1. Visit [ai.dev](https://ai.dev) to get your Google API key.
2. Create the `.env` file:
    ```bash
    touch adk-app/.env
    ```
3. Add the following lines to `adk-app/.env`:
    ```
    GOOGLE_GENAI_USE_VERTEXAI=FALSE
    GOOGLE_API_KEY=*INSERT_YOUR_API_KEY_HERE*
    ```
4. Create a virtual environment, from the repository root:
    ```bash
    python3 -m venv .venv
    ```
5. Activate it (for each new terminal session):
    ```bash
    source .venv/bin/activate      # Linux/macOS
    .venv\Scripts\activate         # Windows
    ```
6. Install the ADK:
    ```bash
    pip install google-adk
    ```
    Alternatively, use the weekly build:
    ```bash
    pip install git+https://github.com/google/adk-python.git@main
    ```

## Running the agent

There are two ways to run the legacy agent: with the default ADK web interface, or with the
custom Plotly Dash interface.

### Default ADK web interface

From the repository root, execute:

```bash
adk web
```

The chat interface is then served at http://127.0.0.1:8000/.

### Custom web interface (Plotly Dash)

A custom interface built with [Plotly Dash](https://dash.plotly.com/) lives in `apps/` at the
repository root (`lineage_app.py`, `layout/`, `callbacks/`), talking to the ADK API server
through `apps/api_client.py`.

**1. Install the UI dependencies**, from the repository root:
```bash
pip install -r apps/requirements.txt
```

**2. Run the ADK API server** in one terminal, from the repository root:
```bash
adk api_server --log_level DEBUG
```
This serves on port `8000`.

**3. Run the Dash app** in a second terminal, from the repository root:
```bash
python apps/lineage_app.py
```
This serves the UI on http://127.0.0.1:8050/.

> The Dash app starts a web server that does not terminate on its own; run it in its own
> terminal. It also writes a `diskcache` to `./cache` for background callbacks.

Unlike the current stateless backend, the ADK API server provides real server-side session
persistence — the Dash sidebar lists, creates and deletes sessions via
`/apps/Lineage Nexus/users/{user_id}/sessions`, and streams replies from `/run_sse`.

## Tests

Unit tests for the API clients live in [`test/`](test/) and cover the OpenArchieven, WikiTree,
Holocaust and WieWasWie clients. They are subject to the package-name caveat noted at the top.

## License

This project is licensed. See the [LICENSE.md](../LICENSE.md) file for details.

<image src="../docs/logo.svg" height="128" alt="Lineage Nexus"/>
