"""
wikitree_api.py

A simple Python interface for the WikiTree API using requests.
See: https://github.com/wikitree/wikitree-api
"""

from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.utils import rate_limited_get
import requests
import json
from typing import Dict, Any


WIKITREE_API_URL = "https://api.wikitree.com/api.php"

def search_profiles(json_dict: Dict[str, Any]):
    """
    Search for people using the WikiTree searchPerson API action.
    Args:
        JSON dictionary with search parameters. Supported keys: FirstName, LastName, BirthYear, DeathYear, limit, fields
    Returns:
        dict: Search results or error message
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {'status': 'error', 'error_message': 'JSON must represent an object with search parameters.'}
    except Exception as e:
        return {'status': 'error', 'error_message': f'Invalid JSON: {str(e)}'}
    # Set required action
    params['action'] = 'searchPerson'
    # Convert fields list to comma-separated string if present
    if 'fields' in params and isinstance(params['fields'], list):
        params['fields'] = ','.join(params['fields'])
    try:
        logger.debug(f"Searching people: {params}")
        response = rate_limited_get(WIKITREE_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Response: {data}")
        if 'error' in data:
            return {'status': 'error', 'error_message': data['error']}
        # Handle both dict and list responses
        if isinstance(data, dict):
            return {'status': 'ok', 'results': data.get('results', data)}
        elif isinstance(data, list):
            return {'status': 'ok', 'results': data}
        else:
            return {'status': 'ok', 'results': data}
    except requests.RequestException as e:
        logger.error(f"API request failed: {e}")
        return {'status': 'error', 'error_message': str(e)}


def get_person(json_dict: Dict[str, Any]):
    """
    Get a person's profile by WikiTree ID.
    Args:
        JSON dictionary with parameters. Supported keys: Name, fields, resolveRedirect
    Returns:
        dict: Person profile data or error message
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {'status': 'error', 'error_message': 'JSON must represent an object with parameters.'}
    except Exception as e:
        return {'status': 'error', 'error_message': f'Invalid JSON: {str(e)}'}
    # Replace `Name` key with `key`
    if 'Name' in params:
        params['key'] = params.pop('Name')    
    if 'Id' in params:
        params['key'] = params.pop('Id')    
    params['action'] = 'getPerson'
    if 'fields' in params and isinstance(params['fields'], list):
        params['fields'] = ','.join(params['fields'])
    # Set defaults if not provided
    params.setdefault('bioFormat', 'wiki')
    params.setdefault('resolveRedirect', 1)
    try:
        logger.debug(f"Requesting person: {params}")
        print(f"Requesting person: {params}")
        response = rate_limited_get(WIKITREE_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Response: {data}")
        if 'error' in data:
            return {'status': 'error', 'error_message': data['error']}
        # Handle both dict and list responses
        if isinstance(data, dict):
            return {'status': 'ok', 'person': data.get('person', data)}
        elif isinstance(data, list):
            return {'status': 'ok', 'person': data}
        else:
            return {'status': 'ok', 'person': data}
    except requests.RequestException as e:
        logger.error(f"API request failed: {e}")
        return {'status': 'error', 'error_message': str(e)}


PROFILE_FIELDS = ["Name",
          "BirthDate", "BirthLocation", "DeathDate", "DeathLocation",
          "FirstName", "MiddleName", "LastNameAtBirth", "LastNameCurrent", 
          "Bio", "bio"]

def get_profile(profile_id: str):
    """
    Get a well-rounded profile for a person using the WikiTree API, including their basic info,
    full biography and details about their parents, siblings, spouses and children.

    Args:
        WikiTree profile ID
    Returns:
        dict: Profile data or an error dictionary if input is invalid.
    """
    # Start by invoking get_relatives and requesting the required information
    data = get_relatives({"Name": profile_id, "fields": [
            "Name", "Id", 
            "BirthDate", "BirthLocation", "DeathDate", "DeathLocation",
            "FirstName", "MiddleName", "LastNameAtBirth", "LastNameCurrent", 
            "Bio"
        ]})

    # Quick validation
    if data.get('status') != 'ok':
        return data
    if 'person' not in data:
        return {"status": "error", "message": f"Invalid data from API: {data}"}

    # Make a deep copy to avoid modifying the original input
    person_data = data['person'].copy()
    # This will be the new, transformed person object
    new_person = {}

    # --- Basic Information ---
    # Copy essential fields from the main person, including Gender
    for key in PROFILE_FIELDS:
        if key in person_data:
            new_person[key] = person_data[key]

    # --- Parents ---
    # Replace Father and Mother IDs with their respective data objects
    if 'Parents' in person_data and isinstance(person_data['Parents'], dict):
        parents_info = person_data['Parents']
        father_id = str(person_data.get('Father'))
        mother_id = str(person_data.get('Mother'))

        if father_id in parents_info:
            new_father = {}
            father_data = parents_info[father_id]
            for key in PROFILE_FIELDS:
                if key in father_data:
                    new_father[key] = father_data[key]
            new_person['Father'] = new_father

        if mother_id in parents_info:
            new_mother = {}
            mother_data = parents_info[mother_id]
            for key in PROFILE_FIELDS:
                if key in mother_data:
                    new_mother[key] = mother_data[key]
            new_person['Mother'] = new_mother

    # --- Spouses ---
    # Convert the Spouses dictionary to a list of spouse objects
    spouse_id_to_name = {}
    if 'Spouses' in person_data and isinstance(person_data['Spouses'], dict):
        new_person['Spouses'] = []
        for spouse_id, spouse_data in person_data['Spouses'].items():
            # Store spouse name for later use in Children processing
            if 'Name' in spouse_data:
                spouse_id_to_name[spouse_id] = spouse_data['Name']
            new_spouse = {}
            for key in PROFILE_FIELDS:
                if key in spouse_data:
                    new_spouse[key] = spouse_data[key]
            new_person['Spouses'].append(new_spouse)

    # --- Children ---
    # Convert the Children dictionary to a list, replacing parent IDs with names
    # based on the main person's gender.
    if 'Children' in person_data and isinstance(person_data['Children'], dict):
        new_person['Children'] = []
        main_person_name = person_data.get('Name')
        main_person_gender = person_data.get('Gender')

        for child_data in person_data['Children'].values():
            new_child = {}
            for key in PROFILE_FIELDS:
                if key in child_data:
                    new_child[key] = child_data[key]
            
            if main_person_gender == 'Male':
                new_child['Father'] = main_person_name
                # The mother is the other parent, found via the spouse map
                new_child['Mother'] = spouse_id_to_name.get(str(child_data.get('Mother')))
            elif main_person_gender == 'Female':
                new_child['Mother'] = main_person_name
                # The father is the other parent, found via the spouse map
                new_child['Father'] = spouse_id_to_name.get(str(child_data.get('Father')))
            else: # Fallback if gender is not specified
                new_child['Father'] = "Unknown"
                new_child['Mother'] = "Unknown"

            new_person['Children'].append(new_child)

    # --- Siblings ---
    # Convert the Siblings dictionary to a list of simplified sibling objects
    if 'Siblings' in person_data and isinstance(person_data['Siblings'], dict):
        new_person['Siblings'] = []
        for sibling_data in person_data['Siblings'].values():
            new_sibling = {}
            for key in PROFILE_FIELDS:
                if key in sibling_data:
                    new_sibling[key] = sibling_data[key]
            new_person['Siblings'].append(new_sibling)

    return {'status': 'ok', 'person': new_person}


def get_ancestors(json_dict: Dict[str, Any]):
    """
    Get ancestors for a person using the WikiTree getAncestors API action.
    Args:
        json_dict (dict): JSON dictionary with parameters. Supported keys: Name, depth, fields, etc.
    Returns:
        dict: Ancestors data or error message
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {'status': 'error', 'error_message': 'JSON must represent an object with parameters.'}
    except Exception as e:
        return {'status': 'error', 'error_message': f'Invalid JSON: {str(e)}'}
    # Replace `Name` key with `key`
    if 'Name' in params:
        params['key'] = params.pop('Name')    
    params['action'] = 'getAncestors'
    # Convert fields list to comma-separated string if present
    if 'fields' in params and isinstance(params['fields'], list):
        params['fields'] = ','.join(params['fields'])
    # Set defaults if not provided
    params.setdefault('bioFormat', 'wiki')
    params.setdefault('resolveRedirect', 1)
    try:
        logger.debug(f"Requesting ancestors: {params}")
        response = rate_limited_get(WIKITREE_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Response: {data}")
        # Expecting a list with one dict
        if isinstance(data, list) and data:
            entry = data[0]
            # Error case: status is not 0 or ancestors missing
            if entry.get('status') != 0 or 'ancestors' not in entry:
                return {'status': 'error', 'error_message': entry.get('status', 'Unknown error')}
            # Remove the first ancestor (the profile itself)
            ancestors = entry['ancestors'][1:] if len(entry['ancestors']) > 1 else []
            return {'status': 'ok', 'ancestors': ancestors}
        else:
            return {'status': 'error', 'error_message': 'Unexpected API response'}
    except requests.RequestException as e:
        logger.error(f"API request failed: {e}")
        return {'status': 'error', 'error_message': str(e)}


def get_descendants(json_dict: Dict[str, Any]):
    """
    Get descendants for a person using the WikiTree getDescendants API action.
    Args:
        json_dict (dict): JSON dictionary with parameters. Supported keys: Name, depth, fields, etc.
    Returns:
        dict: Descendants data or error message
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {'status': 'error', 'error_message': 'JSON must represent an object with parameters.'}
    except Exception as e:
        return {'status': 'error', 'error_message': f'Invalid JSON: {str(e)}'}
    # Replace `Name` key with `key`
    if 'Name' in params:
        params['key'] = params.pop('Name')    
    params['action'] = 'getDescendants'
    # Convert fields list to comma-separated string if present
    if 'fields' in params and isinstance(params['fields'], list):
        params['fields'] = ','.join(params['fields'])
    # Set defaults if not provided
    params.setdefault('bioFormat', 'wiki')
    params.setdefault('resolveRedirect', 1)
    try:
        logger.debug(f"Requesting descendants: {params}")
        response = rate_limited_get(WIKITREE_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Response: {data}")
        # Expecting a list with one dict
        if isinstance(data, list) and data:
            entry = data[0]
            # Error case: status is not 0 or descendants missing
            if entry.get('status') != 0 or 'descendants' not in entry:
                return {'status': 'error', 'error_message': entry.get('status', 'Unknown error')}
            # Remove the first descendant (the profile itself)
            descendants = entry['descendants'][1:] if len(entry['descendants']) > 1 else []
            return {'status': 'ok', 'descendants': descendants}
        else:
            return {'status': 'error', 'error_message': 'Unexpected API response'}
    except requests.RequestException as e:
        logger.error(f"API request failed: {e}")
        return {'status': 'error', 'error_message': str(e)}


def get_relatives(json_dict: Dict[str, Any]):
    """
    Get relatives (parents, siblings, spouses) for a person using the WikiTree getRelatives API action.
    Args:
        JSON dictionary with parameters. Supported keys: Name, fields, etc.
    Returns:
        dict: Relatives data or error message
    """
    try:
        if isinstance(json_dict, dict):
            params = json_dict
        else:
            params = json.loads(json_dict)
        if not isinstance(params, dict):
            return {'status': 'error', 'error_message': 'JSON must represent an object with parameters.'}
    except Exception as e:
        return {'status': 'error', 'error_message': f'Invalid JSON: {str(e)}'}
    # Replace `Name` key with `keys` (note: plural!)
    if 'Name' in params:
        params['keys'] = params.pop('Name')
    params['action'] = 'getRelatives'
    params['getParents'] = 1
    params['getSiblings'] = 1
    params['getSpouses'] = 1
    params['getChildren'] = 1
    # Convert fields list to comma-separated string if present
    if 'fields' in params and isinstance(params['fields'], list):
        if 'Id' not in params['fields']:
            params['fields'].append('Id')
        if 'Name' not in params['fields']:
            params['fields'].append('Name')
        if 'Gender' not in params['fields']:
            params['fields'].append('Gender')
        params['fields'] = ','.join(params['fields'])
    # Set defaults if not provided
    params.setdefault('bioFormat', 'wiki')
    params.setdefault('resolveRedirect', 1)
    try:
        logger.debug(f"Requesting relatives: {params}")
        response = rate_limited_get(WIKITREE_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Response: {data}")
        if isinstance(data, dict) and 'error' in data:
            return {'status': 'error', 'error_message': data['error']}
        if len(data) > 0:
            if 'items' in data[0] and isinstance(data[0]['items'], list) and len(data[0]['items']) > 0:
                if 'person' in data[0]['items'][0]:
                    entry = data[0]['items'][0]
                    entry['person']['UserId'] = entry['user_id']
                    return {'status': 'ok', 'person': entry['person']}
                else:
                    return {'status': 'error', 'error_message': 'No `items[0].person` object returned from API'}
            else:
                return {'status': 'error', 'error_message': '`items` is missing or not a non-empty list in API response'}
        else:
            return {'status': 'error', 'error_message': 'Empty array returned from API'}
    except requests.RequestException as e:
        logger.error(f"API request failed: {e}")
        return {'status': 'error', 'error_message': str(e)}
