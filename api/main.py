import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from routes import router
from auth_routes import router as auth_router
from event_routes import router as event_router

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
log = logging.getLogger("api")

app = FastAPI(title="POS Plugin Management API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)
app.include_router(event_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/webhook/mock")
async def mock_webhook(request: Request):
    """Simple sink endpoint for the HTTP Call Plugin to target during demos."""
    body = await request.json()
    log.info("Mock webhook received event: %s", body.get("event_type"))
    return {"received": True, "event_type": body.get("event_type")}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
