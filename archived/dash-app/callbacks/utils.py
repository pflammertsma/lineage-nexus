import json

def _parse_events_to_messages(events):
    messages = []
    session_title = None
    if not events:
        return messages, session_title

    for event in events:
        # Handle error events
        if event.get("finishReason") and event.get("finishReason") != "STOP":
            error_message = event.get("errorCode", "Unknown Error")
            author = event.get("author", "System")
            details = json.dumps(event, indent=2)
            
            messages.append({
                "role": "error",
                "author": author,
                "main_message": error_message,
                "details": details
            })
            continue

        # Handle user-typed messages
        if event.get("author") == "user":
            if event.get("content", {}).get("parts"):
                full_text = "".join(p.get("text", "") for p in event["content"]["parts"])
                messages.append({"role": "user", "content": full_text})
            continue

        # Handle agent/tool messages
        author = event.get("author")
        content = event.get("content", {})
        
        if not content or not content.get("parts"):
            continue

        for part in content.get("parts"):
            if "functionResponse" in part:
                tool_response = part["functionResponse"]
                tool_name = tool_response.get('name', '?')
                response_data = tool_response.get('response', {})
                
                if tool_name == 'set_current_subject':
                    new_title = response_data.get('session_title')
                    if new_title:
                        session_title = new_title
                    continue  # Intentionally skip creating a message bubble

                # Check for tool error response
                if isinstance(response_data, dict) and response_data.get("status") == "error":
                    messages.append({
                        "role": "error",
                        "author": author,
                        "main_message": tool_name,
                        "details": json.dumps(response_data, indent=2)
                    })
                else:
                    # Handle successful function responses
                    tool_output = json.dumps(response_data, indent=2)
                    messages.append({"role": "tool_response", "name": tool_name, "output": tool_output, "author": author})

            elif "functionCall" in part:
                tool_call = part["functionCall"]
                tool_name = tool_call.get('name', '?')
                tool_input = json.dumps(tool_call.get('args', {}), indent=2)
                messages.append({"role": "tool", "name": tool_name, "input": tool_input, "author": author})

            elif "text" in part:
                # Only display text if it's not blank
                if part["text"].strip():
                    messages.append({"role": "assistant", "author": author, "content": part["text"]})
                
            else:
                print(f"Unknown message part: {part}")
    
    return messages, session_title
