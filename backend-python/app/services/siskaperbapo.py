import asyncio
from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Any, Optional

import asyncpg
import httpx

logger = logging.getLogger("mongso-siskaperbapo")

WIB = timezone(timedelta(hours=7))

# Pemetaan nama kabupaten/kota Mongso -> kode wilayah di API JSON SISKAPERBAPO Jatim
KODE_WILAYAH_SISKAPERBAPO: dict[str, str] = {
    "Kab. Kediri": "kedirikab",
    "Kota Kediri": "kedirikota",
    "Kab. Malang": "malangkab",
    "Kota Malang": "malangkota",
    "Kab. Nganjuk": "nganjukkab",
    "Kab. Banyuwangi": "banyuwangikab",
    "Kota Batu": "batukota",
    "Kota Surabaya": "surabayakota",
    "Kab. Sidoarjo": "sidoarjokab",
    "Kab. Probolinggo": "probolinggokab",
}

SISKAPERBAPO_URL = "https://siskaperbapo.jatimprov.go.id/home2/getDataMap"


async def sync_live_siskaperbapo(
    pool: asyncpg.Pool,
    target_date: Optional[str] = None,
) -> dict[str, Any]:
    """
    Menarik data harga real-time dari API resmi SISKAPERBAPO Pemprov Jawa Timur
    dan menyimpannya ke PostgreSQL (tabel `commodities` & `market_prices`).
    Jika API luar lambat/offline, data cache yang ada di PostgreSQL tetap aman.
    """
    tgl_str = target_date or datetime.now(WIB).strftime("%Y-%m-%d")
    synced_commodities = 0
    updated_prices = 0
    details: list[dict[str, Any]] = []

    async with pool.acquire() as conn:
        commodities = await conn.fetch(
            "SELECT id, siska_id, name FROM commodities ORDER BY id ASC"
        )

    headers = {"User-Agent": "Mozilla/5.0 (MongsoAgriPlan/2.0)"}
    async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
        for kom in commodities:
            cid = int(kom["id"])
            siska_id = int(kom["siska_id"])
            name = str(kom["name"])

            try:
                resp = await client.get(
                    SISKAPERBAPO_URL,
                    params={"tanggal": tgl_str, "komoditas": siska_id},
                )
                resp.raise_for_status()
                payload = resp.json()

                data_kab = payload.get("data") or {}
                avg_jatim = int(float(payload.get("avg") or 0))

                # Ambil riwayat 30 hari dari komoditas_harian.rows
                rows_30d = (payload.get("komoditas_harian") or {}).get("rows") or []
                hist_list: list[dict[str, Any]] = []
                weekly_change_pct = 0.0
                for r in rows_30d:
                    c_arr = r.get("c") or []
                    if len(c_arr) >= 2 and c_arr[1].get("v") is not None:
                        val_price = int(float(c_arr[1].get("v") or 0))
                        if val_price > 0:
                            hist_list.append(
                                {
                                    "date": str(c_arr[0].get("v", "")),
                                    "price": val_price,
                                }
                            )
                    meta = r.get("tooltip_metadata") or {}
                    if meta.get("kenaikan_persen") is not None:
                        weekly_change_pct = float(meta["kenaikan_persen"])

                # Fallback hitung persentase perubahan 7 hari bila metadata tidak tersedia
                if weekly_change_pct == 0.0 and len(hist_list) >= 8:
                    prev_p = hist_list[-8]["price"]
                    curr_p = hist_list[-1]["price"]
                    if prev_p > 0:
                        weekly_change_pct = round(((curr_p - prev_p) / prev_p) * 100.0, 1)

                reg_updated = 0
                async with pool.acquire() as conn:
                    if avg_jatim > 0 and hist_list:
                        await conn.execute(
                            """
                            UPDATE commodities
                            SET jatim_avg_price = $1,
                                history_30d_json = $2,
                                weekly_change_pct = $3
                            WHERE id = $4
                            """,
                            avg_jatim,
                            json.dumps(hist_list[-30:]),
                            weekly_change_pct,
                            cid,
                        )
                    elif avg_jatim > 0:
                        await conn.execute(
                            """
                            UPDATE commodities
                            SET jatim_avg_price = $1,
                                weekly_change_pct = $2
                            WHERE id = $3
                            """,
                            avg_jatim,
                            weekly_change_pct,
                            cid,
                        )

                    for nama_kab, kode_siska in KODE_WILAYAH_SISKAPERBAPO.items():
                        info_kab = data_kab.get(kode_siska) if isinstance(data_kab, dict) else None
                        hrg_kab = int(float(info_kab.get("hrg") or 0)) if isinstance(info_kab, dict) else 0
                        if hrg_kab <= 0 and avg_jatim > 0:
                            hrg_kab = avg_jatim
                        if hrg_kab <= 0:
                            continue

                        existing_id = await conn.fetchval(
                            """
                            SELECT id FROM market_prices
                            WHERE commodity_id = $1 AND regency_name = $2
                            ORDER BY id DESC LIMIT 1
                            """,
                            cid,
                            nama_kab,
                        )
                        if existing_id is not None:
                            await conn.execute(
                                """
                                UPDATE market_prices
                                SET price_per_kg = $1,
                                    recorded_date = $2,
                                    is_cached_fallback = 0
                                WHERE id = $3
                                """,
                                hrg_kab,
                                tgl_str,
                                existing_id,
                            )
                        else:
                            await conn.execute(
                                """
                                INSERT INTO market_prices (
                                    commodity_id, regency_name, price_per_kg, recorded_date, is_cached_fallback
                                ) VALUES ($1, $2, $3, $4, 0)
                                """,
                                cid,
                                nama_kab,
                                hrg_kab,
                                tgl_str,
                            )
                        reg_updated += 1

                synced_commodities += 1
                updated_prices += reg_updated
                details.append(
                    {
                        "commodity_id": cid,
                        "name": name,
                        "status": "ok",
                        "jatim_avg_price": avg_jatim,
                        "regencies_updated": reg_updated,
                    }
                )
            except Exception as exc:
                logger.warning("Fallback cache SISKAPERBAPO untuk %s (id=%s): %s", name, siska_id, exc)
                details.append(
                    {
                        "commodity_id": cid,
                        "name": name,
                        "status": "fallback_cache",
                        "error": str(exc),
                    }
                )

    logger.info(
        "SISKAPERBAPO sync selesai (%s): %d/%d komoditas, %d harga kab/kota diperbarui",
        tgl_str,
        synced_commodities,
        len(commodities),
        updated_prices,
    )
    return {
        "success": True,
        "date": tgl_str,
        "synced_commodities": synced_commodities,
        "total_commodities": len(commodities),
        "updated_prices": updated_prices,
        "details": details,
    }


async def periodic_siskaperbapo_loop(
    pool: asyncpg.Pool,
    interval_hours: float = 6.0,
) -> None:
    """Background task sinkronisasi berkala setiap beberapa jam."""
    # Tunggu 3 detik agar startup server selesai dulu
    await asyncio.sleep(3)
    while True:
        try:
            await sync_live_siskaperbapo(pool)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Background SISKAPERBAPO sync gagal: %s", exc)
        await asyncio.sleep(max(300.0, interval_hours * 3600.0))
