import dash_bootstrap_components as dbc
from dash import dcc, html

# --- Reusable Components ---

def create_sidebar_content(prefix: str, app):
    """Creates the content for the sidebar, used in both desktop and mobile views."""
    return [
        html.Div([
            html.A(
                href="/",
                className="sidebar-header",
                children=[
                    html.Img(src=app.get_asset_url('logo.svg'), className="app-icon", alt="Lineage Nexus Logo"),
                    html.Span("Lineage Nexus", className="app-title")
                ]
            ),
        ], className="d-flex justify-content-between align-items-center"),
        dbc.Nav(
            [dbc.Button("New Session", id=f'{prefix}-new-session-btn', color="primary", className="w-100")],
            vertical=True, pills=True, className="my-3"
        ),
        html.Hr(),
        html.Div(id=f'{prefix}-session-list-container', children=[dbc.Spinner(size="sm")]),
        html.Div(style={'flexGrow': 1}),
        html.Hr(),
        html.Div(id=f'{prefix}-api-status-indicator'),
        html.Div(
            [
                html.A(
                    "© 2025, Paul Lammertsma",
                    href="https://github.com/pflammertsma/lineage-nexus",
                    target="_blank",
                    rel="noopener noreferrer",
                    className="copyright",
                    style={'textDecoration': 'none'}
                ),
                html.Span(" | ", className="copyright"),
                html.A(
                    "Help",
                    id=f'{prefix}-help-link',
                    href="#",
                    className="copyright",
                    style={'textDecoration': 'none'}
                )
            ],
            className="text-center p-2"
        )
    ]

# --- App Layout ---

def create_layout(app):
    store_components = html.Div([
        dcc.Store(id='user-id-store', storage_type='local'),
        dcc.Store(id='sidebar-collapsed-store', data=False),
        dcc.Store(id='sessions-store', data=None),
        dcc.Store(id='active-session-store', data=None),
        dcc.Store(id='messages-store', data={}),
        dcc.Store(id='api-trigger-store', data=None),
        dcc.Store(id='is-thinking-store', data=False),
        dcc.Store(id='connection-error-store', data=None),
        dcc.Store(id='deleting-session-store', data=None),
        
        dcc.Interval(id='api-status-interval', interval=60*1000, n_intervals=0),
    ])

    desktop_sidebar = html.Div(
        id="sidebar",
        className="d-none d-lg-flex flex-column flex-shrink-0",
        style={"width": "280px", "height": "100vh", "transition": "width 0.3s", "overflow": "hidden"},
        children=[
            html.Div(
                style={'width': '280px', 'padding': '1rem', 'display': 'flex', 'flexDirection': 'column', 'height': '100%'},
                children=create_sidebar_content(prefix='desktop', app=app)
            )
        ]
    )

    mobile_sidebar = dbc.Offcanvas(
        id="offcanvas-sidebar",
        is_open=False,
        title="Lineage Nexus",
        children=create_sidebar_content(prefix='mobile', app=app)
    )

    header = html.Div(
        id="main-header",
        className="d-flex align-items-center p-3 border-bottom",
        children=[
            dbc.Button(html.I(className="bi bi-list"), id="open-sidebar-btn", className="d-lg-none me-2", n_clicks=0),
            dbc.Button(html.I(className="bi bi-layout-sidebar"), id="collapse-sidebar-btn", className="d-none d-lg-inline-block me-2", n_clicks=0),
            html.H4(id="conversation-title", className="m-0"),
        ]
    )

    chat_history = html.Div(
        id="chat-history",
        style={"flexGrow": "1", "overflowY": "auto", "position": "relative", "transition": "padding-bottom 0.3s"},
        children=[html.Div(
            [dbc.Spinner(), html.Span(" Initializing session…", className="ms-2")],
            className="d-flex justify-content-center align-items-center h-100"
        )]
    )

    chat_input_area = html.Div(
        id="chat-input-area",
        className="p-3",
        style={"flexShrink": "0", "zIndex": 2, "position": "relative"},
        children=[
            dbc.Row([
                dbc.Col(
                    dbc.ButtonGroup(
                        [
                            dbc.Button("Start Research", id="start-research-btn", color="secondary"),
                            dbc.Button("Format Biography", id="format-biography-btn", color="secondary"),
                            dbc.Button("Fetch profile…", id="fetch-profile-btn", color="secondary"),
                        ]
                    )
                )
            ], className="mb-2"),
            dbc.InputGroup([
                dcc.Textarea(id="user-input", placeholder="Type your message…", style={'resize': 'none'}, className="user-input-textarea", rows=1),
                dbc.Button(html.I(className="bi bi-send-fill"), id="send-btn", color="primary", n_clicks=0, className="circle-button"),
            ]),
        ]
    )

    main_content = html.Div(
        id="main-content",
        className="d-flex flex-column",
        style={"flexGrow": 1, "position": "relative", "height": "100vh"},
        children=[
            header,
            chat_history,
            chat_input_area,
            dbc.Button(
                html.I(className="bi bi-arrow-down-circle-fill fs-4"),
                id="scroll-to-bottom-btn",
                style={
                    "position": "absolute",
                    "bottom": "120px",
                    "right": "36px",
                    "display": "none",
                    "zIndex": 10
                },
                className="circle-button"
            )
        ]
    )

    main_content_container = html.Div(
        id="main-content-container",
        style={"flexGrow": 1, "position": "relative", "height": "100vh"},
        children=[
            main_content,
            html.Div(
                id="connection-error-overlay",
                className="connection-error-overlay d-none flex-column justify-content-center align-items-center",
                style={
                    "position": "absolute",
                    "top": 0,
                    "left": 0,
                    "right": 0,
                    "bottom": 0,
                    "zIndex": 100,
                },
                children=[
                    html.H4("Connection Failed"),
                    html.Div(
                        [
                            html.P("Could not connect to the server.", className="m-0"),
                            dbc.Button(
                                html.I(className="bi bi-info-circle"),
                                id="error-details-btn",
                                color="link",
                                className="p-0 ms-2",
                            ),
                        ],
                        className="d-flex align-items-center",
                    ),
                    dbc.Button("Retry", id="retry-connection-btn", color="primary", className="mt-3"),
                ],
            ),
        ],
    )

    profile_modal = dbc.Modal([
        dbc.ModalHeader("Fetch WikiTree Profile"),
        dbc.ModalBody(
            dbc.Input(id="wikitree-profile-id-input", placeholder="Enter WikiTree ID (e.g., Hoogstraten-45)")
        ),
        dbc.ModalFooter([
            dbc.Button("Cancel", id="fetch-profile-cancel-btn", className="ms-auto", n_clicks=0),
            dbc.Button("OK", id="fetch-profile-ok-btn", className="ms-2", n_clicks=0),
        ]),
    ], id="profile-modal", is_open=False)

    error_modal = dbc.Modal(
        [
            dbc.ModalHeader(dbc.ModalTitle("Error details")),
            dbc.ModalBody(html.Pre(id="connection-error-details", style={'maxHeight': '400px', 'overflowY': 'auto'})),
            dbc.ModalFooter(
                dbc.Button(
                    "Close", id="close-error-modal-btn", className="ms-auto", n_clicks=0
                )
            ),
        ],
        id="error-details-modal",
        is_open=False,
    )

    return html.Div(
        id="app-container", 
        className="d-flex", 
        children=[
            store_components, 
            desktop_sidebar, 
            main_content_container, 
            mobile_sidebar,
            profile_modal,
            error_modal,
        ]
    )