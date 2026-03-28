from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from google.adk.agents import Agent
from google.adk.tools import google_search
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

search_agent = Agent(
    model=MODEL_FAST,
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2, # More deterministic output
        #max_output_tokens=250 # FIXME Setting restrictions on output tokens is causing the agent not to output anything at all
    ),
    name="search_agent",
    instruction="""
    You're a specialist in Google Search.
    """,
    tools=[google_search],
)

search_tool = AgentTool(search_agent)
