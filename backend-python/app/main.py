import asyncio
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import Settings
from app.db import create_pool
from app.routers import auth, dashboard, fields, misc, plans
from app.services.siskaperbapo import periodic_siskaperbapo_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("mongso-python")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _resolve_static(relative: str) -> Optional[Path]:
    candidates = [
        PROJECT_ROOT / relative,
        Path(relative),
        Path("..") / relative,
    ]
    for p in candidates:
        if p.exists():
            return p.resolve()
    return None


def create_app(
    settings: Optional[Settings] = None,
    server_settings: Optional[dict[str, str]] = None,
    enable_background_sync: Optional[bool] = None,
) -> FastAPI:
    cfg = settings or Settings.from_env()
    if enable_background_sync is None:
        enable_background_sync = os.getenv("ENABLE_SISKA_AUTO_SYNC", "true").lower() in (
            "1",
            "true",
            "yes",
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = cfg
        app.state.pool = await create_pool(
            cfg.database_url,
            server_settings=server_settings,
        )
        logger.info("MONGSO FastAPI Backend connected to PostgreSQL")
        sync_task: Optional[asyncio.Task] = None
        if enable_background_sync:
            sync_task = asyncio.create_task(periodic_siskaperbapo_loop(app.state.pool, interval_hours=6.0))
        try:
            yield
        finally:
            if sync_task is not None:
                sync_task.cancel()
                try:
                    await sync_task
                except asyncio.CancelledError:
                    pass
            await app.state.pool.close()

    app = FastAPI(
        title="Mongso | AgriPlan API",
        version="2.0.0",
        description="Backend utama Mongso AgriPlan berbasis FastAPI + asyncpg PostgreSQL + Live SISKAPERBAPO",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=3600,
    )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc.errors())},
        )

    @app.api_route("/health", methods=["GET", "HEAD"])
    async def health_check():
        return {
            "status": "ok",
            "service": "mongso-backend-python",
            "version": "2.0.0",
            "database": "postgresql",
        }

    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(auth.router)
    api_v1.include_router(dashboard.router)
    api_v1.include_router(fields.router)
    api_v1.include_router(plans.router)
    api_v1.include_router(misc.router)
    app.include_router(api_v1)

    # Static assets
    css_dir = _resolve_static("web-frontend/css")
    if css_dir:
        app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
    js_dir = _resolve_static("js") or _resolve_static("web-frontend/js")
    if js_dir:
        app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")
    img_dir = _resolve_static("web-frontend/img")
    if img_dir:
        app.mount("/img", StaticFiles(directory=str(img_dir)), name="img")

    def _serve_html(filename: str):
        target = _resolve_static(f"web-frontend/{filename}")
        if target and target.is_file():
            return FileResponse(str(target))
        return JSONResponse(status_code=404, content={"detail": f"{filename} not found"})

    @app.api_route("/", methods=["GET", "HEAD"])
    @app.api_route("/index.html", methods=["GET", "HEAD"])
    async def serve_index():
        return _serve_html("index.html")

    @app.get("/cuaca.html")
    async def serve_cuaca():
        return _serve_html("cuaca.html")

    @app.get("/pasar.html")
    async def serve_pasar():
        return _serve_html("pasar.html")

    @app.get("/kalkulator.html")
    async def serve_kalkulator():
        return _serve_html("kalkulator.html")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    async def fallback_not_found(full_path: str):
        return JSONResponse(
            status_code=404,
            content={"detail": "Endpoint tidak ditemukan"},
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    cfg = Settings.from_env()
    uvicorn.run("app.main:app", host=cfg.host, port=cfg.port, reload=False)
