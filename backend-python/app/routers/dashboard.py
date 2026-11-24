import json
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Request

from app.services.agronomy import (
    analisis_rekomendasi_hama,
    get_commodity_icon,
    get_dominant_commodity,
    hitung_modal_dan_kelayakan,
    hitung_radar_pasar_alternatif,
    hitung_status_risiko,
)
from app.services.news import build_field_advisories

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _parse_history(raw_json: str, avg: int) -> list[dict[str, Any]]:
    try:
        points = json.loads(raw_json)
        if isinstance(points, list) and len(points) >= 5:
            return points
    except Exception:
        pass
    return [
        {
            "date": f"2026-11-{i + 1:02d}",
            "price": int(round(avg * (0.92 + (i * 0.005)))),
        }
        for i in range(30)
    ]


@router.get("/summary")
async def summary(
    request: Request,
    regency: Optional[str] = None,
) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    reg = regency or "Kab. Kediri"
    dominant_cid = get_dominant_commodity(reg)

    async with pool.acquire() as conn:
        komoditas = await conn.fetchrow(
            "SELECT * FROM commodities WHERE id = $1",
            dominant_cid,
        )
        if not komoditas:
            komoditas = await conn.fetchrow("SELECT * FROM commodities LIMIT 1")

        harga_angka = await conn.fetchval(
            "SELECT price_per_kg FROM market_prices WHERE regency_name = $1 AND commodity_id = $2 ORDER BY id DESC LIMIT 1",
            reg,
            komoditas["id"],
        )
        harga_angka = int(harga_angka) if harga_angka is not None else int(komoditas["jatim_avg_price"])

        total_lahan = float(
            await conn.fetchval(
                "SELECT COALESCE(SUM(area_ha), 0.0::DOUBLE PRECISION) FROM planting_plans WHERE regency_name = $1 AND commodity_id = $2",
                reg,
                komoditas["id"],
            )
            or 0.0
        )
        if total_lahan == 0.0:
            total_lahan = 180.0

        weather_row = await conn.fetchrow(
            "SELECT weekly_rainfall_mm, temperature_c FROM weather_cache WHERE regency_name = $1 LIMIT 1",
            reg,
        )
        curah_hujan = float(weather_row["weekly_rainfall_mm"]) if weather_row else 145.0
        suhu_c = float(weather_row["temperature_c"]) if weather_row else 29.0

        semua_komoditas = await conn.fetch("SELECT * FROM commodities ORDER BY id ASC")
        kom_by_id = {int(k["id"]): k for k in semua_komoditas}

        siskaperbapo_table = []
        for k in semua_komoditas:
            hrg = await conn.fetchval(
                "SELECT price_per_kg FROM market_prices WHERE commodity_id = $1 AND regency_name = $2 ORDER BY id DESC LIMIT 1",
                k["id"],
                reg,
            )
            hrg = int(hrg) if hrg is not None else int(k["jatim_avg_price"])
            seri_k = _parse_history(k["history_30d_json"], int(k["jatim_avg_price"]))
            sparkline = [int(p["price"]) for p in seri_k[-10:]]
            siskaperbapo_table.append(
                {
                    "commodity_id": int(k["id"]),
                    "icon": get_commodity_icon(int(k["id"])),
                    "commodity_name": k["name"],
                    "daily_price": hrg,
                    "jatim_avg_price": int(k["jatim_avg_price"]),
                    "weekly_change_pct": float(k["weekly_change_pct"]),
                    "sparkline": sparkline,
                }
            )

        semua_rencana = await conn.fetch(
            "SELECT * FROM planting_plans ORDER BY id DESC LIMIT 10"
        )

    kuota_aman = float(komoditas["safe_market_quota_ha"])
    rasio_persen = round((total_lahan / kuota_aman) * 100.0, 1)
    skor_risiko, status_risiko, _ = hitung_status_risiko(
        rasio_persen, curah_hujan, float(komoditas["max_safe_rainfall_mm"])
    )

    seri_utama = _parse_history(komoditas["history_30d_json"], int(komoditas["jatim_avg_price"]))
    seri_cabai = (
        _parse_history(kom_by_id[1]["history_30d_json"], int(kom_by_id[1]["jatim_avg_price"]))
        if 1 in kom_by_id
        else []
    )
    seri_bawang = (
        _parse_history(kom_by_id[2]["history_30d_json"], int(kom_by_id[2]["jatim_avg_price"]))
        if 2 in kom_by_id
        else []
    )
    seri_tomat = (
        _parse_history(kom_by_id[4]["history_30d_json"], int(kom_by_id[4]["jatim_avg_price"]))
        if 4 in kom_by_id
        else []
    )

    history_30d_multi = {
        "labels": [str(p["date"])[5:] for p in seri_cabai[-15:]],
        "cabai_rawit": [int(p["price"]) for p in seri_cabai[-15:]],
        "bawang_merah": [int(p["price"]) for p in seri_bawang[-15:]],
        "tomat": [int(p["price"]) for p in seri_tomat[-15:]],
    }

    sebaran_table = []
    for r in semua_rencana:
        kom_r = kom_by_id.get(int(r["commodity_id"]))
        kuota_r = float(kom_r["safe_market_quota_ha"]) if kom_r else 300.0
        persen_r = int(round((float(r["area_ha"]) / kuota_r) * 100.0))
        _, _, badge_r = hitung_status_risiko(
            (float(r["area_ha"]) / kuota_r) * 100.0,
            curah_hujan,
            float(kom_r["max_safe_rainfall_mm"]) if kom_r else 150.0,
        )
        sebaran_table.append(
            {
                "id": int(r["id"]),
                "regency": r["regency_name"],
                "icon": get_commodity_icon(int(r["commodity_id"])),
                "commodity_name": kom_r["name"] if kom_r else "Cabai Rawit",
                "area_ha": round(float(r["area_ha"]), 1),
                "quota_ha": kuota_r,
                "bar_percent": max(0, min(100, persen_r)),
                "harvest_date": r["estimated_harvest_date"],
                "risk_badge": badge_r,
                "risk_score": int(r["risk_score"]),
            }
        )

    daily_rainfall_chart = [
        round(curah_hujan * w, 1)
        for w in (0.10, 0.16, 0.22, 0.18, 0.14, 0.12, 0.08)
    ]

    pest_warning = analisis_rekomendasi_hama(
        int(komoditas["id"]), curah_hujan, int(komoditas["harvest_duration_days"])
    )
    cost_profit_feasibility = hitung_modal_dan_kelayakan(
        int(komoditas["id"]), 1.0, harga_angka
    )
    market_radar_alternatives = await hitung_radar_pasar_alternatif(
        int(komoditas["id"]), reg, pool
    )
    news_feed = build_field_advisories(
        reg,
        komoditas["name"],
        harga_angka,
        float(komoditas["weekly_change_pct"]),
        curah_hujan,
        skor_risiko,
    )

    return {
        "regency": reg,
        "commodity_id": int(komoditas["id"]),
        "commodity_icon": get_commodity_icon(int(komoditas["id"])),
        "commodity_name": komoditas["name"],
        "top_price_rp": harga_angka,
        "jatim_avg_rp": int(komoditas["jatim_avg_price"]),
        "weekly_change_pct": float(komoditas["weekly_change_pct"]),
        "total_planted_ha": round(total_lahan, 1),
        "safe_quota_ha": kuota_aman,
        "quota_percentage": rasio_persen,
        "weekly_rainfall_mm": curah_hujan,
        "temperature_c": suhu_c,
        "risk_score": skor_risiko,
        "risk_status": status_risiko,
        "price_fluctuation_labels": [str(p["date"])[5:] for p in seri_utama[-12:]],
        "price_fluctuation_values": [int(p["price"]) for p in seri_utama[-12:]],
        "history_30d_multi": history_30d_multi,
        "daily_rainfall_chart": daily_rainfall_chart,
        "siskaperbapo_table": siskaperbapo_table,
        "sebaran_table": sebaran_table,
        "pest_warning": pest_warning,
        "cost_profit_feasibility": cost_profit_feasibility,
        "market_radar_alternatives": market_radar_alternatives,
        "news_feed": news_feed,
    }
