import asyncio
from datetime import datetime
from typing import Optional, Dict

# Registry to map asyncio tasks to their status queues
_status_registry: Dict[int, asyncio.Queue] = {}

def get_ts():
    return datetime.now().strftime("%H:%M:%S")

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
    # Also log to console for backend visibility
    print(f"[{get_ts()}] STATUS: {message}")
