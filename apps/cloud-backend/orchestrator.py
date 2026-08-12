from typing import List, Dict, Any, AsyncGenerator, Optional
import asyncio
import re
import json
from google import genai
from google.genai import types
from tools.openarchieven import open_archives_search, open_archives_get_record, OPEN_ARCHIVES_INSTRUCTIONS
from tools.wikitree import search_profiles, get_profile, get_person, get_relatives, WIKITREE_INSTRUCTIONS
from tools.holocaust import joods_monument_search, joods_monument_get_document, oorlogsbronnen_search, oorlogsbronnen_get_document, HOLOCAUST_INSTRUCTIONS
from tools.biography import format_wikitree_biography
from tools.utils import get_ts, generate_with_quota_retry

ROOT_STRATEGY = """
You are the **Lineage Nexus Heritage Research Orchestrator**. Your primary role is to conduct professional
genealogical research in the Netherlands using archival, WikiTree, and WWII / Holocaust research tools.

### RESEARCH PROTOCOL
1. **IDENTIFY**: Extract names, dates, and locations from user queries.
2. **SEARCH**: Use archival/WikiTree/Holocaust tools to find matches.
3. **READ**: Fetch full record text or profile biographies.
4. **ANALYZE**: Correlate across multiple sources.
5. **FORMAT**: Delegate the final biography to the `format_biography` tool.

### SEARCH INTELLIGENCE (Strict Rules)
- **STRICT CALL LIMIT**: **NEVER** make more than **2** search calls in a single turn. Wait for results before refining.
- **FUZZY LOGIC (&~&)**: The `&~&` operator is **already fuzzy**. Do NOT make parallel calls for minor spelling variations (e.g., `Klases` vs `Klazes`) if using `&~&`. One broad fuzzy call is enough.
- **CHRONOLOGY**: **NEVER** search for years before 1500 or after the current year. Most Dutch registers begin in the late 1500s.
- **ZERO RESULT PROTOCOL**: If a search returns 0 results, **DO NOT** refine it with different years. BROADEN it instead by **REMOVING** the year range or location. **NEVER** iterate backwards through history in sliding windows (e.g., 1700, then 1600, then 1500).
- **WIKITREE FIRST**: Always check WikiTree first to resolve known profile info before starting archive searches.

### GUIDELINES
- Be factual and cite your sources.
- **NEVER** format the final biography without using the `format_biography` tool.
- **REPRODUCE THE BIOGRAPHY VERBATIM**: when you present the result of `format_biography`, copy
  it character for character inside a ```wiki code block. Do not rewrite, reformat, summarise or
  tidy it. In particular it ends with an HTML comment beginning `<!-- LINEAGE_NEXUS_DATA:` —
  that comment is machine-readable data used to fill in the WikiTree profile, and it MUST be
  included, unaltered, as the last line inside the code block. Deleting it silently discards
  the entire profile's structured data.
- Use archival records to validate WikiTree claims.
"""

MAX_SEARCH_PER_TURN = 2
MAX_RESEARCH_TURNS = 6

# A session is about a person, so the sidebar should name that person and nothing
# else. Asking for a "2-5 word title" invited the model to fill the word budget
# with task nouns — "Annigje Jans Research", "Annigje Jans Profile Creation".
TITLE_PROMPT = """Identify the person this genealogical research session is about.

Respond with ONLY that person's name, spelled as it appears in the research. Nothing else.

Rules:
- NEVER append a task or activity word. Not "Research", "Profile", "Profile Creation",
  "Biography", "Analysis", "Lookup", "Investigation", "Records" or anything similar.
- No dates, no places, no quotation marks, no trailing punctuation.
- If several people appear, name the primary subject of the research.
- Only if no individual can be identified at all, reply with a two- to four-word
  description of the topic instead.

Good: Annigje Jans
Good: Jan Lammertsma
Bad: Annigje Jans Research
Bad: Profile Creation for Annigje Jans

Context:
{context}"""

# The instruction above does most of the work, but models still occasionally tack a
# task word on, so strip trailing ones as a backstop.
_TITLE_SUFFIX_NOISE = re.compile(
    r"\s*[-–—:,]?\s*\b("
    r"research|profile creation|profile|biography|bio|analysis|lookup|"
    r"investigation|records?|genealogy|session|summary|report"
    r")\b\s*$",
    re.IGNORECASE,
)

def clean_session_title(raw: str) -> str:
    """Reduces a generated title to just the subject's name."""
    title = (raw or "").strip().replace("*", "").strip("\"'`")
    # Repeat to catch stacked suffixes such as "Annigje Jans Profile Research".
    for _ in range(3):
        stripped = _TITLE_SUFFIX_NOISE.sub("", title).strip()
        if stripped == title:
            break
        title = stripped
    title = title.strip(" -–—:,")
    # If the response was nothing but a task word, keep the original rather than
    # yielding an empty sidebar entry.
    return title or (raw or "").strip().replace("*", "").strip("\"'`")

# The biography the user sees is written by the orchestrator, which re-transcribes the
# `format_biography` tool result into its reply. The specialist formatter reliably emits the
# LINEAGE_NEXUS_DATA comment, but the orchestrator frequently drops it on the way through —
# it reads as machine noise worth tidying away. Losing it means the WikiTree extension gets
# no vitals at all, so restore it deterministically rather than relying on the model to copy
# faithfully.
_METADATA_RE = re.compile(r"<!--\s*LINEAGE_NEXUS_DATA:.*?-->", re.DOTALL)
_WIKI_FENCE_RE = re.compile(r"```wiki\b.*?```", re.DOTALL)

def restore_metadata_comment(response_text: str, formatted_biography: Optional[str]) -> str:
    """Re-attaches the formatter's metadata comment if the orchestrator omitted it.

    A reply may contain several biographies while only the most recent formatter output is
    held, so the target block is identified by the subject's name rather than by position.
    Attaching one person's vitals to another's profile would be far worse than attaching
    none, so anything ambiguous is left untouched.
    """
    if not response_text or not formatted_biography:
        return response_text

    source = _METADATA_RE.search(formatted_biography)
    if not source:
        return response_text                      # formatter produced none; nothing to restore
    comment = source.group(0).strip()

    # Only blocks that are missing a comment are candidates.
    candidates = [
        b for b in _WIKI_FENCE_RE.finditer(response_text)
        if not _METADATA_RE.search(b.group(0))
    ]
    if not candidates:
        return response_text

    # Narrow by the subject's name, which appears boldfaced in their own biography.
    try:
        payload = json.loads(source.group(0).split("LINEAGE_NEXUS_DATA:", 1)[1].rsplit("-->", 1)[0].strip())
        names = [str(payload.get(k, "")).strip() for k in ("firstName", "lastNameAtBirth")]
        names = [n for n in names if n]
    except Exception:
        names = []

    if names:
        # Compare against the boldfaced subject at the top of each biography rather than the
        # whole block, and on whole words: a plain substring test matches "Jan" inside
        # "Jantina", which would put the father's vitals on his daughter's profile.
        def is_subject(block_text: str) -> bool:
            bold = re.search(r"'''(.+?)'''", block_text)
            haystack = bold.group(1) if bold else block_text
            return all(re.search(rf"\b{re.escape(n)}\b", haystack) for n in names)

        matching = [b for b in candidates if is_subject(b.group(0))]
    else:
        matching = candidates

    # Exactly one unambiguous target, or we decline to guess.
    if len(matching) != 1:
        print(f"[{get_ts()}] WARN: metadata comment not restored; "
              f"{len(matching)} candidate biography blocks matched the subject.")
        return response_text

    target = matching[0]
    body = target.group(0)
    repaired = body[: body.rfind("```")].rstrip() + "\n\n" + comment + "\n```"
    return response_text[: target.start()] + repaired + response_text[target.end():]

# Assemble the full instruction set from modular skill components
SYSTEM_INSTRUCTION = ROOT_STRATEGY + "\n" + OPEN_ARCHIVES_INSTRUCTIONS + "\n" + WIKITREE_INSTRUCTIONS + "\n" + HOLOCAUST_INSTRUCTIONS

class ResearchOrchestrator:
    def __init__(self, client: genai.Client, model_name: str = "gemini-flash-latest", fallback_client: Optional[genai.Client] = None):
        from tools.utils import ClientHolder
        self.client_holder = ClientHolder(primary_client=client, fallback_client=fallback_client)
        self.model_name = model_name

    @property
    def client(self):
        return self.client_holder.active_client

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
                    if time.time() - last_yield_time > 30.0:
                        yield {"status": "Still analyzing research artifacts…"}
                        last_yield_time = time.time()
                        
                except Exception: pass
                await asyncio.sleep(0.1)
                
            # Final drain and return the result
            while not status_queue.empty():
                msg = await status_queue.get()
                yield {"status": msg}
                
            try:
                final_result = await research_task
                yield final_result
                
                # Post-research step: Generate a meaningful title if needed
                print(f"[{get_ts()}] STATUS: Generating research session title...")
                try:
                    # Compile a summary of history for title context
                    title_context = f"User Request: {message}\n"
                    if "response" in final_result:
                        title_context += f"Findings: {final_result['response'][:500]}..."
                    
                    # Intentionally not quota-retried: the research is already
                    # delivered and a title is cosmetic. Waiting here would
                    # spend the quota we are trying to conserve.
                    title_response = await self.client.aio.models.generate_content(
                        model=self.model_name,
                        contents=[types.Content(role="user", parts=[types.Part.from_text(text=TITLE_PROMPT.format(context=title_context))])],
                        config=types.GenerateContentConfig(temperature=0.0)
                    )

                    if title_response.candidates and title_response.candidates[0].content.parts:
                        title_text = "".join([p.text for p in title_response.candidates[0].content.parts if p.text])
                        clean_title = clean_session_title(title_text)
                        if clean_title:
                            yield {"title": clean_title}
                except Exception as e:
                    print(f"[{get_ts()}] DEBUG: Title generation failed (non-critical): {e}")

            except Exception as e:
                import traceback
                print(f"[{get_ts()}] CRITICAL: Research task failed:\n{traceback.format_exc()}")
                yield {"error": str(e), "retry": True}
            
        finally:
            unregister_status_queue()

    async def _conduct_research(self, message: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Internal research logic that reports status via 'report_status'."""
        from tools.utils import report_status
        await report_status("Formulating research plan…")
        
        # Filter history to only include 'user' and 'model' roles (Gemini requirement)
        valid_history = [msg for msg in history if msg["role"] in ["user", "model"]]
        current_history = [types.Content(role=msg["role"], parts=[types.Part.from_text(text=msg["content"])]) for msg in valid_history]
        current_history.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))
        
        turn_count = 0
        
        all_tools = [
            open_archives_search, 
            open_archives_get_record, 
            search_profiles, 
            get_person, 
            get_relatives,
            get_profile,
            joods_monument_search,
            joods_monument_get_document,
            oorlogsbronnen_search,
            oorlogsbronnen_get_document
        ]

        # The formatter's exact output, kept so the metadata comment can be restored if the
        # orchestrator drops it while re-transcribing the biography into its reply.
        formatter_output = {"text": None}

        # Specialist shim for biography formatting
        async def format_biography(research_data: str = "No research data provided", user_instructions: str = "Follow standard formatting") -> str:
            """
            Takes ALL raw genealogical research data gathered during previous turns (JSON, notes, records)
            and converts it into a high-fidelity WikiTree biography. Use this ONLY as the final step.
            """
            result = await format_wikitree_biography(self.client, self.model_name, research_data, user_instructions)
            formatter_output["text"] = result
            return result

        all_tools.append(format_biography)
        tool_map = {f.__name__: f for f in all_tools}

        search_tool_names = ["open_archives_search", "search_profiles", "joods_monument_search", "oorlogsbronnen_search"]

        seen_queries = set()
        while turn_count < MAX_RESEARCH_TURNS:
            turn_count += 1
            await report_status(f"Consulting lineage engine (Turn {turn_count})…")
            
            response = await generate_with_quota_retry(
                self.client_holder,
                model=self.model_name,
                contents=current_history,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=all_tools,
                    temperature=0.0
                )
            )

            current_candidate = response.candidates[0]
            current_history.append(current_candidate.content)
            function_calls = [p.function_call for p in current_candidate.content.parts if p.function_call]
            
            # Extract just the text parts safely
            response_text = "".join([p.text for p in current_candidate.content.parts if p.text])
            response_text = restore_metadata_comment(response_text, formatter_output["text"])

            if not function_calls:
                return {
                    "response": response_text or "I have completed my research.",
                    "usage": response.usage_metadata.model_dump() if response.usage_metadata else {}
                }

            await report_status(f"Invoking {len(function_calls)} tools…")

            # Enforce strict research limit per turn to prevent shotgunning
            search_calls = [fc for fc in function_calls if fc.name in search_tool_names]
            other_calls = [fc for fc in function_calls if fc.name not in search_tool_names]
            
            # Prioritize 'get_profile' over searches in the same turn if both are present
            if any(fc.name == "get_profile" for fc in other_calls) and search_calls:
                await report_status("Prioritizing WikiTree context over new archival searches…")
                search_calls = [] # Do not perform searches if we're also reading a profile for the first time
            
            # Cap research calls
            if len(search_calls) > MAX_SEARCH_PER_TURN:
                await report_status(f"Throttling research calls (Max {MAX_SEARCH_PER_TURN} per turn). {len(search_calls) - MAX_SEARCH_PER_TURN} redundant searches skipped.")
                search_calls = search_calls[:MAX_SEARCH_PER_TURN]

            active_calls = other_calls + search_calls
            tool_parts = []
            for fc in active_calls:
                # Deduplication check for search calls
                if fc.name in search_tool_names:
                    q_key = str(fc.args)
                    if q_key in seen_queries:
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": "Redundant query. Broaden your search or try a different source."}))
                        continue
                    seen_queries.add(q_key)

                await report_status(f"Invoking {fc.name}…")
                
                tool_func = tool_map.get(fc.name)
                if tool_func:
                    try:
                        result = await tool_func(**fc.args)
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
                    except Exception as e:
                        print(f"[{get_ts()}] ERROR: Tool {fc.name} failed: {e}")
                        tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": str(e)}))
                else:
                    tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": f"Tool '{fc.name}' not found."}))
            
            # Use the tool mapping results to generate the next response
            current_history.append(types.Content(role="user", parts=tool_parts))
            
        # If we hit the turn limit, force a final summary response
        await report_status("Synthesizing final research report…")
        final_response = await generate_with_quota_retry(
            self.client,
            model=self.model_name,
            contents=current_history + [types.Content(role="user", parts=[types.Part.from_text(text="I've reached my maximum research turns. Summarize everything found so far and explain the logical links between the identified individuals.")])],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.0
            )
        )
        return {
            "response": f"(Maximum research turns reached) {restore_metadata_comment(final_response.text, formatter_output['text'])}",
            "usage": final_response.usage_metadata.model_dump() if final_response.usage_metadata else {}
        }
