from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.api.openarchieven_api import open_archives_search
from adk_app.util.utils import print_truncated
import json

"""
Test the WikiTree API functions.

To execute:
```
python -m adk_app.test.openarchieven_api_test
```
"""
print("Testing searching OpenArchieven...")

test_cases = [
    # SUCCESS CASES
    # Test basic search
    ('{"query": "Gabe Wiebrens"}', 
     "success"),
    # Test various combinations of filters
    ('{"query": "Gabe Wiebrens de Boer", "eventtype": "Huwelijk", "eventplace": "Bolsward"}', 
     "success"),
    # Test wildcard searches and multiple people
    ('{"query": "Wiebre* & Gabe Wiebrens & Hendriks"}',
     "success"),
    # Test limiting the number of results
    ('{"query": "Wiebre", "multi_page_search": true, "page": 2}', 
     "success"),
    # Test combined filters and wildcards
    ('{"query": "Wiebre* & Gabe Wiebrens & Hendriks", "eventtype": "Huwelijk", "eventplace": "Bolsward"}', 
     "success"),
    # FAILURE CASES
    # Test that too narrow date range gives an informative error
    ('{"query": "Gabe Wiebrens & Hendriks 1900-1950"}', 
     "error"),
    # Test that the query fails due to text following the date range
    ('{"query": "Gabe Wiebrens 1900-1950 Hendriks"}', 
     "error"),
    # Test that multiple AND operators are not allowed
    ('{"query": "A & B & C & D"}', 
     "error"),
]

for query, expected_status in test_cases:
    print(f'\nopen_archives_search: "{query}"')
    result = open_archives_search(query)
    print_truncated(json.dumps(result, indent=2), length=400)
    assert result.get("status") == expected_status
