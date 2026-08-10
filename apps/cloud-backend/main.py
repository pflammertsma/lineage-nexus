import json
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from pydantic import BaseModel

# --- Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    model: str = "gemini-flash-lite-latest"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("Lineage Nexus Cloud Backend starting up...")
    yield
    # Shutdown logic
    print("Lineage Nexus Cloud Backend shutting down...")

app = FastAPI(
    title="Lineage Nexus API",
    description="Stateless Backend for Lineage Nexus Heritage Research",
    version="0.1.0",
    lifespan=lifespan
)

# --- Middleware ---
# Set ALLOWED_ORIGINS to a comma-separated list to lock this down in production.
# Credentials stay off: auth is the BYOK header, not cookies, and a wildcard origin with
# credentials enabled is rejected by browsers anyway.
_origins = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Endpoints ---
@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Lineage Nexus Cloud Backend",
        "version": "0.1.0"
    }

@app.post("/api/v1/chat")
async def chat(
    request: ChatRequest,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="X-Gemini-API-Key header required (BYOK)")
    
    async def event_generator():
        try:
            client = genai.Client(api_key=x_gemini_api_key)
            from orchestrator import ResearchOrchestrator
            orchestrator = ResearchOrchestrator(client=client, model_name=request.model)
            
            history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
            
            async for update in orchestrator.chat(message=request.message, history=history_dicts):
                # Padding must go before \n\n to stay within the same 'data' chunk.
                # Clients trim the frame before parsing, so the filler is discarded.
                payload = json.dumps(update)
                chunk = f"data: {payload}{' ' * max(0, 4096 - len(payload))}\n\n"
                yield chunk
                
        except Exception as e:
            from google.genai.errors import ClientError, APIError
            error_str = str(e)
            if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str or "Quota exceeded" in error_str:
                error_msg = "Gemini API Quota Exceeded. You have reached the rate limit for free-tier requests (5 requests/min). Please wait ~1 minute before retrying or check your API key quota."
            elif isinstance(e, ClientError) and getattr(e, 'code', None) == 400 and 'API key not valid' in str(getattr(e, 'message', '')):
                error_msg = "Invalid Gemini API Key. Please update your key in Settings."
            else:
                import traceback
                print(traceback.format_exc())
                error_msg = f"An unexpected error occurred: {error_str}"
            
            chunk = f"data: {json.dumps({'error': error_msg, 'retry': True})}\n\n"
            yield chunk + (" " * 1024)

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )

if __name__ == "__main__":
    import uvicorn
    # Use PORT from env for Cloud Run
    port = int(os.environ.get("PORT", 8081))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
