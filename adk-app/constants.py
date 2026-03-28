import logging
import os
from http.client import HTTPConnection

APP_NAME = "Lineage Nexus"
MODEL_SMART = "gemini-2.5-pro" # Expensive and slow
MODEL_MIXED = "gemini-2.5-flash" # Cheaper but faster
MODEL_FAST = "gemini-2.5-flash-lite" # Cheapest but fastest
# MODEL_FAST = "gemini-2.5-flash-lite-preview-06-17" # Cheapest but fastest

_REQUEST_LOGGING = False

# --- Configure Logging ---
logger = logging.getLogger(APP_NAME)

# --- Add a file handler to write logs to a file ---
log_filename = os.path.join(os.path.dirname(os.path.realpath(__file__)), f'{APP_NAME}.log')
file_handler = logging.FileHandler(log_filename)
file_handler.setLevel(logging.DEBUG) # Set level for the file handler
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

logger.debug(f"Logging to {log_filename}")

requests_log = logging.getLogger("requests.packages.urllib3")
if _REQUEST_LOGGING:
    requests_log.setLevel(logging.DEBUG)
    HTTPConnection.debuglevel = 1
else:
    requests_log.setLevel(logging.WARNING)
    HTTPConnection.debuglevel = 0
requests_log.propagate = True