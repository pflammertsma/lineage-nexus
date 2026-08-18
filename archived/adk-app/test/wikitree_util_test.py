from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.wikitree_util import get_profile
import json

"""
Test the WikiTree API functions.

To execute:
```
python -m adk_app.wikitree_api_simple_test
```
"""
logger.info("Testing WikiTree API...")

# Example for get_profile_simple
result = get_profile('Hendriks-3273')
print("\nget_profile_simple:")
print(json.dumps(result, indent=2))
