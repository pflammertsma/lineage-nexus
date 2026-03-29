from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime
import json
from google import genai
from google.genai import types

# Import tools
from tools.openarchieven import open_archives_search, open_archives_get_record
from tools.wikitree import search_profiles, get_full_profile, get_person_info, get_relatives_info
from tools.biography import format_wikitree_biography

def get_ts():
    return datetime.now().strftime("%H:%M:%S")

SYSTEM_INSTRUCTION = """
You are the **Lineage Nexus Heritage Research Orchestrator**. Your primary role is to conduct professional
genealogical research in the Netherlands using archival and WikiTree tools.

### RESEARCH PROTOCOL
1. **IDENTIFY**: Extract names, dates, and locations from user queries.
2. **SEARCH**: Use `open_archives_search` for records or `search_profiles` for WikiTree IDs.
3. **READ**: Use `open_archives_get_record` or `get_full_profile` to fetch detailed data.
4. **ANALYZE**: Correlate data across multiple records to resolve ambiguities.
5. **FORMAT**: When you have sufficient data and the user wants a profile, you MUST invoke the `format_wikitree_biography` tool.

### GUIDELINES
- Be factual and cite your sources.
- Handle Dutch patronymics (before 1811) with care.
- If a specific individual is found, use that as the primary research subject.
- **NEVER** attempt to format the final biography yourself. Always delegate to the `format_wikitree_biography` tool, as it holds the critical formatting standards.
"""

class ResearchOrchestrator:
    def __init__(self, client: genai.Client, model_name: str = "gemini-flash-latest"):
        self.client = client
        self.model_name = model_name

    async def chat(self, message: str, history: List[Dict[str, str]] = []) -> AsyncGenerator[Any, None]:
        # Convert simple history format to Gemini's expected Content format
        contents = []
        for turn in history:
            contents.append(types.Content(
                role=turn["role"],
                parts=[types.Part.from_text(text=turn["content"])]
            ))
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

        # Tool mapping
        tools = [
            open_archives_search, 
            open_archives_get_record, 
            search_profiles, 
            get_full_profile, 
            get_person_info, 
            get_relatives_info
        ]
        
        # We define the formatting tool dynamically to give it access to the client
        async def format_biography(research_data: str) -> str:
            """Converts complex research artifacts into a high-fidelity WikiTree biography using specialized instructions."""
            return await format_wikitree_biography(self.client, self.model_name, research_data)

        tool_map = {f.__name__: f for f in tools}
        tool_map["format_biography"] = format_biography
        
        # Add the shim to the tools list for the model to see
        all_tools = tools + [format_biography]

        current_history = contents
        max_turns = 10
        turn_count = 0
        
        print(f"[{get_ts()}] DEBUG: Starting research orchestration for query: '{message}'")
        yield {"status": "Formulating research plan..."}
        
        while turn_count < max_turns:
            turn_count += 1
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=current_history,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=all_tools,
                    temperature=0.0
                )
            )

            current_history.append(response.candidates[0].content)
            function_calls = [p.function_call for p in response.candidates[0].content.parts if p.function_call]
            
            if not function_calls:
                print(f"[{get_ts()}] DEBUG: Received final response. Text: {response.text}")
                yield {
                    "response": response.text or "",
                    "usage": response.usage_metadata.model_dump() if response.usage_metadata else {}
                }
                return

            tool_parts = []
            for fc in function_calls:
                status = f"Searching: {fc.name} (args: {fc.args})"
                print(f"[{get_ts()}] DEBUG: [Turn {turn_count}] {status}")
                yield {"status": status}
                
                tool_func = tool_map.get(fc.name)
                if tool_func:
                    yield {"status": f"Accessing records via {fc.name}..."}
                    try:
                        result = await tool_func(**fc.args)
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
                        yield {"status": f"Analyzing results from {fc.name}..."}
                    except Exception as e:
                        print(f"[{get_ts()}] ERROR: Tool {fc.name} failed: {e}")
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": str(e)}))
            
            current_history.append(types.Content(role="user", parts=tool_parts))
