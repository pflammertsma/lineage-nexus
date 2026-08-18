import dash
import dash_bootstrap_components as dbc
from dash import dcc, html, Input, Output, State, ALL, ctx
import uuid
import time
import re

from ..layout.components import SystemMessage, ErrorBubble, AuthorLine, UserChatBubble, AgentChatBubble, AgentTransferLine, ToolCallBubble, ToolResponseBubble, WikitextBubble, ThinkingBubble
from .utils import _parse_events_to_messages
from .. import api_client

def register_chat_callbacks(app):

    @app.callback(
        [Output('desktop-api-status-indicator', 'children'),
         Output('mobile-api-status-indicator', 'children')],
        [Input('api-status-interval', 'n_intervals'),
         Input('is-thinking-store', 'data')]
    )
    def update_api_status(n_intervals, is_thinking):
        if ctx.triggered_id == 'is-thinking-store' and is_thinking:
            return None, None

        is_online, _ = api_client.check_api_status()
        if is_online:
            return None, None
        else:
            status_badge = dbc.Badge("Offline", color="danger", className="ms-2")
            return status_badge, status_badge

    @app.callback(
        Output('chat-history', 'children'),
        [Input('messages-store', 'data'),
         Input('active-session-store', 'data'),
         Input('is-thinking-store', 'data')],
        State('sessions-store', 'data')
    )
    def update_chat_history(messages_data, active_session_id, is_thinking, sessions):
        if not active_session_id:
            if sessions is None:
                return SystemMessage("Loading session…", with_spinner=True)
            elif sessions:
                return SystemMessage("Loading session…", with_spinner=True)
            else:
                return SystemMessage("You have no sessions. Create a new session to get started.")

        if active_session_id not in messages_data:
            return SystemMessage("Restoring session…", with_spinner=True)

        messages = messages_data.get(active_session_id, [])
        if not messages and not is_thinking:
            return SystemMessage("What can I help you with?")

        bubbles = []
        last_printed_author = None
        for i, msg in enumerate(messages):
            role = msg.get('role')
            content = msg.get('content', '')
            author = msg.get('author', 'Assistant')
            tool_name = msg.get('name', 'Unknown Tool')

            show_author = False
            if role == 'tool':
                show_author = True
            elif role in ['assistant', 'error']:
                if last_printed_author is None or author != last_printed_author:
                    show_author = True
            
            author_line = AuthorLine(author) if show_author else None
            
            bubble = None
            wrapper_class = "chat-message-wrapper"

            if role == 'user':
                bubble = UserChatBubble(content)
                wrapper_class += " user-message"
                last_printed_author = None
            
            elif role == 'assistant':
                wrapper_class += " ai-message"
                if '```wiki' in content:
                    bubble = WikitextBubble(content, author_line=author_line)
                else:
                    bubble = AgentChatBubble(content, author_line=author_line)

            elif role == 'tool':
                wrapper_class += " ai-message"
                if tool_name == 'transfer_to_agent':
                    bubble = AgentTransferLine(author, tool_name, msg.get('input', '{}'))
                else:
                    bubble = ToolCallBubble(tool_name, msg.get('input', '{}'), author_line=author_line)
            
            elif role == 'tool_response':
                wrapper_class += " ai-message"
                if tool_name != 'transfer_to_agent':
                    bubble = ToolResponseBubble(author, tool_name, msg.get('output', '{}'), author_line=author_line)

            elif role == 'error':
                wrapper_class += " ai-message"
                bubble = ErrorBubble(
                    main_message=msg.get('main_message', 'An error occurred.'),
                    details=msg.get('details', '{}'),
                    author_line=author_line
                )

            elif role == 'system':
                bubble = SystemMessage(content)
            
            if bubble:
                bubbles.append(html.Div(bubble, className=wrapper_class))

            if show_author:
                last_printed_author = author
        
        if is_thinking:
            bubbles.append(html.Div(ThinkingBubble(), className="chat-message-wrapper ai-message"))

        return html.Div(bubbles, className="p-3")

    @app.callback(
        [Output('messages-store', 'data', allow_duplicate=True),
         Output('user-input', 'value'),
         Output('api-trigger-store', 'data'),
         Output('is-thinking-store', 'data')],
        [Input('send-btn', 'n_clicks'),
         Input('start-research-btn', 'n_clicks'),
         Input('format-biography-btn', 'n_clicks'),
         Input('fetch-profile-ok-btn', 'n_clicks'),
         Input('wikitree-profile-id-input', 'n_submit')],
        [State('user-input', 'value'),
         State('wikitree-profile-id-input', 'value'),
         State('active-session-store', 'data'),
         State('messages-store', 'data')],
        prevent_initial_call=True
    )
    def handle_user_actions(send_clicks, research_clicks, format_clicks, fetch_clicks, n_submit, user_input, profile_id, active_session_id, messages_data):
        if not ctx.triggered_id:
            return dash.no_update, dash.no_update, dash.no_update, dash.no_update

        if not active_session_id or active_session_id.startswith('error-'):
            error_message = "Cannot send message: No active session. Please start a new session."
            new_messages = messages_data.copy()
            session_id_to_update = active_session_id if active_session_id else f"error-{uuid.uuid4()}"
            
            if session_id_to_update not in new_messages:
                new_messages[session_id_to_update] = []

            new_messages[session_id_to_update].append({
                "role": "assistant",
                "author": "System",
                "content": error_message
            })
            return new_messages, dash.no_update, dash.no_update, False

        input_text = ""
        clear_input = False

        if ctx.triggered_id == 'send-btn':
            if not user_input:
                return dash.no_update, dash.no_update, dash.no_update, dash.no_update
            input_text = user_input
            clear_input = True
        elif ctx.triggered_id == 'start-research-btn':
            input_text = "Use the researcher agent to perform research. Look for any relevant genealogical records."
        elif ctx.triggered_id == 'format-biography-btn':
            input_text = "Use the formatter agent to format a biography that includes as much relevant details about the profile we've been talking about, including references and only links to known profiles."
        elif ctx.triggered_id == 'fetch-profile-ok-btn' or ctx.triggered_id == 'wikitree-profile-id-input':
            if profile_id:
                input_text = f"Read {profile_id} from WikiTree, fetching it as the data may have changed if you have read it previously."
            else:
                return dash.no_update, dash.no_update, dash.no_update, dash.no_update

        if not input_text:
            return dash.no_update, dash.no_update, dash.no_update, dash.no_update

        new_messages = messages_data.copy()
        if active_session_id not in new_messages:
            new_messages[active_session_id] = []
        
        new_messages[active_session_id].append({"role": "user", "content": input_text})
        
        trigger_data = {"user_input": input_text, "timestamp": time.time()}
        
        output_user_input = "" if clear_input else dash.no_update

        return new_messages, output_user_input, trigger_data, True

    @app.callback(
        [Output('messages-store', 'data', allow_duplicate=True), 
         Output('sessions-store', 'data', allow_duplicate=True),
         Output('is-thinking-store', 'data', allow_duplicate=True)],
        Input('api-trigger-store', 'data'),
        State('user-id-store', 'data'),
        State('active-session-store', 'data'),
        State('messages-store', 'data'),
        State('sessions-store', 'data'),
        background=True,
        progress=[
            Output('messages-store', 'data'),
            Output('sessions-store', 'data')
        ],
        prevent_initial_call=True
    )
    def stream_agent_response(set_progress, trigger_data, user_id, active_session_id, messages_data, sessions_data):
        """
        Streams the agent's response. An agent may respond with multiple messages
        of different types over a period of time. This callback handles the
        streaming of those messages to the client, showing a thinking indicator
        until the full response is received.
        """
        if not trigger_data or (active_session_id and active_session_id.startswith('error-')):
            raise dash.exceptions.PreventUpdate

        new_messages = messages_data.copy()
        new_sessions = sessions_data.copy() if sessions_data is not None else {}

        payload = {
            "app_name": api_client.APP_NAME,
            "user_id": user_id,
            "session_id": active_session_id,
            "new_message": {"role": "user", "parts": [{"text": trigger_data['user_input']}]}
        }

        # The agent may respond with multiple messages. The thinking indicator
        # should be displayed until all messages have been received.
        for data, error in api_client.stream_agent_response(payload):
            if error:
                if active_session_id not in new_messages:
                    new_messages[active_session_id] = []
                new_messages[active_session_id].append({"role": "assistant", "author": "Error", "content": error})
                break # Stop processing on error

            events = data if isinstance(data, list) else [data]
            parsed_messages, session_title = _parse_events_to_messages(events)

            if session_title:
                new_sessions[active_session_id] = session_title
            
            if parsed_messages:
                if active_session_id not in new_messages:
                    new_messages[active_session_id] = []
                new_messages[active_session_id].extend(parsed_messages)

            set_progress((new_messages, new_sessions))
        
        # Remove the thinking message after the stream is complete
        if active_session_id in new_messages:
            new_messages[active_session_id] = [m for m in new_messages[active_session_id] if m.get('role') != 'thinking']

        return new_messages, new_sessions, False

    @app.callback(
        Output("profile-modal", "is_open"),
        [Input("fetch-profile-btn", "n_clicks"),
         Input("fetch-profile-cancel-btn", "n_clicks"),
         Input("fetch-profile-ok-btn", "n_clicks"),
         Input("wikitree-profile-id-input", "n_submit")],
        [State("profile-modal", "is_open")],
        prevent_initial_call=True,
    )
    def toggle_profile_modal(n1, n2, n3, n4, is_open):
        if n1 or n2 or n3 or n4:
            return not is_open
        return is_open

    app.clientside_callback(
        """
        function(is_open) {
            if (is_open) {
                setTimeout(function() {
                    var input = document.getElementById('wikitree-profile-id-input');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 100);
            }
            return window.dash_clientside.no_update;
        }
        """,
        Output('wikitree-profile-id-input', 'className', allow_duplicate=True),
        Input('profile-modal', 'is_open'),
        prevent_initial_call=True
    )
