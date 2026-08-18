from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class Subject:
    RealName: str = None
    BirthDate: str = None
    DeathDate: str = None
    WikiTreeID: str = None
    found_records: List[Dict[str, Any]] = field(default_factory=list)
