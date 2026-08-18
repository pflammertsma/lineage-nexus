import asyncio
import os
import re
from datetime import datetime
from typing import Any, Optional, Dict

# Registry to map asyncio tasks to their status queues
_status_registry: Dict[int, asyncio.Queue] = {}

# Research content — the query, the names searched, the archive results — must
# not reach the server logs. On Cloud Run anything written to stdout is captured
# into Cloud Logging and retained, so an ordinary debug `print` is a durable
# record of what a user researched. Off unless explicitly enabled for local
# debugging; the status stream to the browser is unaffected either way.
LOG_RESEARCH_CONTENT = os.environ.get("LOG_RESEARCH_CONTENT", "").strip().lower() in ("1", "true", "yes")


def get_ts():
    return datetime.now().strftime("%H:%M:%S")


def debug_log(message: str):
    """
    Console output that may contain user research. Suppressed in production.

    Use this for anything derived from the user's query or the records returned.
    Operational messages that cannot contain research content may use `print`.
    """
    if LOG_RESEARCH_CONTENT:
        print(f"[{get_ts()}] {message}")

def register_status_queue(queue: asyncio.Queue, task: Optional[asyncio.Task] = None):
    """Registers a queue for a specific task's status updates (defaults to current task)."""
    target = task or asyncio.current_task()
    if target:
        _status_registry[id(target)] = queue

def unregister_status_queue(task: Optional[asyncio.Task] = None):
    """Removes the queue for a specified task (defaults to current task)."""
    target = task or asyncio.current_task()
    if target:
        _status_registry.pop(id(target), None)

async def report_status(message: str):
    """Reports a status message back to the frontend via the orchestrator's queue."""
    # Find the queue in the registry by looking up the current task's ancestry
    current_task = asyncio.current_task()
    queue = _status_registry.get(id(current_task))
    
    # If not found directly, this tool might be in a subtask. 
    # For now, we'll try to find any active queue if only one exists (for dev simplicity)
    if not queue and _status_registry:
        queue = next(iter(_status_registry.values()))

    if queue:
        await queue.put(message)
    # Status text names the people and archives being searched, so it is
    # research content and stays out of the logs by default.
    debug_log(f"STATUS: {message}")


# --- Quota handling -------------------------------------------------------
# The free tier allows 5 requests/minute, and a single research turn issues
# several. Treating a 429 as a failure throws away the accumulated research
# context (tool calls and their results), so the retry has to redo every
# archive lookup and re-send every record as input tokens. Waiting instead
# keeps that context alive in memory and resumes exactly where it stopped.

QUOTA_MAX_RETRIES = 2
QUOTA_MAX_WAIT_SECONDS = 120
_DEFAULT_QUOTA_WAIT = 30.0


def is_quota_error(error: Exception) -> bool:
    text = str(error)
    return "RESOURCE_EXHAUSTED" in text or "429" in text or "Quota exceeded" in text


def parse_retry_delay(error: Exception) -> float:
    """Pulls the server's advised wait out of a quota error, in seconds.

    Gemini reports it as RetryInfo, e.g. {'retryDelay': '46s'}, and also in the
    prose message ("Please retry in 46.55s.")."""
    text = str(error)
    for pattern in (r"'retryDelay':\s*'(\d+(?:\.\d+)?)s'", r"retry in (\d+(?:\.\d+)?)s"):
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    return _DEFAULT_QUOTA_WAIT


class ClientHolder:
    def __init__(self, primary_client: Any, fallback_client: Optional[Any] = None):
        self.active_client = primary_client
        self.fallback_client = fallback_client
        self.switched = False


async def generate_with_quota_retry(client_or_holder, **kwargs) -> Any:
    """`generate_content` that pauses through quota limits or fails over to a backup key.

    Only quota errors are retried; everything else propagates untouched. The
    caller's `contents` list is untouched between attempts, so a retry is a
    true continuation rather than a restart."""
    if isinstance(client_or_holder, ClientHolder):
        holder = client_or_holder
    else:
        holder = ClientHolder(primary_client=client_or_holder)

    attempt = 0
    while True:
        try:
            return await holder.active_client.aio.models.generate_content(**kwargs)
        except Exception as e:
            if not is_quota_error(e):
                raise

            # Automatic failover to backup key if available
            if holder.fallback_client and not holder.switched:
                holder.switched = True
                holder.active_client = holder.fallback_client
                await report_status(
                    "Primary API key quota exceeded. Automatically switching to backup free-tier key…"
                )
                continue

            if attempt >= QUOTA_MAX_RETRIES:
                raise

            attempt += 1
            # A second of headroom: the advised delay is a lower bound.
            delay = min(parse_retry_delay(e) + 1.0, QUOTA_MAX_WAIT_SECONDS)
            await report_status(
                f"Gemini quota reached. Research context is held; resuming in "
                f"{int(delay)}s (attempt {attempt} of {QUOTA_MAX_RETRIES})…"
            )
            await asyncio.sleep(delay)
