
# This is a Plotly Dash application that connects to an Agent Development Kit (ADK) API server.
# The ADK implementation resides in the `adk-app` directory.
#
# IMPORTANT: This script starts a web server that will not terminate on its own.
# Agents should not invoke this script directly, as it will cause the agent to hang.
# The user is responsible for running this server in a separate terminal.
#
# To run the server, execute this file from the root project directory:
# $ python apps/lineage_app.py
#
# The agent will ask you to restart the server when necessary.

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import dash
import dash_bootstrap_components as dbc
from dash import DiskcacheManager

# For background callbacks
import diskcache

from apps.layout.main import create_layout
from apps.callbacks.chat import register_chat_callbacks
from apps.callbacks.sidebar_callbacks import register_sidebar_callbacks
from apps.callbacks.session_callbacks import register_session_callbacks

cache = diskcache.Cache("./cache")
background_callback_manager = DiskcacheManager(cache)

# Initialize the Dash app
app = dash.Dash(
    __name__,
    external_stylesheets=[
        dbc.themes.DARKLY,
        dbc.icons.BOOTSTRAP,
        "/assets/custom.css"
    ],
    assets_folder='../assets',
    background_callback_manager=background_callback_manager,
    title="Lineage Nexus",
    meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}]
)

# Add Google Fonts link
app.index_string = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>{%title%}</title>
        {%favicon%}
        {%css%}
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
            <script src="/assets/code_block_utils.js"></script>
        </footer>
    </body>
</html>
'''

# Set the layout
app.layout = create_layout(app)

# Register callbacks
register_chat_callbacks(app)
register_sidebar_callbacks(app)
register_session_callbacks(app)

if __name__ == "__main__":
    # TODO: Disable use_reloader in production for stability.
    app.run(debug=True, use_reloader=False, port=8050)
