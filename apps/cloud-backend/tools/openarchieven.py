import httpx
import re
import copy
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional

MAX_RESULTS = 30

# Module-level cache to prevent redundant API spam
_SEARCH_CACHE: Dict[str, Any] = {}
_CACHE_LOCK = asyncio.Lock()

OPEN_ARCHIVES_INSTRUCTIONS = r"""
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
"""

def parse_openarchieven_url(url: str):
    try:
        normalized_url = url.rstrip('/')
        last_slash_index = normalized_url.rfind('/')
        if last_slash_index == -1:
            return None, None
        archive_identifier_part = normalized_url[last_slash_index + 1:]
        if not archive_identifier_part:
            return None, None
        parts = archive_identifier_part.split(':')
        if len(parts) == 2:
            return parts[0], parts[1]
        return None, None
    except Exception:
        return None, None

def reformat_results(result: Dict[str, Any], multi_page_search: bool) -> Dict[str, Any]:
    if result.get('status') == 'error':
        return result
    
    if 'start_offset' in result and 'results_remaining' in result and 'records' in result:
        if multi_page_search:
            current_page = result['start_offset'] // MAX_RESULTS
            total_records = result['start_offset'] + len(result['records']) + result['results_remaining']
            total_pages = (total_records + MAX_RESULTS - 1) // MAX_RESULTS
            result['page'] = current_page + 1
            result['total_pages'] = total_pages
        del result['start_offset']
        del result['results_remaining']

    if not result or 'records' not in result or not isinstance(result['records'], list):
        return {"status": "error", "error_message": f"Unexpected response format: {result}"}

    reformatted_result = copy.deepcopy(result)

    for record in reformatted_result.get('records', []):
        relations_map = {}
        if 'RelationEP' in record and isinstance(record.get('RelationEP'), list):
            for rel in record['RelationEP']:
                if 'PersonKeyRef' in rel and 'RelationType' in rel:
                    relations_map[rel['PersonKeyRef']] = rel['RelationType']

        if 'RelationPP' in record and isinstance(record.get('RelationPP'), dict):
            relation_pp = record['RelationPP']
            relation_type = relation_pp.get('RelationType')
            person_refs = relation_pp.get('PersonKeyRef', [])
            if relation_type and isinstance(person_refs, list):
                for person_ref in person_refs:
                    if person_ref not in relations_map:
                        relations_map[person_ref] = relation_type
        
        new_person_list = []
        if 'Person' in record and isinstance(record['Person'], dict):
            record['Person'] = [record['Person']]

        for person_data in record.get('Person', []):
            pid = person_data.get('@pid')
            new_person = {k: v for k, v in person_data.items() if k != '@pid'}
            if pid and pid in relations_map:
                new_person['RelationType'] = relations_map[pid]
                new_person = {'RelationType': new_person.pop('RelationType'), **new_person}
            new_person_list.append(new_person)
        record['Person'] = new_person_list
        
        record.pop('RelationEP', None)
        record.pop('RelationPP', None)

        if 'Event' in record and '@eid' in record.get('Event', {}):
            del record['Event']['@eid']

        if 'Source' in record:
            source = record['Source']
            if 'OpenArchievenLink' in record:
                source['OpenArchieven'] = record.pop('OpenArchievenLink')
            if 'SourceRemark' in source and isinstance(source.get('SourceRemark'), list):
                source['SourceRemark'] = {
                    item['@Key']: item.get('Value') 
                    for item in source['SourceRemark'] if '@Key' in item
                }
            if 'SourceAvailableScans' in source and 'Scan' in source.get('SourceAvailableScans', {}):
                scans_data = source['SourceAvailableScans']['Scan']
                if isinstance(scans_data, list):
                     source['SourceAvailableScans']['Scan'] = [
                         scan.get('UriViewer') for scan in scans_data if 'UriViewer' in scan
                     ]
    return reformatted_result

async def open_archives_get_record(url: str) -> dict:
    archive, identifier = parse_openarchieven_url(url)
    if not archive or not identifier:
        return {"status": "error", "error_message": "Invalid OpenArchieven URL format."}
    
    base_url = "https://api.openarchieven.nl/1.1/records/show.json"
    params = {"archive": archive, "identifier": identifier, "lang": "en"}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(base_url, params=params, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"status": "error", "error_message": f"API request failed: {str(e)}"}

async def open_archives_search(
    query: str, 
    eventplace: Optional[str] = None, 
    eventtype: Optional[str] = None, 
    relationtype: Optional[str] = None,
    page: Optional[int] = 1,
    multi_page_search: bool = False
) -> dict:
    """
    Performs a search for records on openarchieven.nl using its specific query syntax.
    
    CRITICAL: Before calling, review the following rules:
    - Use '[Name1] &~& [Name2]' for fuzzy pairs (e.g., married couples).
    - NEVER put city or province names in the 'query' string; use the 'eventplace' argument instead.
    - Pre-1811 baptism records rarely have surnames; search for 'Name & FatherName' instead.
    """
    if query.count(" &~& ") >= 2:
        query = query.replace(" &~& ", " & ")
    if " &~& " in query and " & " in query:
        query = query.replace(" &~& ", " & ")
    query = re.sub(r'(\b\d{4})-(?!\d)', rf'\1-{datetime.now().year}', query)
    
    start_offset = max(0, page - 1) * MAX_RESULTS if multi_page_search else 0

    params = {
        "name": query,
        "lang": "en",
        "number_show": MAX_RESULTS,
        "start": start_offset,
        "sort": 4
    }
    
    if eventplace: params["eventplace"] = eventplace
    if eventtype: params["eventtype"] = eventtype
    if relationtype: params["relationtype"] = relationtype

    if query.count("&") > 2:
        return {"status": "error", "error_message": "Query cannot contain more than two '&' symbols."}

    from tools.utils import report_status
    
    # Cache key based on all relevant search parameters
    cache_key = f"{query}|{eventplace}|{eventtype}|{relationtype}|{page}|{multi_page_search}"
    async with _CACHE_LOCK:
        if cache_key in _SEARCH_CACHE:
            cached_result = _SEARCH_CACHE[cache_key]
            await report_status(f"(CACHED) Recalled {len(cached_result.get('records', []))} records for '{query}'...")
            return cached_result
    
    await report_status(f"Searching archives for query: '{query}'...")
    
    base_url = "https://api.openarchieven.nl/1.1/records/search.json"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(base_url, params=params, timeout=20.0)
            response.raise_for_status()
            search_results = response.json()
            
            total_found = search_results.get("response", {}).get("number_found", 0)
            docs = search_results.get("response", {}).get("docs", [])
            
            if total_found == 0:
                await report_status(f"No recordings found matching '{query}'.")
            else:
                await report_status(f"Found {total_found} total records matching '{query}'. Processing the top {len(docs)}...")
            
                if not multi_page_search and total_found > MAX_RESULTS:
                    return {
                        "status": "error",
                        "error_message": f"More than {MAX_RESULTS} results found. Refine your search or enabled multi-page search.",
                        "total_found": total_found
                    }

                records = []
                if docs:
                    await report_status(f"Fetching {len(docs)} detailed records in parallel...")
                    
                    async def fetch_one(doc):
                        show_url = "https://api.openarchieven.nl/1.1/records/show.json"
                        show_params = {"archive": doc["archive_code"], "identifier": doc["identifier"], "lang": "en"}
                        try:
                            show_resp = await client.get(show_url, params=show_params, timeout=10.0)
                            if show_resp.status_code == 200:
                                rec = show_resp.json()
                                rec["OpenArchievenLink"] = {"archive_code": doc["archive_code"], "identifier": doc["identifier"]}
                                return rec
                        except Exception: 
                            return None
                    
                    # Fetch in batches of 10 to be respectful to the API
                    batch_size = 10
                    for i in range(0, len(docs), batch_size):
                        batch = docs[i:i+batch_size]
                        results = await asyncio.gather(*(fetch_one(d) for d in batch))
                        records.extend([r for r in results if r])
                        if i + batch_size < len(docs):
                            await report_status(f"Retrieved {len(records)} of {len(docs)} records...")
                
                await report_status(f"Completed analysis of {len(records)} records.")
            
            result = {
                "status": "success",
                "start_offset": start_offset,
                "results_remaining": max(0, total_found - len(records) - start_offset),
                "records": records
            }
            final_result = reformat_results(result, multi_page_search)
            
            # Save to cache before returning
            async with _CACHE_LOCK:
                _SEARCH_CACHE[cache_key] = final_result
            return final_result
            
        except Exception as e:
            return {"status": "error", "error_message": f"API request failed: {str(e)}"}
