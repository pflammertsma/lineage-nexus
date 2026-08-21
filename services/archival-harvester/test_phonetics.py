# -*- coding: utf-8 -*-
"""Every family here was observed in the corpus, with the counts that justify it."""
from phonetics import phonetic, phonetic_all

# Spellings measured in frl.dtb_d / frl.bsg that must share one key.
FAMILIES = {
    "Antje":    ["Antje", "Antie", "Antjen", "Antien", "Antye", "Anttie"],
    "Trijntje": ["Trijntje", "Tryntie", "Tryntje", "Trijntie", "Trintie", "Trientje"],
    "Pieter":   ["Pieter", "Pyter", "Pytter", "Pijtter", "Pijter", "Piter"],
    "Klaas":    ["Klaas", "Claas", "Claes", "Klaes", "Clas"],
    "Grietje":  ["Grietje", "Grietie", "Grijtje", "Grytje", "Grietjen", "Grytie"],
    "Hendrik":  ["Hendrik", "Hendrick", "Hendryck", "Hendrijk", "Hendricke"],
    "Jacob":    ["Jacob", "Jakob", "Jaakob", "Jaacob"],
    "Sietse":   ["Sietse", "Sytse", "Sietze", "Sijtze", "Sytze"],
    "IJsbrand": ["IJsbrand", "Ysbrand", "Ijsbrand", "Isbrand"],
    "de Vries": ["de Vries", "De Vries", "Vries", "Vriese"],
    "Dijkstra": ["Dijkstra", "Dykstra", "Dijxtra"],
}

# Names that must NOT merge. A key that collapses these is too aggressive.
DISTINCT = [
    ("Jan", "Klaas"), ("Antje", "Aaltje"), ("Vries", "Visser"),
    ("Pieter", "Petrus"), ("Jan", "Johannes"), ("Dijkstra", "Dijksma"),
    ("Hendrik", "Hendrika"), ("Sietse", "Sipke"),
]

failures = []

for base, forms in FAMILIES.items():
    keys = {f: phonetic(f) for f in forms}
    if len(set(keys.values())) != 1:
        failures.append("%s did not collapse: %s" % (base, keys))
    else:
        print("  OK   %-9s -> %-9s (%d spellings)" % (base, keys[forms[0]], len(forms)))

for a, b in DISTINCT:
    if phonetic(a) == phonetic(b):
        failures.append("%s and %s collided on %r" % (a, b, phonetic(a)))
    else:
        print("  OK   %-9s / %-9s stay distinct (%s / %s)" % (a, b, phonetic(a), phonetic(b)))

# Tussenvoegsels are dropped, so the surname keys regardless of how it was written.
assert phonetic("van der Berg") == phonetic("Berg") == phonetic("vanderberg".replace("vander", "")), \
    phonetic("van der Berg")
print("  OK   tussenvoegsels dropped: 'van der Berg' -> %r" % phonetic("van der Berg"))

assert phonetic("") == "" and phonetic(None) == ""
assert phonetic_all("Jan de Vries") == ["jan", "fris"], phonetic_all("Jan de Vries")
print("  OK   empty input and multi-token: %r" % phonetic_all("Jan de Vries"))

if failures:
    print("\nFAILURES:")
    for f in failures:
        print("  -", f)
    raise SystemExit(1)
print("\nALL PHONETIC TESTS PASSED (%d families, %d distinct pairs)" % (len(FAMILIES), len(DISTINCT)))
