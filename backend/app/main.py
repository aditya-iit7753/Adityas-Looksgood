from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ALLOW_CREDENTIALS, CORS_ORIGINS, GENERATED_STORAGE_DIR, validate_runtime_config
from app.database import init_db
from app.routes import ads, ai, auth, commerce, feed, social, stories, subscription, video

app = FastAPI(title="LooksGood API")

GENERATED_DIR = GENERATED_STORAGE_DIR
GENERATED_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")

allowed_origins = CORS_ORIGINS or ["*"]
allow_credentials = CORS_ALLOW_CREDENTIALS and "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUTES = (
    (auth.router, "/auth"),
    (ai.router, "/ai"),
    (video.router, "/video"),
    (feed.router, "/feed"),
    (subscription.router, "/subscription"),
    (ads.router, "/ads"),
    (commerce.router, "/commerce"),
    (social.router, "/social"),
    (stories.router, "/stories"),
)

# Serve both /<route> and /api/<route> so mobile clients remain compatible
# even when they switch between base URLs with and without "/api".
for base_prefix in ("", "/api"):
    for router, route_prefix in ROUTES:
        app.include_router(router, prefix=f"{base_prefix}{route_prefix}")


@app.on_event("startup")
def on_startup():
    validate_runtime_config()
    init_db()


@app.get("/")
def root():
    return {"status": "LooksGood backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api")
def api_root():
    return {"status": "LooksGood backend running", "prefix": "/api"}


@app.get("/api/health")
def api_health():
    return {"status": "ok", "prefix": "/api"}
