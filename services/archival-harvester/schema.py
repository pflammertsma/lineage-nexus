# -*- coding: utf-8 -*-
"""
Turns one Open Archieven export row into a search document.

The shape is driven by what genealogical search actually asks, measured against
the corpus rather than assumed:

  * **Roles get their own fields.** "A de Vries whose father was Jan" only works
    if the surname and the father's given name are bound to different people.
    An array of persons cannot express that — filtering it matches any element
    independently, so a record where Jan de Vries is the *groom* satisfies both
    halves. Tested: the array form returned 3 false positives on exactly that
    query, the per-role form returned none.

  * **Filter values are phonetic keys, not raw names.** An exact search for
    "Antje" reaches 56% of that name's pre-1811 records; "Trijntje" 37%. See
    phonetics.py for the measurements behind the rules.

  * **Birth years are derived from age.** `GROOM_BIR_YEAR` is filled 0.1% of the
    time; `GROOM_AGE` 98.5%, uniformly "N jaar". `EVENT_YEAR - AGE` is therefore
    the only usable source, accurate to a year either way.

The exports come in two structural shapes. Wide files (bsg, bsh, bso, dtb_*)
carry fixed named column slots and one row per record, so the role is given by
position. Tall files (bev, not) carry 44 columns and one person per row, many
rows to a record, so the role is given by RELATIONTYPE. Both are handled here.
"""
import re

from phonetics import phonetic, phonetic_all

# Column prefix -> canonical role. Position is more reliable than RELATIONTYPE
# in the wide files, where it is often blank.
PREFIX_ROLES = {
    "GROOM": "groom",
    "GROOM_FTHR": "groom_father",
    "GROOM_MTHR": "groom_mother",
    "BRIDE": "bride",
    "BRIDE_FTHR": "bride_father",
    "BRIDE_MTHR": "bride_mother",
    "PR_FTHR": "father",
    "PR_MTHR": "mother",
    "SPOUSE": "partner",
    "PREV_HUSB": "partner",
    "PREV_WIFE": "partner",
    "OTHER": "other",
}

# What the principal slot (PR) means depends on the register it came from.
PR_ROLE_BY_KIND = {
    "bsg": "child",
    "dtb_d": "child",
    "bso": "deceased",
    "dtb_b": "deceased",
    "bev": "registered",
}

# RELATIONTYPE -> canonical role, for the tall files where every person sits in
# the PR slot and only this column distinguishes them. Values measured in the
# corpus; anything unlisted falls through to "other" but keeps its raw label.
RELATION_ROLES = {
    "kind": "child", "dopeling": "child",
    "vader": "father", "moeder": "mother",
    "bruidegom": "groom", "bruid": "bride",
    "vader van de bruid": "bride_father", "moeder van de bruid": "bride_mother",
    "vader van de bruidegom": "groom_father", "moeder van de bruidegom": "groom_mother",
    "getuige": "witness",
    "overledene": "deceased",
    "geregistreerde": "registered",
    "relatie": "partner", "partner": "partner",
    "verkoper": "seller", "koper": "buyer",
}

# Every role that gets its own filterable fields.
ROLES = [
    "child", "father", "mother",
    "groom", "bride",
    "groom_father", "groom_mother", "bride_father", "bride_mother",
    "deceased", "registered", "witness", "seller", "buyer", "partner", "other",
]

# Roles whose age is recorded, and so whose birth year can be derived.
DATED_ROLES = ("groom", "bride", "child", "deceased", "registered")

_BRACES = re.compile(r"[{}]")
_AGE = re.compile(r"(\d+)\s*(jaar|jaren|maand|maanden|week|weken|dag|dagen)?", re.I)


def _clean(value):
    return (value or "").strip()


def role_prefixes(fieldnames):
    """Every column prefix in this file that names a person, longest first."""
    suffixes = ("_NAME_GN", "_NAME_SURN", "_NAME_PATR", "_NAME_SPRE", "_NAME")
    found = set()
    for column in fieldnames or []:
        for suffix in suffixes:
            if column.endswith(suffix):
                prefix = column[: -len(suffix)]
                if prefix:
                    found.add(prefix)
                break
    return sorted(found, key=lambda p: (-len(p), p))


def canonical_role(prefix, relationtype, kind):
    """The role slug for one person, from column position then RELATIONTYPE."""
    rel = _clean(relationtype).lower()
    rel = rel.split("other:")[-1].strip()

    if prefix.startswith("WITNESS"):
        return "witness"
    if prefix in PREFIX_ROLES:
        return PREFIX_ROLES[prefix]
    if prefix == "PR":
        # Tall files put everyone in PR, so the relation column decides.
        if rel in RELATION_ROLES:
            return RELATION_ROLES[rel]
        return PR_ROLE_BY_KIND.get(kind, "other")
    if rel in RELATION_ROLES:
        return RELATION_ROLES[rel]
    return "other"


def age_to_years(value):
    """
    Age in whole years, or 0 for an infant recorded in months, weeks or days.

    Death registers use mixed units — 15,674 "N jaar" against 1,732 "N maanden",
    617 "N weken" and 565 "N dagen" per 20,000 rows. Treating "3 maanden" as
    three years would put a birth year three years before the child existed.
    """
    text = _clean(value)
    if not text:
        return None
    match = _AGE.search(text)
    if not match:
        return None
    number = int(match.group(1))
    unit = (match.group(2) or "jaar").lower()
    if unit.startswith("jaar") or unit.startswith("jaren"):
        return number
    return 0


def person_from(row, prefix):
    """Name parts for one person slot, or None if the slot is empty."""
    given = _clean(row.get(prefix + "_NAME_GN"))
    patronym = _clean(row.get(prefix + "_NAME_PATR"))
    infix = _clean(row.get(prefix + "_NAME_SPRE"))
    surname = _clean(row.get(prefix + "_NAME_SURN"))

    display = " ".join(p for p in (given, patronym, infix, surname) if p)
    if not display:
        display = _clean(row.get(prefix + "_NAME"))
        if not display:
            return None
        # Only a combined field: treat the last token as the surname.
        parts = display.split()
        given = given or " ".join(parts[:-1])
        surname = surname or parts[-1]

    return {
        "n": display,
        "g": given,
        "s": surname,
        "p": patronym,
    }


def transform(row, archive, kind, prefixes, institution_default=""):
    """One row to one document, or None when it names nobody."""
    guid = _BRACES.sub("", _clean(row.get("SOURCE_RECORD_GUID")))
    if not guid:
        return None

    persons = []
    for prefix in prefixes:
        parts = person_from(row, prefix)
        if not parts:
            continue
        role = canonical_role(prefix, row.get(prefix + "_RELATIONTYPE"), kind)
        raw_role = _clean(row.get(prefix + "_RELATIONTYPE")) or role
        age = age_to_years(row.get(prefix + "_AGE"))
        birth_year = _clean(row.get(prefix + "_BIR_YEAR"))
        persons.append({
            "n": parts["n"], "g": parts["g"], "s": parts["s"], "p": parts["p"],
            "r": raw_role, "role": role,
            "age": age,
            "bir_year": int(birth_year) if birth_year.isdigit() else None,
            "bir_place": _clean(row.get(prefix + "_BIR_PLACE")),
        })

    if not persons:
        return None

    year_raw = _clean(row.get("EVENT_YEAR")) or _clean(row.get("SOURCE_DATE_YEAR"))
    event_year = int(year_raw) if year_raw.isdigit() else 0

    doc = {
        "id": ("%s_%s" % (archive, guid)).replace("-", "_"),
        "archive": archive,
        "kind": kind,
        "guid": guid,
        "url": "https://www.openarchieven.nl/%s:%s" % (archive, guid),
        "institution": _clean(row.get("SOURCEREFERENCE_INSTITUTIONNAME")) or institution_default,
        "last_changed": _clean(row.get("SOURCE_LASTCHANGEDATE")),
        "event_type": _clean(row.get("EVENT_TYPE")) or _clean(row.get("SOURCE_TYPE")),
        "event_year": event_year,
        "event_date": "-".join(p for p in (
            year_raw, _clean(row.get("EVENT_MONTH")), _clean(row.get("EVENT_DAY"))) if p),
        "event_place": _clean(row.get("EVENT_PLACE")) or _clean(row.get("SOURCE_PLACE")),
        "persons": persons,
    }
    rebuild_search_fields(doc)
    return doc


def rebuild_search_fields(doc):
    """Derives everything searchable or filterable from doc['persons']."""
    names, phon, surnames_p, given_p, roles = [], [], [], [], []
    person_names, person_phonetics = [], []
    per_role_given, per_role_surname, per_role_birth = {}, {}, {}

    for p in doc["persons"]:
        role = p["role"]
        roles.append(role)
        names.append(p["n"])
        p_phon = phonetic_all(p["n"])
        phon.extend(p_phon)
        person_names.append(p["n"])
        person_phonetics.append(" ".join(p_phon))

        gk = phonetic_all(p["g"]) + phonetic_all(p["p"])
        sk = phonetic_all(p["s"])
        given_p.extend(gk)
        surnames_p.extend(sk)
        per_role_given.setdefault(role, []).extend(gk)
        per_role_surname.setdefault(role, []).extend(sk)

        # Birth year: the recorded one if present, else event year minus age.
        year = p.get("bir_year")
        if year is None and p.get("age") is not None and doc["event_year"]:
            year = doc["event_year"] - p["age"]
        if year:
            per_role_birth.setdefault(role, []).append(year)

    doc["person_names"] = person_names
    doc["person_phonetics"] = person_phonetics
    doc["names"] = " ".join(names)
    doc["names_p"] = " ".join(dict.fromkeys(phon))
    doc["roles"] = sorted(set(roles))
    doc["given_p"] = sorted(set(given_p))
    doc["surnames_p"] = sorted(set(surnames_p))

    for role in ROLES:
        if per_role_given.get(role):
            doc["g_" + role] = sorted(set(per_role_given[role]))
        if per_role_surname.get(role):
            doc["s_" + role] = sorted(set(per_role_surname[role]))
    for role in DATED_ROLES:
        years = per_role_birth.get(role)
        if years:
            doc["by_" + role] = min(years)


def filterable_attributes():
    """Every field the API may filter on."""
    fields = ["archive", "kind", "event_type", "event_year", "event_date", "event_place",
              "roles", "given_p", "surnames_p"]
    fields += ["g_" + r for r in ROLES]
    fields += ["s_" + r for r in ROLES]
    fields += ["by_" + r for r in DATED_ROLES]
    return fields


def searchable_attributes():
    """Ordered: per-person name matches outrank multi-person cross-matches, which outrank place matches."""
    return ["person_names", "person_phonetics", "names", "names_p", "event_place", "event_type", "institution"]
