"""
Search and record lookup endpoints.
"""

import time
import concurrent.futures

from phonetics import phonetic, phonetic_all
import re
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Query, HTTPException, Depends

from config import meili_client, INDEX_NAME
from auth import require_admin

router = APIRouter()

_INLINE_FILTER_RE = re.compile(
    r'\b(place|loc|location|date|year|type|kind|archive|father|mother|child|spouse|witness|role):([^\s]+)',
    re.IGNORECASE
)


def _parse_inline_query_filters(q_str: str) -> Tuple[str, Dict[str, Any]]:
  """Extracts inline filters like place:Leeuwarden date:1848-10-02..1852-05-10 type:birth archive:arg father:Jacob mother:Jacoba witness:Leendert_Vis from query string."""
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
      elif key in ("date", "year"):
        if val.startswith(">="):
          v = val[2:]
          extracted["date_ge"] = v
        elif val.startswith(">"):
          v = val[1:]
          extracted["date_gt"] = v
        elif val.startswith("<="):
          v = val[2:]
          extracted["date_le"] = v
        elif val.startswith("<"):
          v = val[1:]
          extracted["date_lt"] = v
        elif ".." in val:
          parts = val.split("..")
          if parts[0]:
            extracted["date_ge"] = parts[0]
          if len(parts) > 1 and parts[1]:
            extracted["date_le"] = parts[1]
        elif "-" in val:
          extracted["date_exact"] = val
        elif val.isdigit():
          extracted["date_exact"] = val
      elif key in ("father", "mother", "child", "spouse", "witness"):
        name_val = val.replace("_", " ")
        if "relatives" not in extracted:
          extracted["relatives"] = []
        extracted["relatives"].append({"role": key, "name": name_val})
        extracted[key] = name_val
      elif key == "role":
        extracted["role"] = val.lower()
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



def _is_literal_match(query: str, hit: Dict[str, Any]) -> bool:
  """
  True when every query token appears, as spelled, in the hit's own name text.

  Whether a hit came back from the exact-text pass or the phonetic-key pass
  says nothing about whether its *spelling* matches — see the comment below on
  reclassification. This checks the document itself instead of trusting which
  query happened to surface it.
  """
  tokens = [t for t in re.split(r"\s+", query.lower()) if t]
  if not tokens:
    return False
  names_lower = (hit.get("names") or "").lower()
  return all(t in names_lower for t in tokens)


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

  The two searches run concurrently: they are independent HTTP calls to the
  same Meilisearch instance, and running them sequentially was pure added
  latency with nothing to show for it.
  """
  keyed = phonetic(query) if (fuzzy and query) else None
  run_phonetic = bool(keyed) and keyed != query.lower()

  variant_params = dict(params)
  # The keys live in their own attribute; searching anywhere else would compare
  # a key against a name and find nothing.
  variant_params["attributesToSearchOn"] = ["names_p"]

  if run_phonetic:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
      exact_future = pool.submit(index.search, query, dict(params))
      variants_future = pool.submit(index.search, keyed, variant_params)
      exact = exact_future.result()
      variants = variants_future.result()
  else:
    exact = index.search(query, dict(params))
    variants = None

  hits = list(exact.get("hits", []))
  for hit in hits:
    hit["_match"] = "exact"

  if not run_phonetic:
    return exact

  seen = {h.get("id") for h in hits}
  for hit in variants.get("hits", []):
    if hit.get("id") in seen:
      continue
    hit["_match"] = "phonetic"
    hits.append(hit)

  # A hit's own spelling decides the badge, not which pass found it. The two
  # passes rank over different fields with different candidate pools — a
  # common surname can have 1000+ exact hits, far more than either pass
  # returns, so a genuinely exact spelling can rank outside the exact pass's
  # own result window while still landing inside the phonetic pass's. That
  # mislabelled an exact "Lammertsma" as "sounds alike" simply because the
  # phonetic pass (over "lamertsma", the folded key) surfaced it and the exact
  # pass's top 50 out of 1000+ hits happened not to. Only upgrading
  # phonetic -> exact here, never the reverse: an exact-pass hit can still be a
  # typo-tolerance match rather than a true exact spelling, and this check
  # cannot tell those apart, so it should not relabel away from "exact".
  for hit in hits:
    if hit.get("_match") == "phonetic" and _is_literal_match(query, hit):
      hit["_match"] = "exact"

  # Rank merged hits by term coverage so a 3/3 token match (Klazina Cornelia Spruijt)
  # outranks a partial 2/3 token match (Clasina Margaretha Oppelaar), while exact
  # spellings maintain a tie-breaker preference on equal token coverage.
  q_p_tokens = set(phonetic_all(query)) if query else set()

  def _hit_score(hit):
    match_type = hit.get("_match", "exact")
    doc_p = set(hit.get("names_p", []))
    if not doc_p and hit.get("names"):
      doc_p = set(phonetic_all(hit.get("names")))
    overlap = len(q_p_tokens.intersection(doc_p)) if q_p_tokens else 0
    exact_bonus = 0.5 if match_type == "exact" else 0.0
    return (overlap + exact_bonus)

  hits.sort(key=_hit_score, reverse=True)

  return {
    "hits": hits,
    "estimatedTotalHits": max(exact.get("estimatedTotalHits", 0),
                              variants.get("estimatedTotalHits", 0)),
    "processingTimeMs": (exact.get("processingTimeMs", 0)
                         + variants.get("processingTimeMs", 0)),
  }


MONTH_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def _is_leap(y: int) -> bool:
  return (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)


def _parse_date_string_to_num_bounds(s: str):
  """Converts a date string (YYYY, YYYY-M, YYYY-MM-DD) to (min_num, max_num) YYYYMMDD integers."""
  if not s:
    return None, None
  parts = [p.strip() for p in s.split("-") if p.strip().isdigit()]
  if not parts:
    return None, None
  y = int(parts[0])
  if y <= 0:
    return None, None
  if len(parts) == 1:
    return (y * 10000 + 101, y * 10000 + 1231)
  elif len(parts) == 2:
    m = int(parts[1])
    if 1 <= m <= 12:
      max_day = 29 if (m == 2 and _is_leap(y)) else MONTH_DAYS[m]
      return (y * 10000 + m * 100 + 1, y * 10000 + m * 100 + max_day)
    return (y * 10000 + 101, y * 10000 + 1231)
  else:
    m = int(parts[1])
    d = int(parts[2])
    if 1 <= m <= 12 and 1 <= d <= 31:
      num = y * 10000 + m * 100 + d
      return num, num
    return (y * 10000 + 101, y * 10000 + 1231)


def _clean_meili_error(exc: Exception) -> str:
  msg = str(exc)
  if "invalid_search_filter" in msg or "invalid float literal" in msg:
    return "Invalid date or filter syntax. Date ranges use years (e.g. 1873 or 1840..1860). Exact dates use YYYY-MM-DD (e.g. 1873-07-25)."
  return msg


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
  target_date_exact = inline_filters.get("date_exact")
  target_father = father or inline_filters.get("father")
  target_mother = mother or inline_filters.get("mother")
  target_child = child or inline_filters.get("child")
  target_spouse = spouse or inline_filters.get("spouse")
  target_role = role or inline_filters.get("role")

  # Append relative names to text search query for backward compatibility with un-reindexed documents
  rel_names = [n for n in (target_father, target_mother, target_child, target_spouse) if n]
  if rel_names:
    extra_q = " ".join(rel_names)
    target_q = f"{target_q} {extra_q}".strip() if target_q else extra_q

  filters = []
  if target_archive:
    if "," in target_archive:
      arc_or = " OR ".join(f"archive = '{a.strip()}'" for a in target_archive.split(","))
      filters.append(f"({arc_or})")
    else:
      filters.append(f"archive = '{target_archive}'")

  if target_kind:
    if isinstance(target_kind, list):
      kind_or = " OR ".join(f"kind = '{k.strip()}'" for k in target_kind)
      filters.append(f"({kind_or})")
    else:
      filters.append(f"kind = '{target_kind}'")
  elif target_event_type:
    filters.append(f"event_type = '{target_event_type}'")

  target_date_ge = inline_filters.get("date_ge")
  target_date_gt = inline_filters.get("date_gt")
  target_date_le = inline_filters.get("date_le")
  target_date_lt = inline_filters.get("date_lt")
  target_date_exact = inline_filters.get("date_exact")

  if target_place:
    escaped_place = target_place.replace("'", "\\'")
    filters.append(f"event_place = '{escaped_place}'")

  if target_date_lt:
    min_b, max_b = _parse_date_string_to_num_bounds(target_date_lt)
    if min_b:
      y = int(str(min_b)[:4])
      filters.append(f"(date_min_num <= {min_b - 1} OR (date_min_num IS NULL AND event_year <= {y - 1}))")

  if target_date_le:
    min_b, max_b = _parse_date_string_to_num_bounds(target_date_le)
    if max_b:
      y = int(str(max_b)[:4])
      filters.append(f"(date_min_num <= {max_b} OR (date_min_num IS NULL AND event_year <= {y}))")

  if target_date_gt:
    min_b, max_b = _parse_date_string_to_num_bounds(target_date_gt)
    if max_b:
      y = int(str(max_b)[:4])
      filters.append(f"(date_max_num >= {max_b + 1} OR (date_max_num IS NULL AND event_year >= {y + 1}))")

  if target_date_ge:
    min_b, max_b = _parse_date_string_to_num_bounds(target_date_ge)
    if min_b:
      y = int(str(min_b)[:4])
      filters.append(f"(date_max_num >= {min_b} OR (date_max_num IS NULL AND event_year >= {y}))")

  if target_date_exact:
    min_b, max_b = _parse_date_string_to_num_bounds(target_date_exact)
    if min_b and max_b:
      y = int(str(min_b)[:4])
      filters.append(f"((date_min_num <= {max_b} AND date_max_num >= {min_b}) OR (date_min_num IS NULL AND event_year = {y}))")

  if target_year_min is not None and not target_date_ge and not target_date_gt and not target_date_exact:
    filters.append(f"event_year >= {target_year_min}")

  if target_year_max is not None and not target_date_le and not target_date_lt and not target_date_exact:
    filters.append(f"event_year <= {target_year_max}")

  if target_father:
    f_p = phonetic(target_father)
    if f_p:
      filters.append(f"(s_father = '{f_p}' OR s_groom_father = '{f_p}' OR s_bride_father = '{f_p}' OR g_father = '{f_p}' OR g_groom_father = '{f_p}' OR g_bride_father = '{f_p}' OR roles = 'father' OR roles = 'groom_father' OR roles = 'bride_father')")

  if target_mother:
    m_p = phonetic(target_mother)
    if m_p:
      filters.append(f"(s_mother = '{m_p}' OR s_groom_mother = '{m_p}' OR s_bride_mother = '{m_p}' OR g_mother = '{m_p}' OR g_groom_mother = '{m_p}' OR g_bride_mother = '{m_p}' OR roles = 'mother' OR roles = 'groom_mother' OR roles = 'bride_mother')")

  if target_child:
    c_p = phonetic(target_child)
    if c_p:
      filters.append(f"(s_child = '{c_p}' OR s_deceased = '{c_p}' OR g_child = '{c_p}' OR g_deceased = '{c_p}' OR roles = 'child' OR roles = 'registered' OR roles = 'deceased')")

  if target_spouse:
    sp_p = phonetic(target_spouse)
    if sp_p:
      filters.append(f"(s_partner = '{sp_p}' OR s_groom = '{sp_p}' OR s_bride = '{sp_p}' OR g_partner = '{sp_p}' OR g_groom = '{sp_p}' OR g_bride = '{sp_p}' OR roles = 'partner' OR roles = 'groom' OR roles = 'bride')")

  if target_role:
    if target_role == "mother":
      filters.append("(roles = 'mother' OR roles = 'groom_mother' OR roles = 'bride_mother')")
    elif target_role == "father":
      filters.append("(roles = 'father' OR roles = 'groom_father' OR roles = 'bride_father')")
    elif target_role in ("spouse", "partner"):
      filters.append("(roles = 'partner' OR roles = 'groom' OR roles = 'bride')")
    elif target_role == "child":
      filters.append("(roles = 'child' OR roles = 'registered')")
    else:
      filters.append(f"roles = '{target_role}'")

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
    return {"status": "error", "error_message": _clean_meili_error(exc)}

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
