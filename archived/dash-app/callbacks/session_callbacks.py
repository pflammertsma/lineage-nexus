import dash
import dash_bootstrap_components as dbc
from dash import dcc, html, Input, Output, State, ALL, ctx
import uuid
import time

from .utils import _parse_events_to_messages
from ..layout.components import SystemMessage
from .. import api_client

def register_session_callbacks(app):

    @app.callback(Output('user-id-store', 'data'), Input('user-id-store', 'data'))
    def initialize_user_id(current_id):
        if current_id is None: return f"user-{uuid.uuid4()}"
        return dash.no_update

    @app.callback(
        [Output('sessions-store', 'data', allow_duplicate=True),
         Output('active-session-store', 'data', allow_duplicate=True),
         Output('messages-store', 'data', allow_duplicate=True),
         Output('desktop-new-session-btn', 'n_clicks'),
         Output('mobile-new-session-btn', 'n_clicks')],
        Input('user-id-store', 'data'),
        [State('sessions-store', 'data'),
         State('active-session-store', 'data'),
         State('messages-store', 'data')],
        prevent_initial_call='initial_duplicate',
    )
    def initialize_sessions(user_id, existing_sessions, active_session_id, messages_data):
        if not user_id or existing_sessions or active_session_id:
            return dash.no_update, dash.no_update, dash.no_update, dash.no_update, dash.no_update

        sessions_data, error = api_client.get_sessions(user_id)

        if error:
            print(f"API call to fetch sessions failed: {error}")
            # Fall through to create a new session
        else:
            sessions = {}
            if isinstance(sessions_data, list):
                if sessions_data and isinstance(sessions_data[0], dict):
                    sessions = {s['id']: s.get('title', f'Session {i+1}') for i, s in enumerate(sessions_data)}
                elif sessions_data:
                    sessions = {sid: f"Session {i+1}" for i, sid in enumerate(sorted(sessions_data))}
            elif isinstance(sessions_data, dict):
                sessions = sessions_data

            if sessions:
                latest_session_id = sorted(sessions.keys(), reverse=True)[0]
                return sessions, latest_session_id, dash.no_update, dash.no_update, dash.no_update
            else:
                print("Sessions: No sessions found on server")

        print("Sessions: Creating new session")
        return dash.no_update, dash.no_update, dash.no_update, 1, 1

    @app.callback(
        [Output('sessions-store', 'data', allow_duplicate=True), 
         Output('active-session-store', 'data', allow_duplicate=True), 
         Output('messages-store', 'data', allow_duplicate=True),
         Output('connection-error-store', 'data', allow_duplicate=True)],
        [Input('desktop-new-session-btn', 'n_clicks'),
         Input('mobile-new-session-btn', 'n_clicks')],
        [State('user-id-store', 'data'), 
         State('sessions-store', 'data'), 
         State('messages-store', 'data')],
        prevent_initial_call=True
    )
    def create_session(desktop_clicks, mobile_clicks, user_id, sessions_data, messages_data):
        if not ctx.triggered_id or user_id is None: return dash.no_update, dash.no_update, dash.no_update, dash.no_update
        
        session_id = f"session-{int(time.time())}"
        _, error = api_client.create_session(user_id, session_id)

        new_sessions = sessions_data.copy() if sessions_data is not None else {}
        new_messages = messages_data.copy()

        if not error:
            new_sessions[session_id] = f"Session {len(new_sessions) + 1}"
            if session_id not in new_messages: new_messages[session_id] = []
            return new_sessions, session_id, new_messages, None
        else:
            error_message = f"Failed to create session: {error}"
            print(error_message)
            return dash.no_update, dash.no_update, dash.no_update, error_message

    @app.callback(
        [Output('sessions-store', 'data', allow_duplicate=True),
         Output('active-session-store', 'data', allow_duplicate=True),
         Output('messages-store', 'data', allow_duplicate=True),
         Output('connection-error-store', 'data', allow_duplicate=True),
         Output('api-trigger-store', 'data', allow_duplicate=True),
         Output('is-thinking-store', 'data', allow_duplicate=True)],
        [Input('desktop-help-link', 'n_clicks'),
         Input('mobile-help-link', 'n_clicks')],
        [State('user-id-store', 'data'),
         State('sessions-store', 'data'),
         State('messages-store', 'data')],
        prevent_initial_call=True
    )
    def create_help_session(desktop_clicks, mobile_clicks, user_id, sessions_data, messages_data):
        if not ctx.triggered_id or user_id is None:
            return dash.no_update, dash.no_update, dash.no_update, dash.no_update, dash.no_update, dash.no_update

        session_id = f"session-{int(time.time())}"
        _, error = api_client.create_session(user_id, session_id)

        new_sessions = sessions_data.copy() if sessions_data is not None else {}
        new_messages = messages_data.copy()

        if not error:
            new_sessions[session_id] = "Lineage Nexus Help"
            
            help_content = "I'm new to using Lineage Nexus. Give me a brief explanation about genealogy and what Lineage Nexus can do to perform research. Ask me what else I'd like to know, providing a list of suggestions including the websites and agents you work with."
            
            help_message = {
                "role": "user",
                "content": help_content
            }
            
            new_messages[session_id] = [help_message, {"role": "thinking"}]
            
            trigger_data = {"user_input": help_content, "timestamp": time.time()}
            
            return new_sessions, session_id, new_messages, None, trigger_data, True
        else:
            error_message = f"Failed to create session: {error}"
            print(error_message)
            return dash.no_update, dash.no_update, dash.no_update, error_message, dash.no_update, False

    @app.callback(
        [Output('desktop-session-list-container', 'children'),
         Output('mobile-session-list-container', 'children')],
        [Input('sessions-store', 'data'), 
         Input('active-session-store', 'data'),
         Input('deleting-session-store', 'data')]
    )
    def update_session_list(sessions, active_session_id, deleting_session_id):
        if sessions is None:
            loading_spinner = dbc.Spinner(size="sm")
            return loading_spinner, loading_spinner
        elif not sessions: 
            no_sessions_message = html.P("No sessions.", className="text-muted text-center p-3")
            return no_sessions_message, no_sessions_message
        
        items = []
        for sid, name in reversed(list(sessions.items())):
            
            if sid == deleting_session_id:
                control = dbc.Spinner(size="sm", color="light")
            else:
                control = dbc.DropdownMenu(
                    [dbc.DropdownMenuItem("Delete", id={"type": "delete-session-btn", "index": sid})],
                    label=html.I(className="bi bi-three-dots-vertical"),
                    color="link",
                    size="sm",
                    align_end=True,
                    className="session-overflow-menu"
                )

            item = dbc.ListGroupItem(
                [
                    html.Span(name, className="session-name"),
                    control,
                ],
                id={"type": "session-btn", "index": sid},
                action=True,
                active=(sid == active_session_id),
                className="session-list-item d-flex justify-content-between align-items-center"
            )
            items.append(item)
            
        list_group = dbc.ListGroup(items, flush=True)
        return list_group, list_group

    @app.callback(
        [Output('active-session-store', 'data', allow_duplicate=True),
         Output('chat-history', 'children', allow_duplicate=True)],
        Input({"type": "session-btn", "index": ALL}, 'n_clicks'),
        State('active-session-store', 'data'),
        prevent_initial_call=True
    )
    def show_loading_spinner_on_session_change(n_clicks, active_session_id):
        if not ctx.triggered_id or not any(n_clicks):
            return dash.no_update, dash.no_update

        clicked_session_id = ctx.triggered_id['index']

        if clicked_session_id == active_session_id:
            return dash.no_update, dash.no_update

        loading_spinner = SystemMessage("Loading session…", with_spinner=True)
        return clicked_session_id, loading_spinner

    @app.callback(
        Output('messages-store', 'data', allow_duplicate=True),
        Input('active-session-store', 'data'),
        [State('user-id-store', 'data'),
         State('messages-store', 'data')],
        prevent_initial_call=True
    )
    def fetch_session_history(active_session_id, user_id, messages_data):
        if not active_session_id or not user_id:
            return dash.no_update

        if active_session_id in messages_data and messages_data[active_session_id]:
            return dash.no_update

        session_details, error = api_client.get_session_history(user_id, active_session_id)
        new_messages = messages_data.copy()

        if error:
            print(f"API call to fetch session messages failed: {error}")
            new_messages[active_session_id] = [{
                "role": "system",
                "content": f"Failed to load session history: {error}"
            }]
        else:
            session_history_events = session_details.get('events', [])
            parsed_messages, _ = _parse_events_to_messages(session_history_events)
            new_messages[active_session_id] = parsed_messages
            
        return new_messages

    @app.callback(
        Output('conversation-title', 'children'),
        [Input('active-session-store', 'data'),
         Input('sessions-store', 'data')]
    )
    def update_conversation_title(active_session_id, sessions):
        if not active_session_id or not sessions: return "Conversation"
        return sessions.get(active_session_id, "Conversation")

    @app.callback(
        Output('chat-history', 'children', allow_duplicate=True),
        [Input('desktop-new-session-btn', 'n_clicks'),
         Input('mobile-new-session-btn', 'n_clicks')],
        prevent_initial_call=True
    )
    def show_creating_session_spinner(desktop_clicks, mobile_clicks):
        if not ctx.triggered_id:
            return dash.no_update
        
        return SystemMessage("Creating session...", with_spinner=True)

    @app.callback(
        [Output('connection-error-overlay', 'className'),
         Output('connection-error-details', 'children'),
         Output('main-content', 'className')],
        Input('connection-error-store', 'data')
    )
    def toggle_connection_error_overlay(error):
        base_class = "connection-error-overlay flex-column justify-content-center align-items-center"
        if error:
            return f"d-flex {base_class}", str(error), "d-none"
        else:
            return f"d-none {base_class}", "", "d-flex flex-column"

    @app.callback(
        [Output('connection-error-store', 'data'),
         Output('desktop-new-session-btn', 'n_clicks', allow_duplicate=True),
         Output('mobile-new-session-btn', 'n_clicks', allow_duplicate=True)],
        Input('retry-connection-btn', 'n_clicks'),
        prevent_initial_call=True
    )
    def retry_connection(n_clicks):
        if n_clicks and n_clicks > 0:
            return None, 1, 1
        return dash.no_update, dash.no_update, dash.no_update

    @app.callback(
        Output("error-details-modal", "is_open"),
        [Input("error-details-btn", "n_clicks"), Input("close-error-modal-btn", "n_clicks")],
        [State("error-details-modal", "is_open")],
        prevent_initial_call=True,
    )
    def toggle_error_modal(open_clicks, close_clicks, is_open):
        if open_clicks or close_clicks:
            return not is_open
        return is_open

    @app.callback(
        Output('deleting-session-store', 'data', allow_duplicate=True),
        Input({"type": "delete-session-btn", "index": ALL}, 'n_clicks'),
        prevent_initial_call=True
    )
    def delete_session_start(n_clicks):
        if not any(n_clicks):
            raise dash.exceptions.PreventUpdate
        
        clicked_button = ctx.triggered_id
        session_to_delete = clicked_button['index']
        return session_to_delete

    @app.callback(
        [Output('sessions-store', 'data', allow_duplicate=True),
         Output('messages-store', 'data', allow_duplicate=True),
         Output('active-session-store', 'data', allow_duplicate=True),
         Output('deleting-session-store', 'data', allow_duplicate=True)],
        Input('deleting-session-store', 'data'),
        [State('user-id-store', 'data'),
         State('sessions-store', 'data'),
         State('messages-store', 'data'),
         State('active-session-store', 'data')],
        prevent_initial_call=True,
        background=True
    )
    def delete_session_finish(session_to_delete, user_id, sessions_data, messages_data, active_session_id):
        if not session_to_delete:
            raise dash.exceptions.PreventUpdate

        _, error = api_client.delete_session(user_id, session_to_delete)

        if error:
            print(f"Failed to delete session: {error}")
            return dash.no_update, dash.no_update, dash.no_update, None

        if sessions_data:
            new_sessions = {sid: name for sid, name in sessions_data.items() if sid != session_to_delete}
        else:
            new_sessions = {}
        new_messages = {sid: msgs for sid, msgs in messages_data.items() if sid != session_to_delete}

        new_active_session_id = active_session_id
        if active_session_id == session_to_delete:
            if new_sessions:
                new_active_session_id = sorted(new_sessions.keys(), reverse=True)[0]
            else:
                new_active_session_id = None
        
        return new_sessions, new_messages, new_active_session_id, None