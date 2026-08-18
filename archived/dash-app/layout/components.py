import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import uuid
import json
from typing import Any, List, Optional

def AuthorLine(author: str) -> html.Div:
    """Creates the author line component."""
    return html.Div(author, className="small text-secondary mb-1")

def FormattedText(content: str) -> List[Any]:
    if "```" in content:
        parts = content.split("```", 1)
        main_message = parts[0]
        code_block_part = parts[1]
        code = "" # Initialize code

        if code_block_part:
            # The language is the first line, code is the rest
            code_parts = code_block_part.split('\n', 1)
            if len(code_parts) > 1:
                # remove the trailing ```
                code = code_parts[1].rsplit('```', 1)[0]
        
        return [dcc.Markdown(main_message), html.Pre(html.Code(code.strip()))]

    else:
        # Default rendering for simple messages
        return [dcc.Markdown(content)]

def SystemMessage(content: str, with_spinner: bool = False) -> html.Div:
    """A component to render a system message."""
    if with_spinner:
        children = [dbc.Spinner(), html.Span(content, className="ms-2")]
        return html.Div(children, className="d-flex justify-content-center align-items-center h-100")
    
    formatted_content = FormattedText(content)
    
    # Check if there is a code block
    if len(formatted_content) > 1:
        main_message, code_block = formatted_content
        accordion = dbc.Accordion([
            dbc.AccordionItem(code_block, title="Error details"),
        ], start_collapsed=True, className="mb-2 w-75 system-message-accordion")
        return html.Div([main_message, accordion], className="system-message-container")
    else:
        return html.Div(formatted_content, className="d-flex justify-content-center align-items-center h-100")
    
def UserChatBubble(content: str) -> dbc.Alert:
    """A component to render a user chat bubble."""
    return dbc.Alert(
        FormattedText(content),
        color="primary",
        style={
            "width": "fit-content",
            "maxWidth": "80%",
            "marginLeft": "auto",
            "marginRight": "0",
        },
        className="mb-2",
    )

def AgentChatBubble(content: str, author_line: Optional[html.Div] = None) -> html.Div:
    """A component to render an agent chat bubble."""
    return html.Div([
        author_line,
        dbc.Alert(
            FormattedText(content),
            color="secondary",
            style={
                "maxWidth": "80%",
                "marginLeft": "0",
                "marginRight": "auto",
            },
            className="mb-2",
        )
    ])

def Wikitext(wikitext: str) -> html.Div:
    """A custom component to render wikitext with syntax highlighting."""
    return html.Div(
        children=[
            html.Pre(html.Code(wikitext))
        ],
        className="highlight-container",
        style={"position": "relative"}
    )

def WikitextBubble(content: str, author_line: Optional[html.Div] = None) -> html.Div:
    """A component to render a wikitext bubble."""
    parts = content.split("```wiki")
    children = []
    for part in parts:
        children.append(Wikitext(part.strip("\n```")))
    return html.Div([
        author_line,
        dbc.Alert(
            children,
            color="secondary",
            style={
                "maxWidth": "80%",
                "marginLeft": "0",
                "marginRight": "auto",
            },
            className="mb-2",
        )
    ])

def AgentTransferLine(author: str, tool_name: str, tool_input: str) -> html.Div:
    """A component to render an agent transfer line."""
    try:
        tool_input_json = json.loads(tool_input)
        agent_name = tool_input_json.get('agent_name', 'Agent')
        
        children = [
            html.Span(author),
            html.I(className="bi bi-arrow-right mx-2"),
            html.Span(agent_name, className="fw-bold")
        ]
        
    except json.JSONDecodeError:
        children = [
            html.I(className="bi bi-arrow-right-circle me-2"),
            "Transfer to Agent"
        ]
        
    return html.Div(children, className="small text-secondary mb-1 d-flex align-items-center")

def ToolCallBubble(tool_name: str, tool_input: str, author_line: Optional[html.Div] = None) -> html.Div:
    """A component to render a tool call bubble."""
    title = html.Div([
        html.I(className="bi bi-lightning-fill me-2"),
        tool_name
    ])
    if tool_name == 'transfer_to_agent':
        # Note that this is no longer expected to be used in favor of AgentTransferLine
        try:
            tool_input_json = json.loads(tool_input)
            agent_name = tool_input_json.get('agent_name', 'Agent')
            title = html.Div([
                html.I(className="bi bi-arrow-right-circle me-2"),
                html.Span(agent_name, className="fw-bold")
            ])
        except json.JSONDecodeError:
            title = html.Div([
                html.I(className="bi bi-arrow-right-circle me-2"),
                "Transfer to Agent"
            ])
    else:
        try:
            loaded_input = json.loads(tool_input)
            if isinstance(loaded_input, dict):
                inner_json_string = loaded_input.get('json_str')
                if isinstance(inner_json_string, str):
                    parsed_inner_json = json.loads(inner_json_string)
                    tool_input = json.dumps(parsed_inner_json, indent=2)
        except (json.JSONDecodeError, TypeError):
            pass

    accordion = dbc.Accordion([
        dbc.AccordionItem(
            html.Pre(html.Code(tool_input)),
            title=title
        ),
    ], start_collapsed=True, className="mb-2 w-75 tool-call-accordion")
    return html.Div([author_line, accordion])

def ToolResponseBubble(author: str, tool_name: str, tool_output: str, author_line: Optional[html.Div] = None) -> html.Div:
    """A component to render a tool response bubble."""
    title = html.Div([
        html.I(className="bi bi-check-circle-fill me-2"),
        tool_name
    ])

    accordion = dbc.Accordion([
        dbc.AccordionItem(
            html.Pre(html.Code(tool_output)),
            title=title
        ),
    ], start_collapsed=True, className="mb-2 w-75 tool-response-accordion")
    return html.Div([author_line, accordion])

def ErrorBubble(main_message: str, details: str, author_line: Optional[html.Div] = None) -> html.Div:
    """A component to render an error bubble with an accordion."""
    title = html.Div([
        html.I(className="bi bi-exclamation-triangle-fill me-2 text-danger"), # Error icon
        main_message
    ])

    accordion = dbc.Accordion([
        dbc.AccordionItem(
            html.Pre(html.Code(details)),
            title=title
        ),
    ], start_collapsed=True, className="mb-2 w-75 error-accordion")
    return html.Div([author_line, accordion])

def ThinkingBubble() -> html.Div:
    """A component to render a thinking bubble."""
    return html.Div([
        dbc.Alert(
            html.Div(className="dot-flashing"),
            color="transparent",
            style={
                "maxWidth": "80%",
                "marginLeft": "0",
                "marginRight": "auto",
            },
            className="mb-2",
        )
    ])
