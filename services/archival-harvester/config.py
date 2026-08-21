"""
Configuration and Meilisearch client setup for Archival Harvester Gateway.
"""

import os
import time
import logging
import meilisearch

MEILI_HOST = os.environ.get("MEILI_HOST", "http://127.0.0.1:7700")
MEILI_MASTER_KEY = os.environ.get("MEILI_MASTER_KEY", "")
ADMIN_SECRET_TOKEN = os.environ.get("ADMIN_SECRET_TOKEN", "")
INDEX_NAME = "records"
START_TIME = time.time()
INGEST_LOG_DIR = os.environ.get("INGEST_LOG_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch"))

REGISTER_KIND_LABELS = {
  "bsg": "Burgerlijke Stand — Geboorte (civil birth register, 1811 onwards)",
  "bsh": "Burgerlijke Stand — Huwelijk (civil marriage register, 1811 onwards)",
  "bso": "Burgerlijke Stand — Overlijden (civil death register, 1811 onwards)",
  "bev": "Bevolkingsregister (population register — households and residents)",
  "dtb_d": "DTB — Doop (church baptism register, generally pre-1811)",
  "dtb_t": "DTB — Trouwen (church marriage register, generally pre-1811)",
  "dtb_b": "DTB — Begraven (church burial register, generally pre-1811)",
  "not": "Notarieel (notarial deeds — wills, estates, contracts)",
}

ARCHIVE_NAMES = {
  "aal": "Streekarchief Goeree-Overflakkee / Aalsmeer",
  "ade": "Archief Delft",
  "arg": "Archief Eemland",
  "bhi": "Brabants Historisch Informatie Centrum",
  "bor": "Gemeentearchief Borne",
  "brb": "Brabants Historisch Informatie Centrum",
  "brd": "Stadsarchief Breda",
  "cod": "CODA Apeldoorn",
  "dar": "Dordrechts Archief",
  "den": "Erfgoed Leiden en Omstreken",
  "dev": "Stadsarchief Deventer",
  "dha": "Haags Gemeentearchief",
  "dnt": "Drents Archief",
  "dom": "Streekarchief Ommen-Dalfsen",
  "eal": "Erfgoedcentrum Achterhoek en Liemers",
  "eem": "Archief Eemland",
  "ehb": "Erfgoed 's-Hertogenbosch",
  "elo": "Erfgoed Leiden en Omstreken",
  "frl": "Tresoar Fryslân",
  "gel": "Gelders Archief",
  "gra": "Groninger Archieven",
  "hga": "Haags Gemeentearchief",
  "hkk": "Historische Kring Krimpenerwaard",
  "lim": "Regionaal Historisch Centrum Limburg",
  "mhi": "Museum & Archief Hoorn",
  "nha": "Noord-Hollands Archief",
  "ovr": "Historisch Centrum Overijssel",
  "pem": "Purmerends Museum",
  "raa": "Streekarchief Rijnland en Midden-Holland",
  "rad": "Streekarchief Midden-Holland",
  "rag": "Regionaal Archief Gooi en Vechtstreek",
  "ran": "Regionaal Archief Nijmegen",
  "rar": "Regionaal Archief Rivierenland",
  "rat": "Regionaal Archief Tilburg",
  "rel": "Regionaal Archief Langstraat Heusden Altena",
  "rhe": "Regionaal Historisch Centrum Vecht en Venen",
  "rhl": "Regionaal Historisch Centrum Limburg",
  "rht": "Regionaal Historisch Centrum Vecht en Venen",
  "rmd": "Regionaal Archief Midden-Holland",
  "rzh": "Regionaal Archief Zuid-Holland Zuid",
  "saa": "Stadsarchief Amsterdam",
  "sad": "Stadsarchief Delft",
  "sag": "Stadsarchief 's-Hertogenbosch",
  "sal": "Stadsarchief Amsterdam",
  "sch": "Gemeentearchief Schiedam",
  "sgo": "Streekarchief Goeree-Overflakkee",
  "sgv": "Streekarchief Gooi en Vechtstreek",
  "sha": "Stadsarchief Amsterdam",
  "sla": "Streekarchief Langstraat Heusden Altena",
  "smh": "Streekarchief Midden-Holland",
  "snv": "Streekarchief Naarden-Vechtstreek",
  "srm": "Streekarchief Rijnland en Midden-Holland",
  "srt": "Streekarchief Rijn- en Vechtstreek",
  "svp": "Streekarchief Voorne-Putten",
  "swl": "Stadarchief Westland",
  "szu": "Stadsarchief Zutphen",
  "thl": "Tresoar Fryslân",
  "ton": "Streekarchief Tiel-Ochten-Nederbetuwe",
  "utr": "Het Utrechts Archief",
  "ven": "Gemeentearchief Venlo",
  "vev": "Regionaal Historisch Centrum Vecht en Venen",
  "vkk": "West-Fries Archief",
  "vls": "Gemeentearchief Vlissingen",
  "was": "Wassenaar Gemeentearchief",
  "wat": "Waterlands Archief",
  "wba": "West-Brabants Archief",
  "wfa": "West-Fries Archief",
  "zar": "Zaans Archief",
  "zdk": "Gemeentearchief Zuidplas",
  "zld": "Zeeuws Archief",
  "zou": "Zuid-Utrechts Archief",
  "ztm": "Gemeentearchief Zoetermeer",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gateway")

meili_client = meilisearch.Client(MEILI_HOST, MEILI_MASTER_KEY)


def ensure_meilisearch_index_settings():
  """Configures Meilisearch for sub-50ms query latency by setting proximityPrecision to 'byAttribute'."""
  try:
    index = meili_client.index(INDEX_NAME)
    import schema
    index.update_settings({
      # Taken from schema.py so the gateway and the harvester cannot disagree
      # about which fields exist. Four of the six attributes hardcoded here
      # previously appeared in zero of 15.4M documents.
      "searchableAttributes": schema.searchable_attributes(),
      "filterableAttributes": schema.filterable_attributes(),
      "sortableAttributes": ["event_year"],
      "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
      "typoTolerance": {
        "enabled": True,
        "minWordSizeForTypos": {"oneTypo": 5, "twoTypos": 9},
      },
      "pagination": {"maxTotalHits": 1000},
    })
    logger.info("Configured Meilisearch proximityPrecision: 'byAttribute' successfully.")
  except Exception as e:
    logger.warning(f"Could not auto-update Meilisearch index settings: {e}")


ensure_meilisearch_index_settings()
