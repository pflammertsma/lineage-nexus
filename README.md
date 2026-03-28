# <image src="docs/logo.svg" height="24" alt="ADK web interface"/> Lineage Nexus

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

<image src="docs/chat-screen.png" width="480" alt="ADK web interface"/>

## Quickstart

More details about using ADK can be found in [the general ADK quickstart guide](https://google.github.io/adk-docs/get-started/quickstart/).

### Dependencies

 - [Python3](https://www.python.org/downloads/)
 - [pip](https://pypi.org/project/pip/), Python package installer
 - [venv](https://docs.python.org/3/library/venv.html), Virtual environments for Python
 - [Google's ADK](https://google.github.io/adk-docs/), Agent Development Kit

### Directory setup

Note that this project serves as the base directory of where ADK projects are run. ADK identifies all subdirectories as agent projects, and due to this nature, the only directory immediately inside this project is our Lineage Nexus agent project:

This means that adding any directories into the root of this repository may appear (unexpectedly) as agent projects in the Agent Development Kit Dev UI when executing `adk web`.

### Installation

1. Install Python
2. Install `pip`
3. Install `venv`
    ```
    # Linux
    pip install virtualenv
    # macOS
    brew install virtualenv
    ```

### Configuration

1. Visit [ai.dev](https://ai.dev) to get your Google API key.
2. Create `.env` file:
    ```
    touch adk-app/.env
    ```
3. Add following lines to your `adk-app/.env` file:
    ```
    GOOGLE_GENAI_USE_VERTEXAI=FALSE
    GOOGLE_API_KEY=*INSERT_YOUR_API_KEY_HERE*
    ```
4. Create virtual environment:
    ```
    python3 -m venv .venv
    ```
5. Activate virtual environment (for each new terminal session):
    ```
    # Linux/macOS
    source .venv/bin/activate
    ```
6. Install ADK:
    ```
    pip install google-adk
    ```
    Alternatively, use the weekly build:
    ```
    pip install git+https://github.com/google/adk-python.git@main
    ```

## Running the agent

There are two ways to run the Lineage Nexus agent: with the default ADK web interface, or with the custom Streamlit web interface.

### Default Web Interface

From this repo's root directory, execute:

```
adk web
```

Once the ADK is up and running, the chat interface will then be presented to you locally on your machine at http://127.0.0.1:8000/.

### Custom Web Interface (Streamlit)

This project includes a custom web interface built with Streamlit that provides a better user experience.

**1. Install UI Dependencies**

From the project's root directory, install the required packages for the UI:
```
pip install -r apps/requirements.txt
```

**2. Run the ADK API Server**

In one terminal, navigate to the project's root directory and run the agent as an API server:
```
adk api_server --log_level DEBUG
```

**3. Run the Streamlit App**

In a second terminal, navigate to the project's root directory and run the Plotly Dash:
```
python apps/lineage_app.py
```

This will open a new tab in your browser with the custom chat interface.

## Accessing Lineage Nexus publicly through the web

**Lineage Nexus is not publicly available on the web.** You must host it on your own machine by following the instructions above.

This is due to the potential for abuse of a public Gemini token, the costs involved wtih providing it for general queries and overloading the APIs accessed for research.

## License

This project is licensed. See the [LICENSE.md](LICENSE.md) file for details.

## Thanks!

Please feel free to contribute to this project in any way:
* Contributing code and submitting pull requests
* Reporting bugs or feature requests
* General discussion through [our Discord channel](https://discord.gg/qbxpQJPC)

Thanks!

<image src="docs/logo.svg" height="128" alt="ADK web interface"/>
