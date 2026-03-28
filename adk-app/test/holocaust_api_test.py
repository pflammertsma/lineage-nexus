from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.agent.holocaust import holocaust_search
from adk_app.api.joodsmonument_api import joodsmonument_read_document
from adk_app.api.oorlogsbronnen_api import oorlogsbronnen_search, oorlogsbronnen_read_document
from adk_app.util.utils import print_truncated
import json

"""
Test various holocaust API functions.

To execute:
```
python -m adk_app.test.holocaust_api_test
```
"""

print("Testing searching Het Joods Monument...")

doc_id = '132258'
print(f'\njoodsmonument_read_document: "{doc_id}"')
result = joodsmonument_read_document(doc_id)
print_truncated(result, length=400)

print("Testing searching Oorlogsbronnen...")

query = "Emma van Dam"
print(f'\noorlogsbronnen_search: "{query}"')
result = oorlogsbronnen_search(query)
print_truncated(json.dumps(result, indent=2, length=400))


doc_id = "ef6921e2-9f3f-4872-96d1-4d45797df390"
print(f'\noorlogsbronnen_read_document: "{doc_id}"')
result = oorlogsbronnen_read_document(doc_id)
print_truncated(json.dumps(result, indent=2), length=400)

print("Testing searching combined Holocaust search...")

query = "Emma van Dam"
print(f'\nholocaust_search: "{query}"')
result = holocaust_search(query)
print_truncated(json.dumps(result, indent=2), length=400)
