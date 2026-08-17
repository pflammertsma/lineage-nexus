import hashlib
import json
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Deque, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from google import genai
from pydantic import BaseModel, Field

# --- Limits ---
# The endpoint is unauthenticated (BYOK is not authentication), so every input is
# bounded. Without these a single caller can pin an instance for the full 900s
# request timeout with an arbitrarily large payload.
MAX_MESSAGE_CHARS = 8_000
MAX_HISTORY_MESSAGES = 60
MAX_HISTORY_CHARS = 400_000
MAX_BODY_BYTES = 1_000_000

# Per-key sliding window. Keyed by a hash of the API key, so a shared IP (a
# household, a university) is not collectively limited, and the key itself is
# never held in memory. In-process only: with several Cloud Run instances this
# is per-instance, which is a floor on abuse rather than a hard ceiling.
RATE_LIMIT_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 300
_rate_buckets: Dict[str, Deque[float]] = {}


def _rate_limit_check(identity: str) -> Optional[int]:
    """Returns seconds to wait if the caller is over the limit, else None."""
    now = time.monotonic()
    bucket = _rate_buckets.setdefault(identity, deque())
    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()

    # Opportunistic sweep so idle callers do not accumulate forever.
    if len(_rate_buckets) > 4096:
        for key in [k for k, v in _rate_buckets.items() if not v]:
            del _rate_buckets[key]

    if len(bucket) >= RATE_LIMIT_REQUESTS:
        return max(1, int(RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
    bucket.append(now)
    return None


# --- Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: List[ChatMessage] = Field(default_factory=list)
    model: str = "gemini-flash-lite-latest"


def trim_history(history: List[ChatMessage]) -> List[dict]:
    """
    Bounds the context sent to Gemini, keeping the most recent exchanges.

    Trimming rather than rejecting: a long-running research session is the normal
    case, not an attack, and a 422 partway through one would be indistinguishable
    from the app breaking. Oldest messages go first, which is also what the model
    needs least.
    """
    recent = history[-MAX_HISTORY_MESSAGES:]

    kept: List[dict] = []
    total = 0
    for msg in reversed(recent):
        content = msg.content or ""
        if total + len(content) > MAX_HISTORY_CHARS:
            break
        kept.append({"role": msg.role, "content": content})
        total += len(content)
    kept.reverse()
    return kept

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


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """
    Rejects oversized payloads before they are parsed. Checked from the declared
    Content-Length: this is a cheap first gate, not a defence against a lying
    client, which the per-field limits below already cover.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": f"Request body exceeds {MAX_BODY_BYTES // 1000}kB."},
        )
    return await call_next(request)

# --- Endpoints ---
@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Lineage Nexus Cloud Backend",
        "version": "0.1.0"
    }

class ValidateKeyRequest(BaseModel):
    apiKey: str

@app.post("/api/v1/validate-key")
async def validate_key(req: ValidateKeyRequest):
    if not req.apiKey or not req.apiKey.strip():
        return {"valid": False, "error": "API key cannot be empty."}
    try:
        client = genai.Client(api_key=req.apiKey.strip())
        # Lightweight check to verify key validity
        client.models.list()
        return {"valid": True}
    except Exception as e:
        error_str = str(e)
        if "API_KEY_INVALID" in error_str or "API key not valid" in error_str:
            return {"valid": False, "error": "API key is invalid or revoked."}
        elif "RESOURCE_EXHAUSTED" in error_str or "Quota exceeded" in error_str:
            return {"valid": False, "error": "Quota or monthly budget cap exceeded on this key."}
        return {"valid": False, "error": f"Validation failed: {error_str[:120]}"}

@app.post("/api/v1/chat")
async def chat(
    request: ChatRequest,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key"),
    x_gemini_fallback_api_key: Optional[str] = Header(None, alias="X-Gemini-Fallback-API-Key")
):
    if not x_gemini_api_key and not x_gemini_fallback_api_key:
        raise HTTPException(status_code=401, detail="X-Gemini-API-Key header required (BYOK)")

    # Rate limited per key rather than per IP. The key is hashed so the limiter
    # never holds credentials, and a caller cannot dodge the limit by changing
    # networks — only by supplying a different key, which is the natural unit of
    # quota here anyway.
    identity = hashlib.sha256(
        (x_gemini_api_key or x_gemini_fallback_api_key).encode("utf-8")
    ).hexdigest()
    retry_after = _rate_limit_check(identity)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many research requests. Limit is {RATE_LIMIT_REQUESTS} per "
                f"{RATE_LIMIT_WINDOW_SECONDS // 60} minutes. Try again in {retry_after}s."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    trimmed_history = trim_history(request.history)

    async def event_generator():
        try:
            client = genai.Client(api_key=x_gemini_api_key) if x_gemini_api_key else None
            fallback_client = genai.Client(api_key=x_gemini_fallback_api_key) if x_gemini_fallback_api_key else None
            
            # If primary is missing but fallback is present, default primary to fallback
            if not client:
                client = fallback_client
                fallback_client = None

            from orchestrator import ResearchOrchestrator
            orchestrator = ResearchOrchestrator(client=client, fallback_client=fallback_client, model_name=request.model)
            
            async for update in orchestrator.chat(message=request.message, history=trimmed_history):
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
