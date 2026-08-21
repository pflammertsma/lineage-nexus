"""
Search and record lookup endpoints.
"""

import time

from phonetics import phonetic
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



def _search_with_variants(index, query, params, fuzzy):
  """
  Runs the query as typed, then again phonetically, and merges.

  The phonetic field stores keys, not names: `names_p` for the 1848 baptism of
  Clasina Cornelia Spruijt holds "klasina kornelia spruit". Sending the raw
  query at it therefore matched nothing at all — "cornelia" is not "kornelia" —
  so the field sat unused until the query was keyed the same way the documents
  were. Measured on that record: raw query 0 hits, keyed query 16.

  Exact hits are kept ahead of phonetic ones. Spelling a name the way the clerk
  spelled it is evidence, and a search that buries the record you typed exactly
  underneath its variants is worse than one that never finds them.
  """
  exact = index.search(query, dict(params))
  hits = list(exact.get("hits", []))
  for hit in hits:
    hit["_match"] = "exact"

  if not fuzzy:
    return exact

  keyed = phonetic(query)
  if not keyed or keyed == query.lower():
    return exact

  variant_params = dict(params)
  # The keys live in their own attribute; searching anywhere else would compare
  # a key against a name and find nothing.
  variant_params["attributesToSearchOn"] = ["names_p"]
  variants = index.search(keyed, variant_params)

  seen = {h.get("id") for h in hits}
  for hit in variants.get("hits", []):
    if hit.get("id") in seen:
      continue
    hit["_match"] = "phonetic"
    hits.append(hit)

  return {
    "hits": hits,
    "estimatedTotalHits": max(exact.get("estimatedTotalHits", 0),
                              variants.get("estimatedTotalHits", 0)),
    "processingTimeMs": (exact.get("processingTimeMs", 0)
                         + variants.get("processingTimeMs", 0)),
  }


@router.get("/api/v1/admin/query", dependencies=[Depends(require_admin)])
def admin_query(
  q: Optional[str] = Query("", description="Free-text name or place"),
  archive: Optional[str] = Query(None, description="Restrict to one archive code"),
  kind: Optional[str] = Query(None, description="Restrict to record types (comma-separated or single)"),
  place: Optional[str] = Query(None, description="Restrict to event place / city"),
  event_type: Optional[str] = Query(None, description="Restrict to event type"),
  year_min: Optional[int] = Query(None, description="Minimum event year"),
  year_max: Optional[int] = Query(None, description="Maximum event year"),
  father: Optional[str] = Query(None, description="Restrict father name"),
  mother: Optional[str] = Query(None, description="Restrict mother name"),
  child: Optional[str] = Query(None, description="Restrict child / deceased name"),
  spouse: Optional[str] = Query(None, description="Restrict spouse / partner name"),
  role: Optional[str] = Query(None, description="Restrict to specific person role slug"),
  fuzzy: bool = Query(
    True,
    description="Also match names that sound the same but are spelled "
                "differently — Clasina/Klasina/Klazina, Hogervegt/Hoogervegt. "
                "Exact spellings are always ranked first.",
  ),
  names_only: bool = Query(
    True,
    description="Search person names only. Off widens the search to place, "
                "record type and institution, which is useful for browsing but "
                "lets a place name answer a person query.",
  ),
  limit: int = Query(20, ge=1, le=100),
):
  """Raw index search with parametric and inline query syntax filtering."""
  index = meili_client.index(INDEX_NAME)

  raw_q = q or ""
  clean_q, inline_filters = _parse_inline_query_filters(raw_q)
  target_q = clean_q if clean_q else raw_q

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

  if father:
    f_p = phonetic(father)
    if f_p:
      filters.append(f"(s_father = '{f_p}' OR s_groom_father = '{f_p}' OR s_bride_father = '{f_p}' OR g_father = '{f_p}' OR g_groom_father = '{f_p}' OR g_bride_father = '{f_p}')")

  if mother:
    m_p = phonetic(mother)
    if m_p:
      filters.append(f"(s_mother = '{m_p}' OR s_groom_mother = '{m_p}' OR s_bride_mother = '{m_p}' OR g_mother = '{m_p}' OR g_groom_mother = '{m_p}' OR g_bride_mother = '{m_p}')")

  if child:
    c_p = phonetic(child)
    if c_p:
      filters.append(f"(s_child = '{c_p}' OR s_deceased = '{c_p}' OR g_child = '{c_p}' OR g_deceased = '{c_p}')")

  if spouse:
    sp_p = phonetic(spouse)
    if sp_p:
      filters.append(f"(s_partner = '{sp_p}' OR s_groom = '{sp_p}' OR s_bride = '{sp_p}' OR g_partner = '{sp_p}' OR g_groom = '{sp_p}' OR g_bride = '{sp_p}')")

  if role:
    if role == "mother":
      filters.append("(roles = 'mother' OR roles = 'groom_mother' OR roles = 'bride_mother')")
    elif role == "father":
      filters.append("(roles = 'father' OR roles = 'groom_father' OR roles = 'bride_father')")
    elif role in ("spouse", "partner"):
      filters.append("(roles = 'partner' OR roles = 'groom' OR roles = 'bride')")
    elif role == "child":
      filters.append("(roles = 'child' OR roles = 'registered')")
    else:
      filters.append(f"roles = '{role}'")

  params: Dict[str, Any] = {"limit": limit}
  if filters:
    params["filter"] = " AND ".join(filters)

  # Every term must match. Meilisearch defaults to `last`, which drops trailing
  # words until something matches — so "Jan de Vries" happily returned records
  # containing only "Jan", which is how a place called "Sint Jan bij Yperen"
  # outranked actual people. Verified on an isolated index: `all` keeps the
  # intended record and drops the near-misses.
  params["matchingStrategy"] = "all"

  # Restrict a person search to person names, so places and record types cannot
  # answer it. Measured: searching "Jan" across all attributes returns the
  # "Sint Jan bij Yperen" record; restricted to names it does not.
  if names_only:
    params["attributesToSearchOn"] = ["names"]

  started = time.time()
  try:
    results = _search_with_variants(index, target_q, params, fuzzy)
  except Exception as exc:
    return {"status": "error", "error_message": str(exc)}

  hits = []
  for hit in results.get("hits", []):
    hits.append({
      "id": hit.get("id"),
      # "exact" when the spelling as typed matched, "phonetic" when only the
      # sound did. Lets the UI say why a differently-spelled record is here.
      "match": hit.get("_match", "exact"),
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
