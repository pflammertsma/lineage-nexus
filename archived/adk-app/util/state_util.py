from google.adk.tools import ToolContext
from typing import Dict, Any, List, Optional
from adk_app.util.models import Subject
import requests

API_BASE_URL = "http://localhost:8000"
APP_NAME = "Lineage Nexus"

def set_current_subject(subject_data: Dict[str, Any], tool_context: ToolContext, title: Optional[str] = None):
    """
    Sets the primary individual being researched in the session state and optionally updates the session title.
    """
    if 'FirstName' in subject_data and 'RealName' not in subject_data:
        subject_data['RealName'] = subject_data.pop('FirstName')

    # If title is not provided, construct it from subject_data
    if not title:
        first_name = subject_data.get('RealName', subject_data.get('FirstName', ''))
        last_name = subject_data.get('LastNameAtBirth', '')
        name = subject_data.get('Name', '')
        birth_date = subject_data.get('BirthDate', '')
        birth_year = ''
        if birth_date:
            try:
                birth_year = birth_date.split('-')[0]
            except:
                pass # ignore if format is not as expected
        
        if first_name and last_name:
            title = f"{first_name} {last_name}"
        elif name:
            title = name
        elif first_name:
            title = first_name
        elif last_name:
            title = last_name
        
        if title and birth_year:
            title += f" (b. {birth_year})"

    subject = Subject(**subject_data)
    tool_context.state['current_subject'] = subject
    if title:
        tool_context.state['session_title'] = title
        try:
            user_id = tool_context.state.get('user_id')
            session_id = tool_context.state.get('session_id')

            if user_id and session_id:
                update_url = f"{API_BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions/{session_id}"
                update_payload = {"title": title}
                requests.put(update_url, json=update_payload).raise_for_status()
        except (requests.exceptions.RequestException, KeyError) as e:
            print(f"Failed to update session title on backend: {e}")

    return {"status": "success", "message": "Current subject updated in state.", "session_title": title}

def get_current_subject(tool_context: ToolContext) -> Subject:
    """Gets the primary individual being researched from the session state."""
    return tool_context.state.get('current_subject')

def add_records_to_subject(records: List[Dict[str, Any]], tool_context: ToolContext, subject_data: Optional[Dict[str, Any]] = None):
    """Adds a list of found records to the current subject in the session state.
    If no subject is in the state, it will set the provided subject first.
    """
    if 'current_subject' not in tool_context.state and subject_data:
        # If no subject is in state, but one is provided, set it first.
        set_current_subject(subject_data, tool_context)

    current_subject = get_current_subject(tool_context)
    
    if not current_subject:
        return {"status": "error", "message": "No current subject in state to add records to and no subject data provided."}

    current_subject.found_records.extend(records)
    
    name = current_subject.RealName or "the subject"
    return {"status": "success", "message": f"{len(records)} records added to {name}."}
