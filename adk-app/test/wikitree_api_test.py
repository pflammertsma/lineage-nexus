from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.api.wikitree_api import search_profiles, get_person, get_profile, get_ancestors, get_descendants, get_relatives
import json

"""
Test the WikiTree API functions.

To execute:
```
python -m adk_app.wikitree_api_test
```
"""
print("Testing WikiTree API...")

# Example for reading wiewaswie
params = {"Name": "Slijt-6", "fields": ["Name", "BirthDate", "DeathDate"]}
result = get_relatives(json.dumps(params))
print("\nget_relatives:")
print(json.dumps(result, indent=2))

# Example for search_profiles
params = {"FirstName": "Migchiel", "LastName": "Slijt", "limit": 5, "fields": ["Name", "BirthDate"]}
result = search_profiles(json.dumps(params))
print("\nsearch_profiles:")
print(json.dumps(result, indent=2))

# Example for get_person
params = {"Id": "47227210", "fields": ["Id", "Name", "BirthDate"]}
result = get_person(json.dumps(params))
print("\nget_person:")
print(json.dumps(result, indent=2))

# Example for get_person
params = {"Name": "Slijt-6", "fields": ["Id", "Name", "BirthDate"]}
result = get_person(json.dumps(params))
print("\nget_person:")
print(json.dumps(result, indent=2))

# Example for get_profile
params = {"Name": "Slijt-6", "fields": ["Id", "Name", "BirthDate", "DeathDate", "Bio"]}
result = get_profile(json.dumps(params))
print("\nget_profile:")
print(json.dumps(result, indent=2))

# # Example for get_ancestors
# params = {"Name": "Slijt-6", "depth": 2, "fields": ["Name", "BirthDate"]}
# result = get_ancestors(json.dumps(params))
# print("\nget_ancestors:")
# print(json.dumps(result, indent=2))

# # Example for get_descendants
# params = {"Name": "Slijt-6", "depth": 2, "fields": ["Name", "BirthDate"]}
# result = get_descendants(json.dumps(params))
# print("\nget_descendants:")
# print(json.dumps(result, indent=2))

# Example for get_relatives
params = {"Name": "Slijt-6", "fields": ["Name", "BirthDate", "DeathDate"]}
result = get_relatives(json.dumps(params))
print("\nget_relatives:")
print(json.dumps(result, indent=2))
