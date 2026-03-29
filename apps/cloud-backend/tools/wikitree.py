import httpx
import json
from typing import Dict, Any, List, Optional

WIKITREE_INSTRUCTIONS = r"""
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
    """
    Search for existing WikiTree profiles by name, dates, or other fields.
    Crucial: ALWAYS include 'Bio' and 'Name' in requested fields list.
    """
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
    
    from tools.utils import report_status
    await report_status(f"Searching WikiTree for profiles: {first_name} {last_name}...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(WIKITREE_API_URL, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and 'error' in data:
                return {'status': 'error', 'error_message': data['error']}
            
            results = data if isinstance(data, list) else data.get('results', data)
            await report_status(f"Found {len(results)} potential WikiTree matches.")
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
    from tools.utils import report_status
    await report_status(f"Fetching full research context for WikiTree profile: {profile_id}...")
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
