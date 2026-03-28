import httpx
import json
from typing import Dict, Any, List, Optional

WIKITREE_API_URL = "https://api.wikitree.com/api.php"

PROFILE_FIELDS = [
    "Name", "BirthDate", "BirthLocation", "DeathDate", "DeathLocation",
    "FirstName", "MiddleName", "LastNameAtBirth", "LastNameCurrent", 
    "Bio", "bio", "Gender"
]

async def search_profiles(
    first_name: Optional[str] = None, 
    last_name: Optional[str] = None, 
    birth_date: Optional[str] = None, 
    death_date: Optional[str] = None, 
    limit: int = 10,
    fields: Optional[List[str]] = None
) -> dict:
    params = {
        "action": "searchPerson",
        "FirstName": first_name,
        "LastName": last_name,
        "BirthDate": birth_date,
        "DeathDate": death_date,
        "limit": limit
    }
    if fields:
        params["fields"] = ",".join(fields)
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(WIKITREE_API_URL, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and 'error' in data:
                return {'status': 'error', 'error_message': data['error']}
            
            results = data if isinstance(data, list) else data.get('results', data)
            return {'status': 'ok', 'results': results}
        except Exception as e:
            return {'status': 'error', 'error_message': str(e)}

async def get_person_info(name_or_id: str, fields: Optional[List[str]] = None) -> dict:
    params = {
        "action": "getPerson",
        "key": name_or_id,
        "bioFormat": "wiki",
        "resolveRedirect": 1
    }
    if fields:
        params["fields"] = ",".join(fields)
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(WIKITREE_API_URL, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and 'error' in data:
                return {'status': 'error', 'error_message': data['error']}
            
            person = data if isinstance(data, list) else data.get('person', data)
            return {'status': 'ok', 'person': person}
        except Exception as e:
            return {'status': 'error', 'error_message': str(e)}

async def get_relatives_info(name: str, fields: Optional[List[str]] = None) -> dict:
    params = {
        "action": "getRelatives",
        "keys": name,
        "getParents": 1,
        "getSiblings": 1,
        "getSpouses": 1,
        "getChildren": 1,
        "bioFormat": "wiki",
        "resolveRedirect": 1
    }
    
    actual_fields = (fields or []).copy()
    for f in ["Id", "Name", "Gender"]:
        if f not in actual_fields:
            actual_fields.append(f)
    params["fields"] = ",".join(actual_fields)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(WIKITREE_API_URL, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                item = data[0].get('items', [{}])[0]
                if 'person' in item:
                    return {'status': 'ok', 'person': item['person']}
            return {'status': 'error', 'error_message': 'No data returned or invalid format'}
        except Exception as e:
            return {'status': 'error', 'error_message': str(e)}

async def get_full_profile(profile_id: str) -> dict:
    data = await get_relatives_info(profile_id, fields=PROFILE_FIELDS)
    if data.get('status') != 'ok':
        return data
    
    person_data = data['person']
    new_person = {k: person_data[k] for k in PROFILE_FIELDS if k in person_data}

    # Helper to parse relative lists
    def parse_relative(rel_data):
        return {k: rel_data[k] for k in PROFILE_FIELDS if k in rel_data}

    # Parents
    if 'Parents' in person_data and isinstance(person_data['Parents'], dict):
        father_id = str(person_data.get('Father', ''))
        mother_id = str(person_data.get('Mother', ''))
        if father_id in person_data['Parents']:
            new_person['Father'] = parse_relative(person_data['Parents'][father_id])
        if mother_id in person_data['Parents']:
            new_person['Mother'] = parse_relative(person_data['Parents'][mother_id])

    # Spouses
    spouse_map = {}
    if 'Spouses' in person_data and isinstance(person_data['Spouses'], dict):
        new_person['Spouses'] = []
        for sid, sdata in person_data['Spouses'].items():
            spouse_map[sid] = sdata.get('Name')
            new_person['Spouses'].append(parse_relative(sdata))

    # Children
    if 'Children' in person_data and isinstance(person_data['Children'], dict):
        new_person['Children'] = []
        main_name = person_data.get('Name')
        main_gender = person_data.get('Gender')
        for cid, cdata in person_data['Children'].items():
            child = parse_relative(cdata)
            if main_gender == 'Male':
                child['Father'] = main_name
                child['Mother'] = spouse_map.get(str(cdata.get('Mother')))
            else:
                child['Mother'] = main_name
                child['Father'] = spouse_map.get(str(cdata.get('Father')))
            new_person['Children'].append(child)

    # Siblings
    if 'Siblings' in person_data and isinstance(person_data['Siblings'], dict):
        new_person['Siblings'] = [parse_relative(s) for s in person_data['Siblings'].values()]

    return {'status': 'ok', 'person': new_person}
