import httpx
import re
import json
import asyncio
from typing import Dict, Any, Union
from urllib.parse import quote
from tools.utils import report_status

PAGE_SIZE = 20
PERMALINK_URL = 'https://www.joodsmonument.nl/rsc/'

HOLOCAUST_INSTRUCTIONS = r"""
You have access to specialized tools for researching Dutch Holocaust and World War II victims: `joods_monument_search`, `joods_monument_get_document`, `oorlogsbronnen_search`, and `oorlogsbronnen_get_document`.

### RESEARCH GUIDELINES FOR WWII & HOLOCAUST RECORDS:
1. **WHEN TO USE**:
   - Use these tools whenever researching individuals who died between 1940–1945 in concentration camps (Auschwitz, Sobibor, Westerbork, Mauthausen, Vught, etc.), victims of persecution, resistance fighters, or people listed with Jokos archive numbers.
2. **JOODS MONUMENT**:
   - `joods_monument_search(name)`: Searches the Joods Monument database for Jewish victims in the Netherlands.
   - `joods_monument_get_document(url_or_id)`: Retrieves full biographical page content, family connections, addresses, or deportations given a URL or numeric document ID.
3. **OORLOGSBRONNEN**:
   - `oorlogsbronnen_search(name)`: Searches the Netwerk Oorlogsbronnen portal for person records across WWII archives.
   - `oorlogsbronnen_get_document(doc_id)`: Retrieves comprehensive timeline events, sources, and connected materials for a specific person ID.
4. **CITATION & BIOGRAPHY**:
   - Always include permanent links (`https://www.joodsmonument.nl/...` or `https://www.oorlogsbronnen.nl/...`) when referencing these records.
"""

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LineageNexus/1.0"
}

async def joods_monument_search(name: str) -> Dict[str, Any]:
    """
    Searches the Joods Monument database for a given person's name.

    Args:
        name: The full name or surname of the person to search for.

    Returns:
        Dict containing search results or error details.
    """
    await report_status(f"Searching Joods Monument for '{name}'…")
    encoded_name = quote(name)
    base_url = f"https://www.joodsmonument.nl/api/model/search/get?for={encoded_name}&pagelen={PAGE_SIZE}&with_membership=true"

    async with httpx.AsyncClient(timeout=10.0, headers=DEFAULT_HEADERS, follow_redirects=True) as client:
        try:
            response = await client.get(base_url)
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "ok" and "result" in data and "result" in data["result"]:
                doc_ids = data["result"]["result"]
                results = []
                
                # Fetch summary info for up to 10 document IDs concurrently
                tasks = [joods_monument_get_document(str(doc_id)) for doc_id in doc_ids[:10]]
                docs = await asyncio.gather(*tasks, return_exceptions=True)
                
                for doc in docs:
                    if isinstance(doc, dict) and doc.get("status") == "ok":
                        results.append(doc.get("document"))

                return {
                    "status": "ok",
                    "total_results": len(doc_ids),
                    "results": results
                }
            elif data.get("status") == "ok":
                return {"status": "ok", "total_results": 0, "results": []}
            else:
                return {
                    "status": "error",
                    "error_message": f"API returned status '{data.get('status')}'"
                }
        except Exception as e:
            return {"status": "error", "error_message": f"Joods Monument search failed: {str(e)}"}


async def joods_monument_get_document(url_or_id: str) -> Union[str, Dict[str, Any]]:
    """
    Retrieves detailed biographical record or main page content from Joods Monument using a document ID or URL.

    Args:
        url_or_id: Numeric document ID (e.g., "136176") or full Joods Monument URL.

    Returns:
        Parsed record dictionary or extracted text content.
    """
    input_str = str(url_or_id).strip()
    
    # If numeric or simple ID, query JSON API
    if input_str.isnumeric():
        doc_id = int(input_str)
        url = f"https://www.joodsmonument.nl/api/model/rsc/get/{doc_id}"
        fields_to_extract = [
            "page_url_abs", "id", "title", "name_first", "name_surname_prefix",
            "name_surname", "gender", "date_start", "date_end", "decease_city",
            "birth_city", "birth_country", "address_street_1", "address_city",
            "occupation", "is_a", "depiction_url", "body"
        ]
        
        async with httpx.AsyncClient(timeout=10.0, headers=DEFAULT_HEADERS, follow_redirects=True) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                if data.get("status") == "ok" and "result" in data:
                    result = data["result"]
                    extracted_data = {field: result.get(field) for field in fields_to_extract}
                    
                    processed_data = {}
                    for key, value in extracted_data.items():
                        if value is None:
                            continue
                        if isinstance(value, dict) and value.get("_type") == "trans" and "tr" in value:
                            tr = value["tr"]
                            if "nl" in tr:
                                processed_data[key] = tr["nl"]
                            elif tr:
                                processed_data[key] = next(iter(tr.values()))
                        else:
                            processed_data[key] = value

                    return {"status": "ok", "document": processed_data}
                else:
                    return {
                        "status": "error",
                        "error_message": f"Document ID {doc_id} not found in Joods Monument"
                    }
            except Exception as e:
                return {"status": "error", "error_message": f"Failed to fetch Joods Monument document {doc_id}: {str(e)}"}

    # Otherwise, treat as URL to scrape/clean HTML content
    target_url = input_str
    if not target_url.startswith("http"):
        target_url = f"{PERMALINK_URL}{target_url}"

    if not target_url.startswith("https://www.joodsmonument.nl"):
        return {"status": "error", "error_message": "Invalid URL: Must start with 'https://www.joodsmonument.nl'"}

    await report_status(f"Fetching Joods Monument document…")
    async with httpx.AsyncClient(timeout=10.0, headers=DEFAULT_HEADERS, follow_redirects=True) as client:
        try:
            response = await client.get(target_url)
            response.raise_for_status()
            html_content = response.text

            header_match = re.search(r'<header[^>]*class="c-warvictim-intro"[^>]*>(.*?)</header>', html_content, re.DOTALL)
            main_match = re.search(r'<main[^>]*id="main-content"[^>]*>(.*?)</main>', html_content, re.DOTALL)

            header_content = header_match.group(1).strip() if header_match else ""
            main_content = main_match.group(1).strip() if main_match else ""

            if header_content or main_content:
                content = header_content + "\n" + main_content
                content = re.sub(r'<div[^>]*class="[^"]*(c-add-resource|copyrights)[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
                content = re.sub(r'\s+', ' ', content)
                content = re.sub(r'> <', '><', content)
                return content.strip()
            return html_content
        except Exception as e:
            return {"status": "error", "error_message": f"Failed to read Joods Monument URL: {str(e)}"}


async def oorlogsbronnen_search(name: str) -> Dict[str, Any]:
    """
    Searches the Oorlogsbronnen API for person records matching a given name.

    Args:
        name: The name of the person to search for.

    Returns:
        Dict containing search results or error details.
    """
    await report_status(f"Searching Oorlogsbronnen for '{name}'…")
    encoded_name = quote(name)
    url = f"https://rest.spinque.com/4/oorlogsbronnen/api/in10/e/search/p/topic/{encoded_name}/results?count=24&config=production"

    async with httpx.AsyncClient(timeout=10.0, headers=DEFAULT_HEADERS, follow_redirects=True) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, dict) and "items" in data:
                items = data["items"]
                parsed_results = []
                for item in items:
                    t_list = item.get("tuple", [])
                    if t_list and isinstance(t_list[0], dict):
                        t_obj = t_list[0]
                        parsed_results.append({
                            "id": t_obj.get("id"),
                            "attributes": t_obj.get("attributes", {})
                        })
                return {
                    "status": "ok",
                    "total_results": data.get("count", len(parsed_results)),
                    "results": parsed_results
                }
            elif isinstance(data, dict) and data.get("status") == "FAILURE":
                return {
                    "status": "error",
                    "error_message": f"API failure: {data.get('message', 'Unknown error')}"
                }
            else:
                return {"status": "ok", "total_results": 0, "results": []}
        except Exception as e:
            return {"status": "error", "error_message": f"Oorlogsbronnen search failed: {str(e)}"}


async def oorlogsbronnen_get_document(doc_id: str) -> Dict[str, Any]:
    """
    Retrieves person profile events, sources, and related content from Oorlogsbronnen given a person ID.

    Args:
        doc_id: The person ID or URL from Oorlogsbronnen (e.g. UUID or 'person/UUID').

    Returns:
        Dict containing combined person details, timeline events, and sources.
    """
    clean_id = doc_id.strip()
    if "/" in clean_id:
        clean_id = clean_id.rstrip("/").split("/")[-1]

    await report_status(f"Fetching Oorlogsbronnen record '{clean_id}'…")
    content_types = ["person", "person_events", "person_related_content", "person_sources"]
    combined_results = {}

    async with httpx.AsyncClient(timeout=10.0, headers=DEFAULT_HEADERS, follow_redirects=True) as client:
        async def fetch_type(c_type: str):
            url = f"https://rest.spinque.com/4/oorlogsbronnen/api/in10/e/{c_type}/p/id/{clean_id}/results?count=30&config=production"
            try:
                res = await client.get(url)
                res.raise_for_status()
                payload = res.json()
                if isinstance(payload, dict) and "items" in payload:
                    return c_type, payload["items"]
                return c_type, []
            except Exception:
                return c_type, []

        results = await asyncio.gather(*[fetch_type(ct) for ct in content_types])
        for c_type, items in results:
            if items:
                combined_results[c_type] = items

    return {
        "status": "ok",
        "results": combined_results
    }

