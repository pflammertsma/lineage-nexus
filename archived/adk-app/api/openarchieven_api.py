from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.utils import rate_limited_get
import requests
import json
from typing import Dict, Any
import re
from datetime import datetime
import copy


MAX_RESULTS = 30

def open_archives_get_record(url: str) -> dict:
    #https://www.openarchieven.nl/gra:82abb4f7-6091-c219-f035-2cc346509875
    archive, identifier = parse_openarchieven_url(url)
    return open_archives_show(archive, identifier)


def parse_openarchieven_url(url: str):
    """
    Parses an Open Archieven URL to extract the archive and identifier,
    handling URLs with or without trailing slashes.

    Args:
        The URL string in the format https://www.openarchieven.nl/{archive}:{identifier}.

    Returns:
        tuple: A tuple containing (archive, identifier) or (None, None) if parsing fails.
    """
    try:
        # Remove any trailing slashes to normalize the URL
        normalized_url = url.rstrip('/')

        # Find the last slash to get the relevant part of the URL
        last_slash_index = normalized_url.rfind('/')
        if last_slash_index == -1:
            return None, None # URL format not as expected (e.g., no slashes after domain)

        # Get the part after the last slash, e.g., "gra:82abb4f7-6091-c219-f035-2cc346509875"
        archive_identifier_part = normalized_url[last_slash_index + 1:]

        # Check if the part is empty after removing a potential trailing slash
        if not archive_identifier_part:
            return None, None

        # Split this part by the colon
        parts = archive_identifier_part.split(':')

        if len(parts) == 2:
            archive = parts[0]
            identifier = parts[1]
            return archive, identifier
        else:
            return None, None # Colon not found or multiple colons, or unexpected format
    except Exception as e:
        print(f"An error occurred during URL parsing: {e}")
        return None, None


def open_archives_search(json_dict: Dict[str, Any]) -> dict:
    """
    Searches by invoking open_archives_search with the parsed parameters.
    
    Args:
        JSON dictionary with search parameters with keys matching the parameters of open_archives_search.
    
    Returns:
        dict: Search results or error message.
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {"status": "error", "error_message": "JSON must represent an object with search parameters."}
        # Override page/offset handling
        if 'start_offset' in params:
            del params['start_offset']
        params['number_show'] = MAX_RESULTS
        multi_page_search = 'multi_page_search' in params and params['multi_page_search']
        if multi_page_search:
            if 'page' in params and isinstance(params['page'], int):
                params['start_offset'] = max(0, params['page'] - 1) * MAX_RESULTS
                del params['page']
        # Make the request and return the results
        result = open_archives_search_params(**params)
        return reformat_results(result, multi_page_search)
    except json.JSONDecodeError as e:
        return {"status": "error", "error_message": f"Invalid JSON: {str(e)}"}
    except TypeError as e:
        return {"status": "error", "error_message": f"Parameter error: {str(e)}"}


def reformat_results(result: Dict[str, Any], multi_page_search: bool) -> Dict[str, Any]:
    """
    Reformats a JSON dictionary from a specific input structure to a cleaner,
    more consolidated output structure.

    Args:
        result: The input dictionary to reformat.

    Returns:
        The reformatted dictionary.
    """
    if 'status' in result and result['status'] == 'error':
        return result
    
    # Modify the result to reflect the current page and total pages
    if 'start_offset' in result and 'results_remaining' in result and 'records' in result:
        if multi_page_search:
            current_page = result['start_offset'] // MAX_RESULTS
            total_records = result['start_offset'] + len(result['records']) + result['results_remaining']
            total_pages = (total_records + MAX_RESULTS - 1) // MAX_RESULTS # Ceiling division
            result['page'] = current_page + 1
            result['total_pages'] = total_pages
        del result['start_offset']
        del result['results_remaining']

    if not result or 'records' not in result or not isinstance(result['records'], list):
        return {"status": "error", "error_message": f"Unexpected response format: {result}"}

    # Create a deep copy to avoid modifying the original input dictionary
    reformatted_result = copy.deepcopy(result)

    for record in reformatted_result.get('records', []):
        # --- 1. Consolidate Person and Relation Data ---
        
        relations_map = {}
        # Process Event-Person relations first to establish primary roles
        if 'RelationEP' in record and isinstance(record.get('RelationEP'), list):
            for rel in record['RelationEP']:
                if 'PersonKeyRef' in rel and 'RelationType' in rel:
                    relations_map[rel['PersonKeyRef']] = rel['RelationType']

        # Process Person-Person relations, adding them if a person doesn't already have a role
        if 'RelationPP' in record and isinstance(record.get('RelationPP'), dict):
            relation_pp = record['RelationPP']
            relation_type = relation_pp.get('RelationType')
            person_refs = relation_pp.get('PersonKeyRef', [])
            if relation_type and isinstance(person_refs, list):
                for person_ref in person_refs:
                    if person_ref not in relations_map:
                        relations_map[person_ref] = relation_type
        
        # Build the new, consolidated list of persons, preserving original order
        new_person_list = []
        # Handle case where 'Person' is a single dictionary instead of a list
        if 'Person' in record and isinstance(record['Person'], dict):
            record['Person'] = [record['Person']]

        # Iterate over the (now guaranteed) list of persons
        for person_data in record.get('Person', []):
            pid = person_data.get('@pid')
            
            # Create a new person dict, excluding the '@pid'
            new_person = {k: v for k, v in person_data.items() if k != '@pid'}
            
            # Add the mapped relation type
            if pid and pid in relations_map:
                new_person['RelationType'] = relations_map[pid]
                # Move 'RelationType' to be the first key for consistency with the example
                new_person = {'RelationType': new_person.pop('RelationType'), **new_person}
            
            new_person_list.append(new_person)

        record['Person'] = new_person_list
        
        # Clean up the original relation keys
        record.pop('RelationEP', None)
        record.pop('RelationPP', None)

        # --- 2. Clean Event Data ---
        if 'Event' in record and '@eid' in record.get('Event', {}):
            del record['Event']['@eid']

        # --- 3. Restructure Source Data ---
        if 'Source' in record:
            source = record['Source']

            # Move and rename OpenArchievenLink
            if 'OpenArchievenLink' in record:
                source['OpenArchieven'] = record.pop('OpenArchievenLink')

            # Reformat SourceRemark from a list of objects to a single dictionary
            if 'SourceRemark' in source and isinstance(source.get('SourceRemark'), list):
                source['SourceRemark'] = {
                    item['@Key']: item.get('Value') 
                    for item in source['SourceRemark'] if '@Key' in item
                }

            # Simplify SourceAvailableScans if it's a list of scan objects
            if 'SourceAvailableScans' in source and 'Scan' in source.get('SourceAvailableScans', {}):
                scans_data = source['SourceAvailableScans']['Scan']
                if isinstance(scans_data, list):
                     source['SourceAvailableScans']['Scan'] = [
                         scan['UriViewer'] for scan in scans_data if 'UriViewer' in scan
                     ]
                # Note: If 'Scan' is a single dictionary, it's left unchanged as per the example.

    return reformatted_result


def open_archives_search_params(query: str, archive_code=None, number_show=10, sourcetype=None, 
                        eventplace=None, relationtype=None, eventtype=None, country_code=None, 
                        sort=4, lang="en", start_offset=0, multi_page_search=False) -> dict:
    """Queries the Open Archives API search endpoint.
    
    Args:
        query (str): Search query (required). Can include 2 names separated by & and year/period
        archive_code (str, optional): Filter results on archive code
        number_show (int, optional): Number of results to show (max=100). Defaults to 10
        sourcetype (str, optional): Filter results on source type
        eventplace (str, optional): Filter results on event place
        relationtype (str, optional): Filter results on relation type (e.g., Overledene, Bruid, Kind)
        eventtype (str, optional): Filter results on event type (e.g., Overlijden, Huwelijk, Geboorte, Doop)
        country_code (str, optional): Filter results on country (e.g., nl, be, fr, sr)
        sort (int, optional): Column to sort results (1=Name, 2=Role, 3=Event, 4=Date). Defaults to 1
        lang (str, optional): Language code (nl for Dutch, en for English). Defaults to "en"
        start_offset (int, optional): Initial results to return (for paging). Defaults to 0
        
    Returns:
        dict: JSON response containing the query interpretation and search results.
        
    Raises:
        requests.RequestException: If the API request fails.
    """
    tag = "OpenArchieven Search"

    # Base URL for the Open Archives API search endpoint
    base_url = "https://api.openarchieven.nl/1.1/records/search.json"

    # Sanitize the query:
    # Replace multiple fuzzy search symbols '&~&' with a single '&'
    if query.count(" &~& ") >= 2:
        query = query.replace(" &~& ", " & ")
    # If the query contains both '&~&' and '&', replace all '&~&' with '&'
    if " &~& " in query and " & " in query:
        query = query.replace(" &~& ", " & ")
    # Replace incomplete year ranges like "1824-" with "1824-<current_year>"
    query = re.sub(r'(\b\d{4})-(?!\d)', rf'\1-{datetime.now().year}', query)
    
    # Construct parameters dictionary, excluding None values
    params = {
        "name": query,
        "lang": lang,
        "number_show": number_show,
        "start": start_offset,
        "sort": sort
    }
    
    # Add optional parameters if they are provided
    if archive_code:
        params["archive_code"] = archive_code
    if sourcetype:
        params["sourcetype"] = sourcetype
    if eventplace:
        params["eventplace"] = eventplace
    if eventtype:
        params["eventtype"] = eventtype
    if relationtype:
        params["relationtype"] = relationtype
    if country_code:
        params["country_code"] = country_code
    
    # Provide the JSON query into the response, but remove irrelevant parts
    return_query = copy.deepcopy(params)
    del return_query["lang"]
    del return_query["number_show"]
    del return_query["start"]
    del return_query["sort"]
    
    if re.search(r'\d.*[a-zA-Z]', query):
        return {
            "status": "error",
            "error_message": "Query cannot contain names after a date or date range.",
            "query": return_query
        }

    # Validate the query:
    # Check if the query contains more than two ampersands (i.e. more than three names)
    if query.count("&") > 2:
        return {
            "status": "error",
            "error_message": "Query cannot contain more than two '&' symbols; only search using three names at a time or less.",
            "query": return_query
        }
    # Check if a '"' appears anywhere after a '&'
    amp_index = query.find("&")
    if amp_index != -1 and '"' in query[amp_index+1:]:
        return {
            "status": "error",
            "error_message": "Query cannot contain a '\"' character after a '&' symbol.",
            "query": return_query
        }
    
    try:
        logger.debug(f"[{tag}] >>> {base_url} {params}")

        # Make the GET request to the API
        try:
            response = rate_limited_get(base_url, params=params, timeout=10)
        except requests.exceptions.Timeout:
            return {
                "status": "error",
                "error_message": "API request timed out",
                "query": return_query
            }

        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response
        search_results = response.json()
        logger.debug(f"[{tag}] <<< {search_results}")
        
        total_result_count = search_results["response"]["number_found"]

        logger.info(f"[{tag}] Response body contains {len(search_results)} objects")
        logger.info(f"[{tag}] {total_result_count} search results")
        
        if not multi_page_search and total_result_count > MAX_RESULTS:
            error_message = f"[{tag}] More than {MAX_RESULTS} results found. The search query was too broad; try refining your search or performing a multi-page search."
            logger.warning(error_message)
            return {
                "status": "error",
                "error_message": error_message,
                "query": return_query
            }

        records = []
        if ('docs' in search_results["response"]):
            for doc in search_results["response"]["docs"]:
                record = open_archives_show(doc["archive_code"], doc["identifier"], fast=True)
                record["OpenArchievenLink"] = {
                    "archive_code": doc["archive_code"],
                    "identifier": doc["identifier"]
                }
                records.append(record)
        else:
            # Add a more detailed error message to suggest removing `eventtype` or `eventplace` if it was provided
            error_message = f"No records found. Perhaps your search query was too narrow?"
            parts = []
            if archive_code:
                parts.append("archive_code")
            if sourcetype:
                parts.append("sourcetype")
            if eventplace:
                parts.append("eventplace")
            if eventtype:
                parts.append("eventtype")
            if relationtype:
                parts.append("relationtype")
            if country_code:
                parts.append("country_code")
            if len(parts) > 0:
                error_message = error_message + f" Try removing `{'` or `'.join(parts)}` for a broader search."
            logger.warning(f"[{tag}] {error_message} Response: {search_results["response"]}")
            return {
                "status": "error",
                "error_message": error_message,
                "query": return_query
            }
        
        result = {
            "status": "success",
            "start_offset": start_offset,
            "results_remaining": max(0, total_result_count-len(records)-start_offset),
            "query": return_query,
            "records": records
        }

        logger.info(f"[{tag}] Result: {result}")
        
        # Return the record
        return result
    except requests.RequestException as e:
        # Handle request exceptions
        return {
            "status": "error",
            "error_message": f"API request failed: {str(e)}",
            "query": return_query
        }


def open_archives_show(archive: str, identifier: str, callback="", lang="en", fast=False) -> dict:
    """Queries the Open Archives API /show endpoint.
    
    Args:
        archive (str, required): Code of archive (obtain a list of valid archive codes via Stats/Archives)
        identifier (str, required): Identifier of the record
        callback (str, optional): Function name to be called on JSON data (JSONP).
        lang (str, optional): Language code (nl for Dutch, en for English). Defaults to "en".
        
    Returns:
        dict: JSON response containing the record.
        
    Raises:
        requests.RequestException: If the API request fails.
    """
    tag = "open_archives_show"

    logger.info(f"Reading record {identifier}...")

    # Base URL for the Open Archives API search endpoint
    base_url = "https://api.openarchieven.nl/1.1/records/show.json"
    
    # Construct parameters dictionary, excluding None values
    params = {
        "archive": archive,
        "identifier": identifier,
        "callback": callback,
        "lang": lang
    }
    
    # Add optional parameters if they are provided
    if archive:
        params["archive"] = archive
    if identifier:
        params["identifier"] = identifier
    if callback:
        params["callback"] = callback
    if lang:
        params["lang"] = lang
    
    try:
        logger.debug(f"[{tag}] >>> {base_url} {params}")

        # Make the GET request to the API
        try:
            response = rate_limited_get(base_url, params=params, timeout=10, fast=fast)
        except requests.exceptions.Timeout:
            return {
                "status": "error",
                "error_message": "API request timed out",
                "archive": archive,
                "identifier": identifier
            }
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response
        record = response.json()

        # logger.info(f"[{tag}] Obtained response: {record}")
        logger.debug(f"[{tag}] <<< {record}")
        
        # Return the record
        return record
    except requests.RequestException as e:
        # Handle request exceptions
        return {
            "status": "error",
            "error_message": f"API request failed: {str(e)}",
            "archive": archive,
            "identifier": identifier
        }
