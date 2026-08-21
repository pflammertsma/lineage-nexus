# -*- coding: utf-8 -*-
from schema import (transform, canonical_role, age_to_years, person_from,
                    role_prefixes, ROLES, filterable_attributes)

def row(**kw):
    base = {"SOURCE_RECORD_GUID": "{abc-def}", "EVENT_YEAR": "1930",
            "EVENT_MONTH": "5", "EVENT_DAY": "2", "EVENT_PLACE": "Leeuwarden",
            "EVENT_TYPE": "Huwelijk", "SOURCEREFERENCE_INSTITUTIONNAME": "AlleFriezen"}
    base.update(kw); return base

fails = []
def check(label, got, want):
    if got != want:
        fails.append("%s: got %r want %r" % (label, got, want))
    else:
        print("  OK   %s" % label)

# --- age parsing: death registers mix units -------------------------------
check("age '23 jaar'", age_to_years("23 jaar"), 23)
check("age '3 maanden' -> 0 (infant)", age_to_years("3 maanden"), 0)
check("age '11 dagen' -> 0", age_to_years("11 dagen"), 0)
check("age bare '45'", age_to_years("45"), 45)
check("age empty", age_to_years(""), None)

# --- role resolution -------------------------------------------------------
check("GROOM_FTHR by position", canonical_role("GROOM_FTHR", "", "bsh"), "groom_father")
check("PR in a birth register", canonical_role("PR", "", "bsg"), "child")
check("PR in a death register", canonical_role("PR", "", "bso"), "deceased")
check("PR in a population register", canonical_role("PR", "", "bev"), "registered")
check("tall file, role from RELATIONTYPE", canonical_role("PR", "other:Verkoper", "not"), "seller")
check("WITNESS_3", canonical_role("WITNESS_3", "", "bsh"), "witness")
check("unknown relation falls through", canonical_role("PR", "other:Schuldeiser", "not"), "other")

# --- a realistic marriage row ---------------------------------------------
r = row(
  GROOM_NAME_GN="Sietse", GROOM_NAME_SPRE="de", GROOM_NAME_SURN="Vries",
  GROOM_AGE="23 jaar", GROOM_BIR_PLACE="Stiens",
  BRIDE_NAME_GN="Antje", BRIDE_NAME_SURN="Bakker", BRIDE_AGE="21 jaar",
  GROOM_FTHR_NAME_GN="Jan", GROOM_FTHR_NAME_SPRE="de", GROOM_FTHR_NAME_SURN="Vries",
  BRIDE_FTHR_NAME_GN="Klaas", BRIDE_FTHR_NAME_SURN="Bakker",
)
prefixes = ["GROOM_FTHR", "BRIDE_FTHR", "GROOM", "BRIDE"]
doc = transform(r, "frl", "bsh", prefixes)

check("four people found", len(doc["persons"]), 4)
check("groom surname phonetic", doc.get("s_groom"), ["fris"])
check("groom given phonetic", doc.get("g_groom"), ["sits"])
check("groom's father given phonetic", doc.get("g_groom_father"), ["jan"])
check("bride given phonetic", doc.get("g_bride"), ["anti"])
check("bride's father is a separate role", doc.get("g_bride_father"), ["klas"])
check("groom birth year = 1930 - 23", doc.get("by_groom"), 1907)
check("bride birth year", doc.get("by_bride"), 1909)
check("roles present", doc["roles"], ["bride", "bride_father", "groom", "groom_father"])
check("display names kept", doc["names"], "Jan de Vries Klaas Bakker Sietse de Vries Antje Bakker")

# The binding that matters: Jan is the father, NOT the groom.
check("Jan is not indexed as the groom's given name", "jan" in (doc.get("g_groom") or []), False)

# --- spelling variant must produce the same keys ---------------------------
r2 = row(
  GROOM_NAME_GN="Sytse", GROOM_NAME_SPRE="De", GROOM_NAME_SURN="Vries", GROOM_AGE="23 jaar",
  BRIDE_NAME_GN="Antie", BRIDE_NAME_SURN="Bakker", BRIDE_AGE="21 jaar",
  GROOM_FTHR_NAME_GN="Jan", GROOM_FTHR_NAME_SURN="Vries",
)
doc2 = transform(r2, "frl", "bsh", ["GROOM_FTHR", "GROOM", "BRIDE"])
check("Sytse keys same as Sietse", doc2.get("g_groom"), doc.get("g_groom"))
check("Antie keys same as Antje", doc2.get("g_bride"), doc.get("g_bride"))
check("De Vries keys same as de Vries", doc2.get("s_groom"), doc.get("s_groom"))

# --- a tall notarial row ---------------------------------------------------
r3 = row(EVENT_TYPE="Notarieel", PR_NAME_GN="Douwe", PR_NAME_SURN="Hoekstra",
         PR_RELATIONTYPE="other:Verkoper")
doc3 = transform(r3, "arg", "not", ["PR"])
check("notarial seller role", doc3["roles"], ["seller"])
check("seller surname keyed", doc3.get("s_seller"), ["hukstra"])
check("raw role preserved for display", doc3["persons"][0]["r"], "other:Verkoper")

# --- degenerate input ------------------------------------------------------
check("row with no guid", transform(row(SOURCE_RECORD_GUID=""), "x", "bsg", ["PR"]), None)
check("row with no names", transform(row(), "x", "bsg", ["PR"]), None)

check("no duplicate filterable fields", len(filterable_attributes()), len(set(filterable_attributes())))
print("\n  filterable fields: %d" % len(filterable_attributes()))

if fails:
    print("\nFAILURES:")
    for f in fails: print("  -", f)
    raise SystemExit(1)
print("\nALL SCHEMA TESTS PASSED")
