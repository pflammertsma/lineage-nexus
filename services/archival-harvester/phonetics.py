# -*- coding: utf-8 -*-
"""
Phonetic keys for Dutch and Frisian names as written in historical registers.

Why not Soundex, Metaphone or Beider-Morse
------------------------------------------
Soundex and Metaphone encode *English* pronunciation; Beider-Morse covers Dutch
but is tuned for Ashkenazi surname matching across languages. The variation that
actually dominates these registers is narrower and more systematic than any of
them target, and measuring it beat guessing at it. From 80,000 rows of
`frl.dtb_d` (pre-1811 baptisms) and `frl.bsg` (post-1811 births):

    Antje 1509   Antie 1041   Antjen 51   Antien 36   Antye 24   Anttie 22
    Pieter 812   Pyter 293    Pytter 221  Pijtter 192 Pijter 172  Piter 71
    Klaas 458    Claas 374    Claes 331   Klaes 48

An exact-match search for "Antje" reaches 56% of that name's records; for
"Trijntje", 37%. Those are the misses this module exists to close.

The 1811 boundary
-----------------
The Napoleonic decree of 1811 made hereditary surnames compulsory, and the
corpus shows the effect sharply: 80,000 pre-1811 baptisms carry **133 distinct
surnames**, while the same volume of post-1811 births carries **7,219**. Before
1811 most people have only a given name, so identification leans on the given
name plus the parents' names — which is exactly why the phonetic key matters
more there. Measured reduction in distinct spellings: **51.5% pre-1811** against
**30.2% post-1811**.

What this does not do
---------------------
It folds *spellings* of one name, not different *names* for one person. Jan and
Johannes, Klaas and Nicolaas, Pieter and Petrus are vernacular/Latin pairs that
share no orthography; collapsing them here would merge genuinely distinct names.
They need a curated equivalence table, kept separate so its false positives stay
auditable.
"""
import re
import unicodedata

# Dropped before keying: they are written inconsistently, attached or detached,
# capitalised or not, and carry no distinguishing sound.
TUSSENVOEGSELS = {
    "van", "de", "der", "den", "ter", "te", "het", "op", "aan", "uit", "in",
    "'t", "du", "la", "le", "von", "vd",
}


def phonetic(name):
    """
    A key that is equal for spellings of the same name.

    Rule order is load-bearing. The trailing schwa is stripped *before* vowels
    are folded, because -je, -ie, -e and -en are one diminutive ending written
    four ways; folding first turns them into four different stems.
    """
    if not name:
        return ""

    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z' ]", " ", text)

    keys = []
    for token in text.split():
        if token in TUSSENVOEGSELS:
            continue
        w = token

        # 1. The unstable trailing schwa: Antje / Antie / Antien / Antjen.
        w = re.sub(r"(en|e)$", "", w)

        # 2. Latin and archaic digraphs used interchangeably with Dutch forms.
        w = w.replace("ph", "f").replace("th", "t").replace("gh", "g")
        w = w.replace("ck", "k").replace("sch", "sk").replace("ch", "g")

        # 3. c is s before a front vowel, k elsewhere: Claes/Klaas, Cornelis.
        w = re.sub(r"c(?=[eiyj])", "s", w)
        w = w.replace("c", "k").replace("q", "k").replace("x", "ks")

        # 4. w/v/f are one sound in these hands: Douwe/Douve, Vries/Fries.
        w = w.replace("w", "v").replace("v", "f")

        # 5. The dominant vowel drift. ij, y and ie are the same sound, and
        #    doubled vowels mark length rather than a different vowel.
        w = w.replace("ij", "i").replace("y", "i").replace("ie", "i")
        w = w.replace("ae", "a").replace("aa", "a").replace("ee", "e")
        w = w.replace("oo", "o").replace("uu", "u").replace("oe", "u")

        # 6. Voicing is unstable: Sytse/Sytze, Douwes/Douwez.
        w = w.replace("z", "s")

        # 7. A trailing j is the diminutive vowel again: Antj -> Anti.
        w = re.sub(r"j$", "i", w)

        # 8. Doubled consonants carry no distinction: Pytter/Pyter.
        w = re.sub(r"(.)\1+", r"\1", w)

        if w:
            keys.append(w)

    return " ".join(keys)


def phonetic_all(name):
    """Every token's key as a list, for indexing a name as separate values."""
    return [k for k in phonetic(name).split() if k]
