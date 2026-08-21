# Search test records

Fixed reference records for checking that search behaves. All are from **`arg`**
(Streekarchief Rijnlands Midden — Hazerswoude and Koudekerk), chosen as the test
archive because it is 10 MB compressed, carries **all eight record types**, and
spans the 1811 boundary between church and civil registration.

Indexed size: **110,971 documents**, ingested in about 30 seconds.

## A caution these records taught us

Two of the candidates below look at first like one person recorded twice, and
are not. Dutch families reused the name of a child who had died, so **the same
parents can have two children with the same name**. Matching a person's name and
both parents proves the *family*; it does not by itself prove the *individual*.
Where that matters it is called out.

The `arg` export also contains each record **twice**, under a lowercase-hex and
an uppercase-hex GUID — 20,278 duplicates out of 110,971. Worth knowing before
treating a repeated hit as corroboration.

---

## 1. Gerrit Hogervegt — three surname spellings across the 1811 boundary

The primary spelling test. One family, recorded either side of the change from
church to civil registration, with the surname spelled three ways.

| year | kind | name as written | parents |
|---|---|---|---|
| 1804 | `dtb_d` | Gerrit **Hogervegt** | Kors Hogervegt & Antje van Staveren |
| 1806 | `dtb_d` | Gerrit **Hogervecht** | Kors Hogervecht & Antje van Staveren |
| 1816 | `bsg` | Gerrit **Hoogervegt** | Kors Hoogervegt & Antje van Staveren |
| 1818 | `bso` | Gerrit **Hoogervegt** | Kors Hoogervegt & Antje van Staveren |

All three spellings key to `hogerfegt`. The mother is identical in every record,
so the family is certain; the 1804, 1806 and 1816 baptisms are probably three
different children given the same name.

**What it proves.** Searching the literal string finds a different subset each
time; the phonetic key finds all of them:

| query | literal search | phonetic search |
|---|---|---|
| `Hogervegt` | 183 | **207** |
| `Hogervecht` | **60** | **207** |
| `Hoogervegt` | 181 | **207** |

Searching "Hogervecht" as written reaches 29% of the records for that name.

## 2. Antonia Plaisier — one individual, seven records, four spellings

The richest single identity in the archive, and the one to use for role-bound
queries. Both parents match across all seven, and the dates are consistent with
one lifetime.

| year | kind | role | name as written |
|---|---|---|---|
| 1840 | `bsg` | child | Antonia **Plaizier** |
| 1843 | `bso` | deceased | **Anthonia** Plaisier |
| 1845 | `bsg` | child | Antonia Plaisier |
| 1845 | `bso` | deceased | Antonia Plaisier |
| 1851 | `bsg` | child | Antonia Plaisier |
| 1874 | `bsh` | **bride** | Antonia Plaisier |
| 1881 | `bso` | deceased | Antonia Plaisier |

Parents throughout: **Cornelis Plaisier & Maria Juriana Hendriks** (recorded as
*Plaizier* in 1840 and *Jurriana* in the death entries).

Marriage record: <https://www.openarchieven.nl/arg:a42a285e-86c5-5532-e31b-0ee6847d8867>

**The reference query.** "Antonia Plaisier, father Cornelis, married before 1880":

```
kind = 'bsh' AND g_bride = 'antonia' AND s_bride = 'plaisir'
            AND g_bride_father = 'kornelis' AND event_year < 1880
```

Returns **exactly one record**, the 1874 marriage, in 0 ms.

**The negative control.** Moving Cornelis to the wrong role must return nothing:

```
kind = 'bsh' AND g_groom = 'kornelis' AND s_bride = 'plaisir'   ->  0 hits
```

This is the check that role binding is real. An array-of-persons schema returns
the record for both, because it matches each constraint against any person
independently.

## 3. Klasina Cornelia Spruijt — given-name spelling drift

**This is the record that exposed the query-side gap.** Searching
"Klasina Cornelia Spruijt" missed the 1848 baptism of *Clasina*, even though the
index keyed both to `klasina`. The documents were keyed; the query was not, so
`names_p` — which stores `klasina kornelia spruit` — was being searched with raw
text. `cornelia` is not `kornelia`, so that field matched nothing and sat unused.
Measured on this exact record: raw query **0 hits**, keyed query **16**.


| year | kind | name as written | parents |
|---|---|---|---|
| 1848 | `bsg` | **Clasina** Cornelia Spruijt | Jacob Spruijt & Jacoba van Zwieten |
| 1850 | `bso` | **Klasina** Cornelia Spruijt | Jacob Spruijt & Jacoba van Zwieten |
| 1873 | `bsh` | **Klazina** Cornelia Spruijt | Jacob Spruijt & Jacoba van Zwieten |

C/K and s/z drift in the same given name. Note the 1850 death and the 1873
marriage: these are almost certainly two different daughters, the second named
after the first. Useful precisely because it is a case where matching parents
must *not* be read as matching individuals.

## 4. Klaasje van der Graaff / de Graaf — tussenvoegsel change

| year | kind | name as written | father |
|---|---|---|---|
| 1798 | `dtb_d` | Klaasje **van der Graaff** | Maarten van der Graaff |
| 1799 | `dtb_d` | Klaasje **de Graaf** | Maarte de Graaf |

The tussenvoegsel itself changes, and the father's given name is abbreviated.
Both key to `klasi graf` because the tussenvoegsel is dropped before keying.

---

## Regression checks

Run against a fresh `arg` index. Filter values are phonetic keys, not raw names.

| check | filter | expected |
|---|---|---|
| phonetic recall | `q` = `hogerfegt` on `names_p` | 207 |
| role-bound family | `s_child = 'hogerfegt' AND g_father = 'kors'` | 18 |
| the reference query | see §2 | exactly 1 |
| negative control | see §2 | **0** |
| derived birth year | `kind='bsh' AND by_bride < 1830 AND by_bride > 1800` | non-empty |
| fuzzy off | `q=Klasina Cornelia Spruijt&fuzzy=false` | 8 hits, **no 1848 Clasina** |
| fuzzy on | `q=Klasina Cornelia Spruijt&fuzzy=true` | 11 hits, 1848 Clasina tagged `phonetic` |

Every one of these returned in **0 ms** against 110,971 documents.
