import asyncio
import json
import logging
import os
import re
import time
from typing import Dict, Any, List, Optional
import httpx
import meilisearch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("archival-harvester")

MEILI_HOST = os.environ.get("MEILI_HOST", "http://127.0.0.1:7700")
MEILI_MASTER_KEY = os.environ.get("MEILI_MASTER_KEY", "")
INDEX_NAME = "records"

meili_client = meilisearch.Client(MEILI_HOST, MEILI_MASTER_KEY)

def configure_meilisearch_index():
  """Initialises and configures Meilisearch index settings for archival search."""
  logger.info(f"Connecting to Meilisearch at {MEILI_HOST}...")
  index = meili_client.index(INDEX_NAME)

  # Configure searchable & filterable attributes
  index.update_settings({
    "searchableAttributes": [
      "full_names",
      "person_names",
      "event_place",
      "deed_type",
      "archive_name",
      "event_year"
    ],
    "filterableAttributes": [
      "event_type",
      "event_year",
      "event_place",
      "archive_code",
      "province"
    ],
    "rankingRules": [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness"
    ],
    "typoTolerance": {
      "enabled": True,
      "minWordSizeForTypos": {
        "oneTypo": 4,
        "twoTypos": 8
      }
    }
  })
  logger.info("Meilisearch index settings updated successfully.")
  return index

def transform_a2a_record(raw: Dict[str, Any], archive_code: str, identifier: str) -> Dict[str, Any]:
  """
  Transforms a raw archival deed/A2A record into a unified JSON document
  optimized for high-speed indexing and Gemini agent retrieval.
  """
  doc_id = f"{archive_code}_{identifier}".replace(":", "_").replace("-", "_")
  
  event_data = raw.get("Event", {})
  event_type = event_data.get("EventType", raw.get("RecordType", "Unknown"))
  event_date = event_data.get("EventDate", {}).get("Year", "")
  event_place = event_data.get("EventPlace", raw.get("Place", ""))

  persons = raw.get("Person", [])
  if isinstance(persons, dict):
    persons = [persons]

  person_names = []
  full_names = []

  formatted_persons = []
  for p in persons:
    name_parts = []
    fname = p.get("PersonName", {}).get("PersonNameFirstName", "")
    prefix = p.get("PersonName", {}).get("PersonNamePrefix", "")
    lname = p.get("PersonName", {}).get("PersonNameLastName", "")
    patronym = p.get("PersonName", {}).get("PersonNamePatronym", "")

    if fname: name_parts.append(fname)
    if patronym: name_parts.append(patronym)
    if prefix: name_parts.append(prefix)
    if lname: name_parts.append(lname)

    full_name = " ".join(filter(None, name_parts)) or p.get("FullName", "Onbekend")
    person_names.append(full_name)
    full_names.append(full_name)

    formatted_persons.append({
      "RelationType": p.get("RelationType", "Betrokkene"),
      "PersonName": {
        "PersonNameFirstName": fname,
        "PersonNamePrefix": prefix,
        "PersonNameLastName": lname
      },
      "FullName": full_name,
      "Gender": p.get("Gender", "")
    })

  return {
    "id": doc_id,
    "archive_code": archive_code,
    "identifier": identifier,
    "event_type": event_type,
    "event_year": str(event_date) if event_date else "",
    "event_place": event_place,
    "person_names": person_names,
    "full_names": " ".join(full_names),
    "Person": formatted_persons,
    "Event": event_data,
    "Source": raw.get("Source", {}),
    "OpenArchievenLink": {
      "archive_code": archive_code,
      "identifier": identifier
    }
  }

async def batch_index_documents(index, documents: List[Dict[str, Any]], batch_size: int = 1000):
  """Pushes batches of documents into the Meilisearch index."""
  total = len(documents)
  for i in range(0, total, batch_size):
    chunk = documents[i:i + batch_size]
    task = index.add_documents(chunk)
    logger.info(f"Indexed batch {i // batch_size + 1}/{(total + batch_size - 1) // batch_size} ({len(chunk)} docs) - Task ID: {task.task_uid}")

if __name__ == "__main__":
  idx = configure_meilisearch_index()
  logger.info("Harvester initialized and ready for bulk data ingestion.")
