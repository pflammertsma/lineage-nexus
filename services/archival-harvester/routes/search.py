"""
Search and record lookup endpoints.
"""

import time
import re
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Query, HTTPException, Depends

from config import meili_client, INDEX_NAME
from auth import require_admin

router = APIRouter()

_INLINE_FILTER_RE = re.compile(r'\b(place|loc|location|year|type|kind|archive):([^\s]+)', re.IGNORECASE)


def _parse_inline_query_filters(q_str: str) -> Tuple[str, Dict[str, Any]]:
  """Extracts inline filters like place:Leeuwarden year:1840..1860 type:birth from query string."""
  if not q_str:
    return "", {}
  extracted: Dict[str, Any] = {}
  clean_parts = []

  for token in q_str.split():
    match = _INLINE_FILTER_RE.match(token)
    if match:
      key = match.group(1).lower()
      val = match.group(2).strip()
      if key in ("place", "loc", "location"):
        extracted["place"] = val.replace("_", " ")
      elif key == "archive":
        extracted["archive"] = val
      elif key in ("type", "kind"):
        v_low = val.lower()
        if v_low in ("birth", "geboorte", "doop", "baptisms", "bsg", "dtb_d"):
          extracted["kind"] = ["bsg", "dtb_d"]
        elif v_low in ("marriage", "huwelijk", "trouwen", "bsh", "dtb_t"):
          extracted["kind"] = ["bsh", "dtb_t"]
        elif v_low in ("death", "overlijden", "begraven", "bso", "dtb_b"):
          extracted["kind"] = ["bso", "dtb_b"]
        elif v_low in ("population", "bevolking", "bev"):
          extracted["kind"] = ["bev"]
        elif v_low in ("notary", "notarieel", "not"):
          extracted["kind"] = ["not"]
        else:
          extracted["kind"] = [val]
      elif key == "year":
        if ".." in val:
          parts = val.split("..")
          if parts[0].isdigit():
            extracted["year_min"] = int(parts[0])
          if len(parts) > 1 and parts[1].isdigit():
            extracted["year_max"] = int(parts[1])
        elif val.isdigit():
          extracted["year_min"] = int(val)
          extracted["year_max"] = int(val)
    else:
      clean_parts.append(token)

  return " ".join(clean_parts), extracted


@router.get("/api/v1/search")
def search_records(
  name: str = Query(..., description="Query names or patronymics"),
  eventplace: Optional[str] = Query(None, description="Event city or place name"),
  eventtype: Optional[str] = Query(None, description="Event type (Geboorte, Huwelijk, Overlijden)"),
  year_min: Optional[int] = Query(None, description="Minimum event year"),
  year_max: Optional[int] = Query(None, description="Maximum event year"),
  start: int = Query(0, ge=0),
  number_show: int = Query(30, le=100)
):
  """Performs sub-50ms search over self-hosted Dutch archival records."""
  index = meili_client.index(INDEX_NAME)

  filter_conditions = []
  if eventplace:
    escaped_place = eventplace.replace("'", "\\'")
    filter_conditions.append(f"event_place = '{escaped_place}'")
  if eventtype:
    filter_conditions.append(f"event_type = '{eventtype}'")
  if year_min is not None:
    filter_conditions.append(f"event_year >= {year_min}")
  if year_max is not None:
    filter_conditions.append(f"event_year <= {year_max}")

  search_params = {
    "limit": number_show,
    "offset": start,
  }
  if filter_conditions:
    search_params["filter"] = " AND ".join(filter_conditions)

  try:
    results = index.search(name, search_params)
    docs = results.get("hits", [])
    total_found = results.get("estimatedTotalHits", len(docs))

    return {
      "status": "success",
      "total_found": total_found,
      "number_found": total_found,
      "records": docs
    }
  except Exception as e:
    return {"status": "error", "error_message": str(e)}


@router.get("/api/v1/record/{archive_code}/{identifier}")
def get_record(archive_code: str, identifier: str):
  """Retrieves a single record by archive code and identifier."""
  doc_id = f"{archive_code}_{identifier}".replace(":", "_").replace("-", "_")
  try:
    index = meili_client.index(INDEX_NAME)
    doc = index.get_document(doc_id)
    return {"status": "success", "record": doc}
  except Exception as e:
    raise HTTPException(status_code=404, detail=f"Record not found: {str(e)}")


@router.get("/api/v1/admin/query", dependencies=[Depends(require_admin)])
def admin_query(
  q: str = Query(..., min_length=1, description="Free-text name or place"),
  archive: Optional[str] = Query(None, description="Restrict to one archive code"),
  kind: Optional[str] = Query(None, description="Restrict to record types (comma-separated or single)"),
  place: Optional[str] = Query(None, description="Restrict to event place / city"),
  event_type: Optional[str] = Query(None, description="Restrict to event type"),
  year_min: Optional[int] = Query(None, description="Minimum event year"),
  year_max: Optional[int] = Query(None, description="Maximum event year"),
  limit: int = Query(20, ge=1, le=100),
):
  """Raw index search with parametric and inline query syntax filtering."""
  index = meili_client.index(INDEX_NAME)

  clean_q, inline_filters = _parse_inline_query_filters(q)
  target_q = clean_q if clean_q else q

  target_archive = archive or inline_filters.get("archive")
  target_kind = kind.split(",") if kind else inline_filters.get("kind")
  target_place = place or inline_filters.get("place")
  target_event_type = event_type or inline_filters.get("event_type")
  target_year_min = year_min if year_min is not None else inline_filters.get("year_min")
  target_year_max = year_max if year_max is not None else inline_filters.get("year_max")

  filters = []
  if target_archive:
    filters.append(f"archive = '{target_archive}'")

  if target_kind:
    if isinstance(target_kind, list):
      kind_or = " OR ".join(f"kind = '{k.strip()}'" for k in target_kind)
      filters.append(f"({kind_or})")
    else:
      filters.append(f"kind = '{target_kind}'")
  elif target_event_type:
    filters.append(f"event_type = '{target_event_type}'")

  if target_place:
    escaped_place = target_place.replace("'", "\\'")
    filters.append(f"event_place = '{escaped_place}'")

  if target_year_min is not None:
    filters.append(f"event_year >= {target_year_min}")

  if target_year_max is not None:
    filters.append(f"event_year <= {target_year_max}")

  params: Dict[str, Any] = {"limit": limit}
  if filters:
    params["filter"] = " AND ".join(filters)

  started = time.time()
  try:
    results = index.search(target_q, params)
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  hits = []
  for hit in results.get("hits", []):
    hits.append({
      "id": hit.get("id"),
      "names": hit.get("names", ""),
      "persons": hit.get("persons", []),
      "event_type": hit.get("event_type", ""),
      "event_date": hit.get("event_date", ""),
      "event_place": hit.get("event_place", ""),
      "raw": hit,
      "source": {
        "archive": hit.get("archive", ""),
        "kind": hit.get("kind", ""),
        "institution": hit.get("institution", ""),
        "index": INDEX_NAME,
        "last_changed": hit.get("last_changed", ""),
      },
      "url": hit.get("url", ""),
    })

  return {
    "status": "success",
    "query": q,
    "took_ms": round((time.time() - started) * 1000, 1),
    "estimated_total": results.get("estimatedTotalHits", len(hits)),
    "returned": len(hits),
    "hits": hits,
  }
