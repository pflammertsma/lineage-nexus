from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.utils import rate_limited_get
import requests
import json
import re
from datetime import datetime
import copy
from urllib.parse import quote


PAGE_SIZE = 20
PERMALINK_URL = 'https://www.joodsmonument.nl/rsc/'


def joodsmonument_search(name: str) -> dict:
    """
    Searches the Joods Monument API for a given name.

    Args:
        name (str): The name to search for.

    Returns:
        dict: A dictionary containing the search results or an error message.
    """
    tag = "Joodsmonument Search"
    base_url = "https://www.joodsmonument.nl/api/model/search/get"
    
    params = {
        "for": name,
        "pagelen": PAGE_SIZE,
        "with_membership": "true"
    }

    try:
        encoded_name = quote(name)
        url = f"{base_url}?for={encoded_name}&pagelen={PAGE_SIZE}&with_membership=true"
        
        logger.debug(f"[{tag}] >>> {url}")

        response = rate_limited_get(url, timeout=10)
        response.raise_for_status()

        data = response.json()
        logger.debug(f"[{tag}] <<< {data}")

        if data.get("status") == "ok" and "result" in data and "result" in data["result"]:
            doc_ids = data["result"]["result"]
            results = []
            for doc_id in doc_ids:
                doc = joodsmonument_get_document(doc_id, fast=True)
                if doc.get("status") == "ok":
                    results.append(doc["document"])
                else:
                    # Log the error and continue
                    logger.error(f"[{tag}] Failed to retrieve document {doc_id}: {doc.get('error_message')}")
            return {
                "status": "ok",
                "results": results
            }
        elif data.get("status") == "ok":
            return {
                "status": "ok",
                "results": []
            }
        else:
            return {
                "status": "error",
                "error_message": f"API returned status '{data.get('status')}'"
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


def joodsmonument_get_document(doc_id: int, fast=False) -> dict:
    """
    Retrieves a specific document from the Joods Monument.

    Args:
        doc_id (int): The ID of the document to retrieve.

    Returns:
        dict: A dictionary containing the various fields from the document or an error message.
    """
    tag = "Joodsmonument Get Document"
    url = f"https://www.joodsmonument.nl/api/model/rsc/get/{doc_id}"

    fields_to_extract = [
        "page_url_abs", "id", "title", "name_first", "name_surname_prefix",
        "name_surname", "gender", "date_start", "date_end", "decease_city",
        "birth_city", "birth_country", "address_street_1", "address_city",
        "occupation", "is_a", "depiction_url", "body"
    ]

    try:
        logger.debug(f"[{tag}] >>> {url}")
        response = rate_limited_get(url, timeout=10, fast=fast)
        response.raise_for_status()

        data = response.json()
        logger.debug(f"[{tag}] <<< {data}")

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

            return {
                "status": "ok",
                "document": processed_data
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


# Always accept only `str` as input, either a full URL or a numeric document ID. We cannot accept
# `str | int` because ADK doesn't support it.
def joodsmonument_read_document(url_or_id: str) -> str | dict:
    """
    Retrieves the main HTML content from a Joods Monument URL or document ID.

    If the parameter is not a URL, it is assumed to be a document ID.

    Args:
        url_or_id (str): The URL or document ID to retrieve.

    Returns:
        str | dict: The main content of the page or an error message.
    """
    tag = "Joodsmonument Get URL"
    url = str(url_or_id)
    if not url.startswith("http"):
        if not url.isnumeric():
            return {
                "status": "error",
                "error_message": "Invalid input: Must be a URL or a numeric document ID"
            }
        url = f"{PERMALINK_URL}{url}"

    if not url.startswith("https://www.joodsmonument.nl"):
        return {
            "status": "error",
            "error_message": "Invalid URL: Must start with 'https://www.joodsmonument.nl'"
        }

    try:
        logger.debug(f"[{tag}] >>> {url}")
        response = rate_limited_get(url, timeout=10)
        response.raise_for_status()
        
        html_content = response.content.decode(errors='ignore')
        
        header_match = re.search(r'<header[^>]*class="c-warvictim-intro"[^>]*>(.*?)</header>', html_content, re.DOTALL)
        main_match = re.search(r'<main[^>]*id="main-content"[^>]*>(.*?)</main>', html_content, re.DOTALL)
        
        header_content = ""
        if header_match:
            header_content = header_match.group(1).strip()
            
        main_content = ""
        if main_match:
            main_content = main_match.group(1).strip()
        
        if header_content or main_content:
            content = header_content + "\n" + main_content
            # remove irrelevant divs
            content = re.sub(r'<div[^>]*class="[^"]*(c-add-resource|copyrights)[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
            # remove redundant spaces
            content = re.sub(r'\s+', ' ', content)
            # remove spaces between tags
            content = re.sub(r'> <', '><', content)
            return content.strip()
        else:
            logger.warning(f"[{tag}] Could not find main content or header in {url}")
            return html_content

    except requests.exceptions.RequestException as e:
        logger.error(f"[{tag}] API request failed for url {url}: {e}")
        return {
            "status": "error",
            "error_message": f"API request failed: {str(e)}"
        }
