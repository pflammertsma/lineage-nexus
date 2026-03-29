from typing import List, Dict, Any, AsyncGenerator
import asyncio
from google import genai
from google.genai import types
from tools.openarchieven import open_archives_search, open_archives_get_record, OPEN_ARCHIVES_INSTRUCTIONS
from tools.wikitree import search_profiles, get_full_profile, get_person_info, get_relatives_info, WIKITREE_INSTRUCTIONS
from tools.biography import format_wikitree_biography
from tools.utils import get_ts

ROOT_STRATEGY = """
You are the **Lineage Nexus Heritage Research Orchestrator**. Your primary role is to conduct professional
genealogical research in the Netherlands using archival and WikiTree tools.

### RESEARCH PROTOCOL
1. **IDENTIFY**: Extract names, dates, and locations from user queries.
2. **SEARCH**: Use archival/WikiTree tools to find matches.
3. **READ**: Fetch full record text or profile biographies.
4. **ANALYZE**: Correlate across multiple sources.
5. **FORMAT**: Delegate the final biography to the `format_biography` tool.

### SEARCH INTELLIGENCE (Strict Rules)
- **STRICT CALL LIMIT**: **NEVER** make more than **2** search calls in a single turn. Wait for results before refining.
- **FUZZY LOGIC (&~&)**: The `&~&` operator is **already fuzzy**. Do NOT make parallel calls for minor spelling variations (e.g., `Klases` vs `Klazes`) if using `&~&`. One broad fuzzy call is enough.
- **ZERO RESULT PROTOCOL**: If a search returns 0 results, **DO NOT** refine it with years/locations. BROADEN it instead (e.g., remove the year range or use wildcards).
- **WIKITREE FIRST**: Always check WikiTree first to resolve known profile info before starting archive searches.

### GUIDELINES
- Be factual and cite your sources.
- **NEVER** format the final biography without using the `format_biography` tool.
- Use archival records to validate WikiTree claims.
"""

# Assemble the full instruction set from modular skill components
SYSTEM_INSTRUCTION = ROOT_STRATEGY + "\n" + OPEN_ARCHIVES_INSTRUCTIONS + "\n" + WIKITREE_INSTRUCTIONS

class ResearchOrchestrator:
    def __init__(self, client: genai.Client, model_name: str = "gemini-flash-latest"):
        self.client = client
        self.model_name = model_name

    async def chat(self, message: str, history: List[Dict[str, Any]]) -> AsyncGenerator[Dict[str, Any], None]:
        """Entry point for the chat session, managing the dual-task status consumer loop."""
        print(f"[{get_ts()}] DEBUG: Starting research orchestration for query: '{message}'")
        
        from tools.utils import register_status_queue, unregister_status_queue, report_status
        status_queue = asyncio.Queue()
        register_status_queue(status_queue)
        
        try:
            # Start the actual research as a background task
            research_task = asyncio.create_task(self._conduct_research(message, history))
            register_status_queue(status_queue, task=research_task)

            import time
            last_yield_time = time.time()
            # Consume all status/result updates while research is running
            while not research_task.done():
                try:
                    # Non-blocking drain of the queue
                    while not status_queue.empty():
                        msg = await status_queue.get()
                        yield {"status": msg}
                        last_yield_time = time.time()
                    
                    # Heartbeat if we haven't yielded in a while (e.g., during model inference)
                    if time.time() - last_yield_time > 5.0:
                        yield {"status": "Still analyzing research artifacts..."}
                        last_yield_time = time.time()
                        
                except Exception: pass
                await asyncio.sleep(0.1)
                
            # Final drain and return the result
            while not status_queue.empty():
                msg = await status_queue.get()
                yield {"status": msg}
                
            final_result = await research_task
            yield final_result
            
        finally:
            unregister_status_queue()

    async def _conduct_research(self, message: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Internal research logic that reports status via 'report_status'."""
        from tools.utils import report_status
        await report_status("Formulating research plan...")
        
        current_history = [types.Content(role=msg["role"], parts=[types.Part.from_text(text=msg["content"])]) for msg in history]
        current_history.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))
        
        turn_count = 0
        max_turns = 4
        
        all_tools = [
            open_archives_search, 
            open_archives_get_record, 
            search_profiles, 
            get_full_profile, 
            get_person_info, 
            get_relatives_info
        ]
        
        tool_map = {f.__name__: f for f in all_tools}
        
        # Specialist shim for biography formatting
        async def format_biography(research_data: str, user_instructions: str = None) -> str:
            """Converts complex research artifacts into a high-fidelity WikiTree biography."""
            return await format_wikitree_biography(self.client, self.model_name, research_data, user_instructions)
        
        all_tools.append(format_biography)
        tool_map["format_biography"] = format_biography

        while turn_count < max_turns:
            turn_count += 1
            await report_status(f"Consulting lineage engine (Turn {turn_count})...")
            
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
                return {
                    "response": response.text or "",
                    "usage": response.usage_metadata.model_dump() if response.usage_metadata else {}
                }

            tool_parts = []
            for fc in function_calls:
                await report_status(f"Invoking {fc.name}...")
                
                tool_func = tool_map.get(fc.name)
                if tool_func:
                    try:
                        # For tools, we need to ensure they are also registered (unless done in create_task)
                        # but here we just call them directly as part of this research task.
                        result = await tool_func(**fc.args)
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
                    except Exception as e:
                        print(f"[{get_ts()}] ERROR: Tool {fc.name} failed: {e}")
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": str(e)}))
            
            current_history.append(types.Content(role="user", parts=tool_parts))
            
        # If we hit the turn limit, force a final summary response
        await report_status("Synthesizing final research report...")
        final_response = await self.client.aio.models.generate_content(
            model=self.model_name,
            contents=current_history + [types.Content(role="user", parts=[types.Part.from_text(text="I've reached my maximum research turns. Summarize everything found so far and explain the logical links between the identified individuals.")])],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.0
            )
        )
        return {
            "response": f"(Maximum research turns reached) {final_response.text}",
            "usage": final_response.usage_metadata.model_dump() if final_response.usage_metadata else {}
        }
