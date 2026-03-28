import requests
import json

API_BASE_URL = "http://localhost:8000"
APP_NAME = "Lineage Nexus"

def check_api_status():
    """Checks if the backend API is online."""
    try:
        response = requests.get(f"{API_BASE_URL}/docs", timeout=2)
        response.raise_for_status()
        return True, None
    except requests.exceptions.RequestException as e:
        print(f"API status check failed: {e}")
        return False, str(e)

def get_sessions(user_id):
    """Fetches all sessions for a given user."""
    try:
        url = f"{API_BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions"
        response = requests.get(url)
        response.raise_for_status()
        return response.json(), None
    except requests.exceptions.RequestException as e:
        print(f"API call to fetch sessions failed: {e}")
        return None, str(e)

def create_session(user_id, session_id):
    """Creates a new session for a given user."""
    try:
        url = f"{API_BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions/{session_id}"
        response = requests.post(url, headers={"Content-Type": "application/json"}, data=json.dumps({}))
        response.raise_for_status()
        return response.json(), None
    except requests.exceptions.RequestException as e:
        print(f"Failed to create session: {e}")
        return None, str(e)

def get_session_history(user_id, session_id):
    """Fetches the event history for a specific session."""
    try:
        url = f"{API_BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions/{session_id}"
        response = requests.get(url)
        response.raise_for_status()
        return response.json(), None
    except requests.exceptions.RequestException as e:
        print(f"API call to fetch session messages failed: {e}")
        return None, str(e)

def delete_session(user_id, session_id):
    """Deletes a session for a given user."""
    try:
        url = f"{API_BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions/{session_id}"
        response = requests.delete(url, timeout=10)
        response.raise_for_status()
        if response.status_code == 204:
            return None, None
        try:
            return response.json(), None
        except json.JSONDecodeError as e:
            print(f"JSON decode error in delete_session: {e}")
            return None, str(e)
    except requests.exceptions.RequestException as e:
        print(f"Failed to delete session: {e}")
        return None, str(e)

def stream_agent_response(payload):
    """Posts a message to the agent and streams the response."""
    try:
        with requests.post(f"{API_BASE_URL}/run_sse", headers={"Content-Type": "application/json"}, data=json.dumps(payload), stream=True) as r:
            r.raise_for_status()
            for chunk in r.iter_lines():
                if not chunk: continue
                chunk_str = chunk.decode('utf-8')
                if chunk_str.startswith('data: '):
                    chunk_str = chunk_str[6:]
                try:
                    data = json.loads(chunk_str)
                    yield data, None
                except json.JSONDecodeError as e:
                    print(f"JSON decode error: {e} - Bad chunk: {chunk_str}")
    except requests.exceptions.RequestException as e:
        error_content = f"Error communicating with agent: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_content += f" (Status code: {e.response.status_code})"
        yield None, error_content
