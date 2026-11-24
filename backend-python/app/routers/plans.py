from datetime import date, timedelta
from typing import Any

import asyncpg
from fastapi import APIRouter, HTTPException, Request

from app.models import EvaluatePlanRequest, SavePlanRequest
from app.routers.auth import extract_user
from app.services.agronomy import (
    analisis_rekomendasi_hama,
    get_commodity_icon,
    hitung_modal_dan_kelayakan,
    hitung_radar_pasar_alternatif,
    hitung_status_risiko,
)

router = APIRouter(prefix="/planting-plans", tags=["planting-plans"])


@router.post("/evaluate")
async def evaluate(payload: EvaluatePlanRequest, request: Request) -> dict[str, Any]:
    if payload.area_ha <= 0.0:
        raise HTTPException(status_code=400, detail="Luas lahan harus lebih besar dari 0")

    try:
        start_dt = date.fromisoformat(payload.start_date)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Format tanggal mulai tanam harus YYYY-MM-DD",
        )

    pool: asyncpg.Pool = request.app.state.pool
    cid = int(payload.commodity_id)

    async with pool.acquire() as conn:
        komoditas = await conn.fetchrow("SELECT * FROM commodities WHERE id = $1", cid)
        if not komoditas:
            raise HTTPException(status_code=404, detail="Komoditas tidak ditemukan")

        lahan_terdaftar = float(
            await conn.fetchval(
                "SELECT COALESCE(SUM(area_ha), 0.0::DOUBLE PRECISION) FROM planting_plans WHERE commodity_id = $1 AND regency_name = $2",
                cid,
                payload.regency_name,
            )
            or 0.0
        )
        hujan_val = await conn.fetchval(
            "SELECT weekly_rainfall_mm FROM weather_cache WHERE regency_name = $1 LIMIT 1",
            payload.regency_name,
        )
        hujan_mm = float(hujan_val) if hujan_val is not None else 145.0

        harga_val = await conn.fetchval(
            "SELECT price_per_kg FROM market_prices WHERE commodity_id = $1 AND regency_name = $2 ORDER BY id DESC LIMIT 1",
            cid,
            payload.regency_name,
        )
        harga_lokal = int(harga_val) if harga_val is not None else int(komoditas["jatim_avg_price"])

    durasi = int(komoditas["harvest_duration_days"])
    est_panen = start_dt + timedelta(days=durasi)
    harvest_window = {
        "start": (est_panen - timedelta(days=7)).strftime("%d %b %Y"),
        "end": (est_panen + timedelta(days=7)).strftime("%d %b %Y"),
    }

    total_lahan_baru = lahan_terdaftar + payload.area_ha
    kuota = float(komoditas["safe_market_quota_ha"])
    rasio_kuota_persen = round((total_lahan_baru / kuota) * 100.0, 1)

    skor_risiko, status_risiko, badge_pendek = hitung_status_risiko(
        rasio_kuota_persen, hujan_mm, float(komoditas["max_safe_rainfall_mm"])
    )
    pest_warning = analisis_rekomendasi_hama(cid, hujan_mm, durasi)
    cost_profit_feasibility = hitung_modal_dan_kelayakan(cid, payload.area_ha, harga_lokal)
    market_radar_alternatives = await hitung_radar_pasar_alternatif(
        cid, payload.regency_name, pool
    )

    return {
        "commodity_name": komoditas["name"],
        "regency_name": payload.regency_name,
        "input_area_ha": payload.area_ha,
        "harvest_duration_days": durasi,
        "total_regional_area_ha": round(total_lahan_baru, 1),
        "safe_market_quota_ha": kuota,
        "quota_utilization_percent": rasio_kuota_persen,
        "total_window_projected_ha": round(total_lahan_baru, 1),
        "quota_source": "Dinas Pertanian Jawa Timur (BPS/Siskaperbapo)",
        "estimated_harvest_date": est_panen.strftime("%d %b %Y"),
        "harvest_window": harvest_window,
        "weekly_rainfall_mm": hujan_mm,
        "risk_score": skor_risiko,
        "risk_status": status_risiko,
        "risk_badge": badge_pendek,
        "pest_warning": pest_warning,
        "cost_profit_feasibility": cost_profit_feasibility,
        "market_radar_alternatives": market_radar_alternatives,
    }


@router.post("/save")
async def save_plan(payload: SavePlanRequest, request: Request) -> dict[str, Any]:
    user = await extract_user(request)

    try:
        start_dt = date.fromisoformat(payload.start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal harus YYYY-MM-DD")

    pool: asyncpg.Pool = request.app.state.pool
    cid = int(payload.commodity_id)

    async with pool.acquire() as conn:
        komoditas = await conn.fetchrow("SELECT * FROM commodities WHERE id = $1", cid)
        if not komoditas:
            raise HTTPException(status_code=404, detail="Komoditas tidak ditemukan")

        lahan_terdaftar = float(
            await conn.fetchval(
                "SELECT COALESCE(SUM(area_ha), 0.0::DOUBLE PRECISION) FROM planting_plans WHERE commodity_id = $1 AND regency_name = $2",
                cid,
                payload.regency_name,
            )
            or 0.0
        )
        hujan_val = await conn.fetchval(
            "SELECT weekly_rainfall_mm FROM weather_cache WHERE regency_name = $1 LIMIT 1",
            payload.regency_name,
        )
        hujan_mm = float(hujan_val) if hujan_val is not None else 145.0

        est_panen = start_dt + timedelta(days=int(komoditas["harvest_duration_days"]))
        total_lahan_baru = lahan_terdaftar + payload.area_ha
        rasio_kuota_persen = (total_lahan_baru / float(komoditas["safe_market_quota_ha"])) * 100.0
        skor_risiko, _, badge_pendek = hitung_status_risiko(
            rasio_kuota_persen, hujan_mm, float(komoditas["max_safe_rainfall_mm"])
        )

        plan_id = await conn.fetchval(
            """
            INSERT INTO planting_plans (
                user_id, commodity_id, regency_name, area_ha, start_date, estimated_harvest_date, risk_score, risk_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            """,
            user["id"],
            cid,
            payload.regency_name,
            payload.area_ha,
            payload.start_date,
            est_panen.isoformat(),
            skor_risiko,
            badge_pendek,
        )

    return {
        "success": True,
        "message": "Rencana tanam berhasil disimpan",
        "plan_id": int(plan_id),
    }


@router.get("/my-plans")
async def my_plans(request: Request) -> dict[str, Any]:
    user = await extract_user(request)
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        plans = await conn.fetch(
            "SELECT * FROM planting_plans WHERE user_id = $1 ORDER BY id DESC",
            user["id"],
        )
        commodities = await conn.fetch("SELECT * FROM commodities")

    kom_by_id = {int(c["id"]): c for c in commodities}
    items = []
    for p in plans:
        cid = int(p["commodity_id"])
        kom = kom_by_id.get(cid)
        items.append(
            {
                "id": int(p["id"]),
                "commodity_id": cid,
                "commodity_name": kom["name"] if kom else "Komoditas",
                "commodity_icon": get_commodity_icon(cid),
                "regency_name": p["regency_name"],
                "area_ha": float(p["area_ha"]),
                "start_date": p["start_date"],
                "estimated_harvest_date": p["estimated_harvest_date"],
                "risk_score": int(p["risk_score"]),
                "risk_status": p["risk_status"],
            }
        )
    return {"plans": items}
