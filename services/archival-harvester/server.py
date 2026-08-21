"""
Lineage Nexus Archival Gateway Engine Server.
Main entry point mounting modular APIRouters and middleware.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import MEILI_HOST
from routes.search import router as search_router
from routes.indexing import router as indexing_router
from routes.harvest import router as harvest_router

app = FastAPI(
    title="Lineage Nexus Archival Gateway Engine",
    version="1.0.0",
    description="High-speed self-hosted Dutch historical record search API powered by Meilisearch."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    import asyncio
    from metrics import start_metrics_sampler
    asyncio.create_task(start_metrics_sampler())


@app.get("/health")
def health_check():
    return {"status": "ok", "meilisearch": MEILI_HOST}


# Mount feature routers
app.include_router(search_router)
app.include_router(indexing_router)
app.include_router(harvest_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
