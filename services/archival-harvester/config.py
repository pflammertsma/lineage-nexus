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
# The harvester's log and state directory, bind-mounted from /opt/ingest-logs on
# the host. The default used to be <module>/scratch, which lives *inside the
# image*: routes/indexing.py wrote `batch_history.json` and read
# `task_archives.json` there, so the "persistent batch history across container
# deployments" was discarded on every deploy, and batch-to-archive attribution
# never resolved. routes/harvest.py already defaulted to /ingest-logs, so the two
# halves of the same service disagreed about where their shared state lived.
INGEST_LOG_DIR = os.environ.get("INGEST_LOG_DIR", "/ingest-logs")

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
  """
  Applies the index settings defined in schema.py.

  This function used to carry its own copy of the settings, and so did
  `ingest.py`. Whichever ran last won, and the one that lost still logged
  success — this very function reported "Configured proximityPrecision:
  'byAttribute' successfully" on every start while the live value read `byWord`,
  because the harvester had replaced the whole settings object behind it.
  There is now one definition and two callers of it.

  Note that changing `searchableAttributes` or `filterableAttributes` makes
  Meilisearch reindex every document, so this is not free the first time new
  values reach a populated index.
  """
  try:
    import schema
    settings = schema.index_settings()
    meili_client.index(INDEX_NAME).update_settings(settings)
    logger.info(
      "Applied index settings from schema.py: %d searchable, %d filterable, "
      "proximityPrecision=%s",
      len(settings["searchableAttributes"]),
      len(settings["filterableAttributes"]),
      settings["proximityPrecision"],
    )
  except Exception as e:
    logger.warning(f"Could not auto-update Meilisearch index settings: {e}")


ensure_meilisearch_index_settings()
