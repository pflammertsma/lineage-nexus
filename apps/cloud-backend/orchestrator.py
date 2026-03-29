from typing import List, Dict, Any, AsyncGenerator
import asyncio
from google import genai
from google.genai import types
from tools.openarchieven import open_archives_search, open_archives_get_record
from tools.wikitree import search_profiles, get_full_profile, get_person_info, get_relatives_info
from tools.biography import format_wikitree_biography
from tools.utils import get_ts

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

## ARCHIVAL RESEARCH STRATEGY (OpenArchieven)
You are an expert at searching `openarchieven.nl`. Follow these strict technical rules:

### 1. URL & Record Handling
- If a user provides a direct permalink (e.g., `https://www.openarchieven.nl/hga:123...`), immediately use `open_archives_get_record` to fetch it.
- You do NOT need to "get" a record if it was already returned in a `open_archives_search` result.

### 2. Query Syntax (The `query` parameter)
- **Names & Years**: Standard format is `"[Name] [Year/Range]"`.
- **Combining People**:
    - `[Name1] &~& [Name2]`: Fuzzy AND (precisely between two people). Highly recommended for marriages or parent/child combos.
    - `[Name1] & [Name2] & [Name3]`: Narrow AND. Never search for more than 3 names.
- **Special Markers**:
    - `~[Name]`: Phonetic search.
    - `>[Name]`: Exact surname match.
    - `K*sper` / `N??kerk`: Wildcards for spelling variations (common in Dutch records).
- **Prohibitions**: **NEVER** include place names or event types inside the `query` string. Use the specific `eventplace` or `eventtype` parameters instead.

### 3. Historical Nuance (Pre-1811)
- **Patronymics**: Before 1811, surnames were not fixed. A child "Jan" son of "Hendrik Lammerts" is indexed as "Jan" with father "Hendrik Lammerts". 
- **Strategy**: Search for `[ChildName] & [FatherName]` (e.g., `Jan & Hendrik 1780-1795`) for baptism records. Surnames in pre-1811 baptism queries often result in zero matches.

### 4. Search Iteration
- **Broad to Narrow**: Start broad (names only). If >30 results, add a year range. If still too many, add a parent or spouse name using `&~&`.
- **Event Types**: Only filter by `eventtype` (`Geboorte`, `Huwelijk`, `Overlijden`) if you are sifting through a massive number of results.

## WIKITREE RESEARCH STRATEGY
Before doing anything, you must ensure that you have some basic information about the profile
you were asked to find. You must therefore first invoke the `get_profile` function to fetch
basic information about the person.

For example, if you are simply provided with the WikiTree ID "Slijt-6", you must use the
`get_profile` function as follows:

    get_profile({"Name": "Slijt-6", "fields": ["Name", "FirstName", "LastNameAtBirth", "BirthDate", "DeathDate", "Father", "Mother", "Bio"]})

You will not even be able to understand what a person's name is without this information.

These are all the known fields for requests and responses in the WikiTree API:

| Field                   | Description                                                       |
|-------------------------|-------------------------------------------------------------------|
| Id                      | The user ID, which is a numeric identifier                        |
| Name                    | The WikiTree ID, with spaces replaced by underscores as in an URL |
| FirstName               | First Name                                                        |
| MiddleName              | Middle Name                                                       |
| MiddleInitial           | First letter of Middle Name                                       |
| LastNameAtBirth         | Last name at birth, used for WikiTree ID                          |
| LastNameCurrent         | Current last name                                                 |
| Nicknames               | Nicknames                                                         |
| LastNameOther           | Other last names                                                  |
| RealName                | The "Preferred" first name of the profile                         |
| Prefix                  | Prefix                                                            |
| Suffix                  | Suffix                                                            |
| BirthDate               | The date of birth, YYYY-MM-DD. Month and Day may be zeros.        |
| DeathDate               | The date of death, YYYY-MM-DD. Month and Day may be zeros.        |
| BirthLocation           | Birth location                                                    |
| DeathLocation           | Death location                                                    |
| BirthDateDecade         | Date of birth rounded to a decade, e.g. 1960s                     |
| DeathDateDecade         | Date of death rounded to a decade, e.g. 1960s                     |
| Gender                  | Male or Female                                                    |
| IsLiving                | 1 if the person is considered "living", 0 otherwise               |
| Father                  | The `Id` of the father. 0 if empty. Null if private.              |
| Mother                  | The `Id` of the mother. 0 if empty. Null if private.              |
| HasChildren             | 1 if the profile has at least one child                           |
| NoChildren              | 1 if the "No more children" box is checked                        |
| IsRedirect              | 1 if the profile is a redirection to another profile              |
| DataStatus              | Array of "guess", "certain", etc. flags for the data fields.      |
| PhotoData               | Detailed info for the primary photo. Implies the Photo field.     |
| Connected               | 1 if connected to the global family tree, 0 if unconnected        |
| Bio                     | The biography text (not included by default, see bioFormat param) |
| IsMember                | True/1 if the profile is an active WikiTree member, else false/0  |
| EditCount               | The contribution count of the user/profile.                       |

Take careful note that `Id` is a numeric identifier used between records, whereas `Name` is the
WikiTree ID, which is alphanumeric and used primarily for URLs.

Whenever querying the WikiTree API, you must include the list of fields you want to retrieve.
For example, to retrieve the WikiTree ID, and basic information about a person, you would
include these fields:
    fields: ["Name", "FirstName", "LastNameAtBirth", "BirthDate", "DeathDate"]

You must always prefer using `Name` to reference profiles. These are the WikiTree IDs. For
example, `Slijt-6` is the WikiTree ID profile in the URL https://www.wikitree.com/wiki/Slijt-6.

The most relevant fields for genealogical profiles are:
- Name (this is the WikiTree ID)
- FirstName
- LastNameAtBirth
- Gender
- BirthDate
- DeathDate
- Mother
- Father
- Bio

Note: In dates, month and day may be zeros if they are unknown. For example, 1842-03-00 means
"March, 1842" where the exact date is unknown.

The following functions are available to you:
- `search_profiles`: Search for profiles in order to find their WikiTree IDs.
- `get_person_info`: Resolve the WikiTree ID (`Name`) of a profile by its `Id`.
- `get_profile`: Retrieve a profile by WikiTree ID (`Name`).
- `get_relatives_info`: Retrieve the relatives of a profile.

SEARCHING FOR PROFILES
----------------------

Invoke `search_profiles` with a JSON dictionary containing keys matching the following
parameters:
- Search parameters within any number of the following fields:
    - `FirstName`: First Name
    - `LastName`: Last Name
    - `BirthDate`: Birth Date (YYYY-MM-DD)
    - `DeathDate`: Death Date (YYYY-MM-DD)
    - `RealName`: Real/Preferred Name
    - `LastNameCurrent`: Current Last Name
    - `BirthLocation`: Birth Location
    - `DeathLocation`: Death Location
    - `Gender`: Gender (Male, Female)
    - `fatherFirstName`: Father's First Name
    - `fatherLastName`: Father's Last Name
    - `motherFirstName`: Mother's First Name
    - `motherLastName`: Mother's Last Name
    - `limit`: Number of results to return (1-100, default 10)
    - `fields`: Comma-delimited list of profile data fields to retrieve.
- `limit`: The maximum number of results to return (default is 10, max is 100)
- `fields`: A list of fields that you want to retrieve from the API from the table above. 

Here's an example of how to invoke `search_profiles` to search for a profile for "Migchiel Slijt":
```
search_profiles({
    "FirstName": "Migchiel",
    "LastName": "Slijt",
    "fields": ["Name", "FirstName", "LastNameAtBirth", "BirthDate", "DeathDate"]
})
```

WikiTree is NOT a source of truth. Profiles may be inaccurate, incomplete or outright wrong.
You mustn't assume that the profile data is accurate unless explicitly instructed or you have
validated data against records from the researcher agent.

Whenever you are asked to read a profile or are provided a WikiTree URL, assume that the data
from that source has changed and you must read its contents again. Generally assume that
profiles are constantly being updated and should be read from WikiTree again periodically.
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
        async def format_biography(research_data: str, user_instructions: str = None) -> str:
            """
            Converts complex research artifacts into a high-fidelity WikiTree biography.
            Pass 'user_instructions' if the user has specific formatting requests (e.g. 'translate to Dutch' or 'be more concise').
            """
            return await format_wikitree_biography(self.client, self.model_name, research_data, user_instructions)

        tool_map = {f.__name__: f for f in tools}
        tool_map["format_biography"] = format_biography
        
        # Add the shim to the tools list for the model to see
        all_tools = tools + [format_biography]

        current_history = contents
        max_turns = 10
        turn_count = 0
        
        print(f"[{get_ts()}] DEBUG: Starting research orchestration for query: '{message}'")
        yield {"status": "Formulating research plan..."}
        
        from tools.utils import register_status_queue, unregister_status_queue
        status_queue = asyncio.Queue()
        register_status_queue(status_queue)
        
        try:
            while turn_count < max_turns:
                turn_count += 1
                yield {"status": f"Consulting lineage engine (Turn {turn_count})..."}
                
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
                    status = f"Invoking: {fc.name} (args: {fc.args})"
                    print(f"[{get_ts()}] DEBUG: [Turn {turn_count}] {status}")
                    yield {"status": status}
                    
                    tool_func = tool_map.get(fc.name)
                    if tool_func:
                        # Wrap tool call to also consume any status updates triggered inside it
                        tool_task = asyncio.create_task(tool_func(**fc.args))
                        
                        while not tool_task.done():
                            # Check if any tool-internal status messages have arrived
                            try:
                                # Non-blocking check for status queue
                                while not status_queue.empty():
                                    msg = await status_queue.get()
                                    yield {"status": msg}
                            except Exception: pass
                            await asyncio.sleep(0.1) # Yield control
                        
                        try:
                            result = await tool_task
                            tool_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
                            # Final drain of queue after tool finishes
                            while not status_queue.empty():
                                msg = await status_queue.get()
                                yield {"status": msg}
                        except Exception as e:
                            print(f"[{get_ts()}] ERROR: Tool {fc.name} failed: {e}")
                            tool_parts.append(types.Part.from_function_response(name=fc.name, response={"error": str(e)}))
                
                current_history.append(types.Content(role="user", parts=tool_parts))
        finally:
            unregister_status_queue()
