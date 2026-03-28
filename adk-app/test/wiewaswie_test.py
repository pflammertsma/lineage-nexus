from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.api.wiewaswie import extract_source_id
import json

"""
Test the WikiTree API functions.

To execute:
```
python -m adk_app.wiewaswie_test
```
"""
print("Testing fetching from WieWasWie...")

# Example for wiewaswie
result = extract_source_id("https://www.wiewaswie.nl/nl/detail/54731194")
print("\nsearch_profiles:")
print(result)
