import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel

# --- Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    model: str = "gemini-flash-latest"  # Use stable Gemini 2.0 Flash

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Dependency ---
def get_gemini_client(x_gemini_api_key: Optional[str] = Header(None)):
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="X-Gemini-API-Key header required (BYOK)")
    
    try:
        # Initializing client per-request for true statelessness
        client = genai.Client(api_key=x_gemini_api_key)
        return client
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid API Key or initialization error: {str(e)}")

# --- Endpoints ---
@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Lineage Nexus Cloud Backend",
        "version": "0.1.0"
    }

from fastapi.responses import StreamingResponse
import json

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
                chunk = f"data: {json.dumps(update)}\n\n"
                yield chunk + (" " * 1024)
                
        except Exception as e:
            from google.genai.errors import ClientError
            error_msg = str(e)
            if isinstance(e, ClientError) and e.code == 400 and 'API key not valid' in str(e.message):
                error_msg = "Invalid Gemini API Key. Please update your key in Settings."
            else:
                import traceback
                print(traceback.format_exc())
            
            chunk = f"data: {json.dumps({'error': error_msg})}\n\n"
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
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
