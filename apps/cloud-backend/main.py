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
    model: str = "gemini-2.0-flash-exp"  # Default to latest if not specified

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

@app.post("/api/v1/chat")
async def chat(
    request: ChatRequest,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="X-Gemini-API-Key header required (BYOK)")
    
    try:
        # Initializing client for this request (Stateless)
        client = genai.Client(api_key=x_gemini_api_key)
        
        # In a real tool, we might use client.aio for async
        # For simplicity in this first build, we run synchronous and wrap it or just use aio
        # Let's import the orchestrator and execute
        from orchestrator import ResearchOrchestrator
        orchestrator = ResearchOrchestrator(client=client, model_name=request.model)
        
        # Convert history format
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
        
        # Perform the chat (this handles tool calling)
        response = orchestrator.chat(message=request.message, history=history_dicts)
        
        # If response was actually sync (google-genai) we might need to await if we use aio
        # For now we'll assume a standard synchronous call for tool-calling loop (can be complex otherwise)
        # But we'll try to stick to basic response for now.
        
        # Extract the final answer or tool calls
        return {
            "response": response.text,
            "usage": response.usage_metadata.to_json() if response.usage_metadata else {},
            "model": request.model
        }
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Use PORT from env for Cloud Run
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
