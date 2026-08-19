import os
import httpx
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("local_archive")

LOCAL_ARCHIVE_URL = os.environ.get("LOCAL_ARCHIVE_URL", "https://api.lineage.nexus")

async def local_archives_search(
  query: str,
  eventplace: Optional[str] = None,
  eventtype: Optional[str] = None,
  page: int = 1
) -> Dict[str, Any]:
  """
  Performs high-speed search against the self-hosted Dutch Archival Engine (OCI).
  Bypasses rate limits and delivers sub-10ms response times.
  """
  params = {
    "name": query,
    "start": max(0, page - 1) * 30,
    "number_show": 30
  }
  if eventplace: params["eventplace"] = eventplace
  if eventtype: params["eventtype"] = eventtype

  url = f"{LOCAL_ARCHIVE_URL}/api/v1/search"
  async with httpx.AsyncClient(timeout=10.0) as client:
    try:
      response = await client.get(url, params=params)
      response.raise_for_status()
      return response.json()
    except Exception as e:
      logger.error(f"Local archive query failed: {e}")
      return {"status": "error", "error_message": f"Local archive engine query failed: {str(e)}"}

async def local_archives_get_record(archive_code: str, identifier: str) -> Dict[str, Any]:
  """Fetches a specific record by archive code and identifier from the self-hosted engine."""
  url = f"{LOCAL_ARCHIVE_URL}/api/v1/record/{archive_code}/{identifier}"
  async with httpx.AsyncClient(timeout=10.0) as client:
    try:
      response = await client.get(url)
      response.raise_for_status()
      return response.json()
    except Exception as e:
      return {"status": "error", "error_message": f"Record retrieval failed: {str(e)}"}
