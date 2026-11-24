import hmac
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Header, HTTPException, Request

from app.services.agronomy import (
    analisis_rekomendasi_hama,
    hitung_radar_pasar_alternatif,
)
from app.services.news import get_news_feed_async
from app.services.open_meteo import get_weather_forecast
from app.services.pranata_mangsa import calculate_current_season, get_seasons_overview
from app.services.siskaperbapo import sync_live_siskaperbapo

router = APIRouter(tags=["agronomy"])


@router.get("/weather/forecast")
async def weather_forecast(
    request: Request,
    regency: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    label: Optional[str] = None,
) -> dict[str, Any]:
    reg_name = label or regency
    return await get_weather_forecast(reg_name, lat, lon, request.app.state.pool)


@router.get("/news")
async def news_feed(limit: int = 6) -> dict[str, Any]:
    return await get_news_feed_async(max(1, limit))


@router.get("/market-radar")
async def market_radar(
    request: Request,
    commodity_id: int = 1,
    regency: Optional[str] = None,
) -> dict[str, Any]:
    return await hitung_radar_pasar_alternatif(
        commodity_id, regency or "Kab. Kediri", request.app.state.pool
    )


@router.get("/pest-warning")
async def pest_warning(
    request: Request,
    commodity_id: int = 1,
    regency: Optional[str] = None,
) -> dict[str, Any]:
    reg = regency or "Kab. Kediri"
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        durasi = await conn.fetchval(
            "SELECT harvest_duration_days FROM commodities WHERE id = $1",
            commodity_id,
        )
        hujan = await conn.fetchval(
            "SELECT weekly_rainfall_mm FROM weather_cache WHERE regency_name = $1 LIMIT 1",
            reg,
        )
    return analisis_rekomendasi_hama(
        commodity_id,
        float(hujan) if hujan is not None else 145.0,
        int(durasi) if durasi is not None else 90,
    )


@router.get("/seasons/current")
async def current_season() -> dict[str, Any]:
    return calculate_current_season()


@router.get("/seasons")
async def list_seasons() -> dict[str, Any]:
    return get_seasons_overview()


@router.post("/admin/sync-siskaperbapo")
async def admin_sync_siskaperbapo(
    request: Request,
    tanggal: Optional[str] = None,
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    expected = request.app.state.settings.admin_secret_token
    supplied = (x_admin_token or "").strip()
    if not supplied and authorization and authorization.startswith("Bearer "):
        supplied = authorization[7:].strip()

    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=403,
            detail="Token admin tidak valid. Kirim header X-Admin-Token yang benar.",
        )

    return await sync_live_siskaperbapo(request.app.state.pool, target_date=tanggal)
