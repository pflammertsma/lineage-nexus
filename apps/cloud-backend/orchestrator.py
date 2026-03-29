from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
import json

# Import tools
from tools.openarchieven import open_archives_search, open_archives_get_record
from tools.wikitree import search_profiles, get_full_profile, get_person_info, get_relatives_info

SYSTEM_INSTRUCTION = """
You are the Lineage Nexus Heritage Research Orchestrator. Your role is to conduct professional
genealogical research in the Netherlands using archival and WikiTree tools.

RESEARCH PROTOCOL:
1.  IDENTIFY: Extract names, dates, and locations from user queries.
2.  SEARCH: Use `open_archives_search` for records or `search_profiles` to find existing WikiTree IDs.
3.  READ: Use `open_archives_get_record` or `get_full_profile` to fetch detailed data for records/IDs found.
4.  ANALYZE: Infer birth years, relationships, and fill knowledge gaps.
5.  FORMAT: Present information in a clear, archival structure.

GUIDELINES:
- Be factual and cite your sources (OpenArchieven or WikiTree IDs).
- Handle Dutch patronymics (before 1811) with care.
- If a user provides an OpenArchieven URL, read it immediately.
- If a specific individual is found, use that as the primary research subject.
- Assume the ultimate goal is ensuring a complete lineage for a WikiTree profile.

TOOL USAGE:
- `open_archives_search`: Best for finding birth, marriage, and death records.
- `search_profiles`: Use this to see if the person already has a WikiTree presence.
- `get_full_profile`: Fetches bio, siblings, spouses, and parents for a WikiTree ID.
"""

class ResearchOrchestrator:
    def __init__(self, client: genai.Client, model_name: str = "gemini-flash-latest"):
        self.client = client
        self.model_name = model_name

    async def chat(self, message: str, history: List[Dict[str, str]] = []) -> Any:
        # Convert simple history format to Gemini's expected Content format
        contents = []
        for turn in history:
            contents.append(types.Content(
                role=turn["role"],
                parts=[types.Part.from_text(text=turn["content"])]
            ))
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

        # Tool mapping
        tools = [open_archives_search, open_archives_get_record, search_profiles, get_full_profile, get_person_info, get_relatives_info]
        tool_map = {f.__name__: f for f in tools}

        current_history = contents
        max_turns = 10
        turn_count = 0
        
        while turn_count < max_turns:
            turn_count += 1
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=current_history,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=tools,
                    temperature=0.0
                )
            )

            current_history.append(response.candidates[0].content)
            function_calls = [p.function_call for p in response.candidates[0].content.parts if p.function_call]
            
            if not function_calls:
                yield {
                    "response": response.text or "",
                    "usage": response.usage_metadata.model_dump() if response.usage_metadata else {}
                }
                return

            tool_parts = []
            for fc in function_calls:
                status = f"Searching: {fc.name} (args: {fc.args})"
                yield {"status": status}
                
                tool_func = tool_map.get(fc.name)
                if tool_func:
                    try:
                        result = await tool_func(**fc.args)
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
                    except Exception as e:
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": str(e)}))
            
            current_history.append(types.Content(role="user", parts=tool_parts))
