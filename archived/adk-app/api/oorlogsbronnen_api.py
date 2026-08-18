from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.utils import rate_limited_get
import requests
import json
import re
from datetime import datetime
import copy
from urllib.parse import quote


MAX_RESULTS = 20


def oorlogsbronnen_search(name: str) -> dict:
    """
    Searches the Oorlogsbronnen API for a given name.

    Args:
        name (str): The name to search for.

    Returns:
        dict: A dictionary containing the search results or an error message.
    """
    tag = "Oorlogsbronnen Search"
    example_query = "Emma%20van%20Dam"
    base_url = "https://rest.spinque.com/4/oorlogsbronnen/api/in10/e/integrated_search/p/topic/{query}/q/class%3AFILTER/p/value/1.0(http%3A%2F%2Fschema.org%2FPerson)/results,count?count=24&offset=0&config=production"
    
    try:
        encoded_name = quote(name)
        url = f"{base_url}".replace("{query}", encoded_name)
        
        logger.debug(f"[{tag}] >>> {url}")

        response = rate_limited_get(url, timeout=10)
        response.raise_for_status()

        data = response.json()
        logger.debug(f"[{tag}] <<< {data}")

        if "status" in data and data.get("status") == "FAILURE":
            return {
                "status": "error",
                "error_message": f"API returned status 'FAILURE': {data.get('message', 'No message provided')}"
            }
        # Check if data is a list
        elif isinstance(data, list) and "items" in data[0]:
            total = len(data[0]["items"])
            if "total" in data[1]:
                total = data[1]["total"]
            return {
                "status": "ok",
                "total_results": total,
                "results": data[0]["items"]
            }
        else:
            return {
                "status": "error",
                "error_message": "API response format unexpected or no results found"
            }

    except requests.exceptions.RequestException as e:
        logger.error(f"[{tag}] API request failed: {e}")
        return {
            "status": "error",
            "error_message": f"API request failed: {str(e)}"
        }
    except json.JSONDecodeError:
        logger.error(f"[{tag}] Failed to decode JSON response")
        return {
            "status": "error",
            "error_message": "Failed to decode JSON response"
        }


def oorlogsbronnen_read_document(doc_id: str) -> dict:
    """
    Retrieves a specific document from the Oorlogsbronnen API.

    Args:
        doc_id (str): The person ID to retrieve data for.

    Returns:
        dict: A dictionary containing the details of a person or an error message.
    """
    content_types = ["person", "person_events", "person_related_content", "person_sources"]
    combined_results = {}

    for content_type in content_types:
        result = oorlogsbronnen_read_content(content_type, doc_id, fast=False)
        if result.get("status") == "ok":
            if "items" in result:
                combined_results[content_type] = result["items"]
        else:
            # Return error if any of the calls fail
            return result 

    # TODO also implement the `person_transport` API to understand transport records; it would be useful to link to camp records by reading `/person_events` and extracting the following:
    # - `attributes.event.startDate`
    # - `attributes.event.endDate`
    # - `attributes.event.fromLocation`
    # - `attributes.event.toLocation`
    # Then invoking the API with:
    #base_url = f"https://rest.spinque.com/4/oorlogsbronnen/api/in10/e/persons/e/person_transport:FILTER/p/fromLocation/{quote(fromLocation)}/p/toLocation/{quote(toLocation)}/p/date/{startDate}/results?count=4&config=production"

    return {
        "status": "ok",
        "results": combined_results
    }

def oorlogsbronnen_read_content(type: str, doc_id: str, fast=False) -> dict:
    tag = f"Oorlogsbronnen get {type}"
    url = f"https://rest.spinque.com/4/oorlogsbronnen/api/in10/e/{type}/p/id/{doc_id}/results??count=30&config=production"
    try:
        logger.debug(f"[{tag}] >>> {url}")
        response = rate_limited_get(url, timeout=10, fast=fast)
        response.raise_for_status()

        data = response.json()
        logger.debug(f"[{tag}] <<< {data}")

        if "items" in data:
            result = data["items"]
            return {
                "status": "ok",
                "items": result
            }
        else:
            return {
                "status": "error",
                "error_message": f"API returned status '{data.get('status')}' or result not found for id {doc_id}"
            }

    except requests.exceptions.RequestException as e:
        logger.error(f"[{tag}] API request failed for id {doc_id}: {e}")
        return {
            "status": "error",
            "error_message": f"API request failed: {str(e)}"
        }
    except json.JSONDecodeError:
        logger.error(f"[{tag}] Failed to decode JSON response for id {doc_id}")
        return {
            "status": "error",
            "error_message": "Failed to decode JSON response"
        }
