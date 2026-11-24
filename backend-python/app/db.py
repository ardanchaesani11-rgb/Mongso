import json
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

from app.services.security import hash_password

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        hashed_password TEXT NOT NULL,
        role TEXT DEFAULT 'Petani Hortikultura',
        regency TEXT DEFAULT 'Kab. Kediri',
        session_token TEXT UNIQUE,
        email_verified BIGINT NOT NULL DEFAULT 1,
        google_sub TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_codes (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts BIGINT NOT NULL DEFAULT 0,
        used BIGINT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS commodities (
        id BIGINT PRIMARY KEY,
        siska_id BIGINT NOT NULL,
        name TEXT UNIQUE NOT NULL,
        category TEXT DEFAULT 'Hortikultura',
        harvest_duration_days BIGINT NOT NULL,
        max_safe_rainfall_mm DOUBLE PRECISION NOT NULL,
        safe_market_quota_ha DOUBLE PRECISION NOT NULL,
        history_30d_json TEXT DEFAULT '[]',
        jatim_avg_price BIGINT DEFAULT 45000,
        weekly_change_pct DOUBLE PRECISION DEFAULT 0.0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS market_prices (
        id BIGSERIAL PRIMARY KEY,
        commodity_id BIGINT NOT NULL REFERENCES commodities(id),
        regency_name TEXT NOT NULL,
        price_per_kg BIGINT NOT NULL,
        recorded_date TEXT NOT NULL,
        is_cached_fallback BIGINT DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS weather_cache (
        id BIGSERIAL PRIMARY KEY,
        regency_name TEXT UNIQUE NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        weekly_rainfall_mm DOUBLE PRECISION NOT NULL,
        temperature_c DOUBLE PRECISION DEFAULT 29.0,
        forecast_summary TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS planting_plans (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id),
        commodity_id BIGINT NOT NULL REFERENCES commodities(id),
        regency_name TEXT NOT NULL,
        area_ha DOUBLE PRECISION NOT NULL,
        start_date TEXT NOT NULL,
        estimated_harvest_date TEXT NOT NULL,
        risk_score BIGINT NOT NULL,
        risk_status TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS user_fields (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        commodity_id BIGINT NOT NULL REFERENCES commodities(id)
    )
    """,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BIGINT NOT NULL DEFAULT 1",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT",
    "CREATE INDEX IF NOT EXISTS idx_auth_codes_email_purpose ON auth_codes (email, purpose, used, id DESC)",
    "CREATE INDEX IF NOT EXISTS idx_market_prices_com_reg ON market_prices (commodity_id, regency_name, id DESC)",
    "CREATE INDEX IF NOT EXISTS idx_planting_plans_com_reg ON planting_plans (commodity_id, regency_name)",
    "CREATE INDEX IF NOT EXISTS idx_user_fields_user ON user_fields (user_id, id ASC)",
]


async def create_pool(
    database_url: str,
    server_settings: Optional[dict[str, str]] = None,
    min_size: int = 2,
    max_size: int = 20,
) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=min_size,
        max_size=max_size,
        command_timeout=10,
        server_settings=server_settings or {},
    )
    await init_schema_and_seed(pool)
    return pool


async def init_schema_and_seed(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        for stmt in SCHEMA_STATEMENTS:
            await conn.execute(stmt)
        await _seed_commodities(conn)
        await _seed_market_prices(conn)
        await _seed_weather_cache(conn)
        await _seed_planting_plans(conn)
        await _seed_users(conn)


async def _seed_commodities(conn: asyncpg.Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM commodities")
    if count and count > 0:
        return

    today = datetime.now(timezone.utc).date()
    commodities = [
        (1, 50, "Cabai Rawit", 90, 150.0, 300.0, 45000, 1.5),
        (2, 39, "Bawang Merah", 65, 100.0, 350.0, 32000, -2.0),
        (3, 38, "Cabai Merah Besar", 85, 150.0, 280.0, 38000, 0.8),
        (4, 46, "Tomat", 75, 140.0, 220.0, 14000, -1.2),
        (5, 45, "Kentang", 100, 180.0, 260.0, 18500, 0.5),
        (6, 44, "Kubis / Kol", 80, 170.0, 240.0, 9500, -0.4),
    ]

    for cid, siska_id, name, duration, max_rain, quota, avg_price, weekly_change in commodities:
        history = []
        for i in range(29, -1, -1):
            day = today - timedelta(days=i)
            factor = 1.0 + 0.05 * math.sin(i * 0.7)
            price = int(round(avg_price * factor))
            history.append({"date": day.strftime("%Y-%m-%d"), "price": price})

        await conn.execute(
            """
            INSERT INTO commodities (
                id, siska_id, name, category, harvest_duration_days,
                max_safe_rainfall_mm, safe_market_quota_ha, history_30d_json,
                jatim_avg_price, weekly_change_pct
            ) VALUES ($1, $2, $3, 'Hortikultura', $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
            """,
            cid,
            siska_id,
            name,
            duration,
            max_rain,
            quota,
            json.dumps(history),
            avg_price,
            weekly_change,
        )


async def _seed_market_prices(conn: asyncpg.Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM market_prices")
    if count and count > 0:
        return

    today_str = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
    regencies = [
        ("Kab. Kediri", 0.94),
        ("Kota Kediri", 0.96),
        ("Kab. Malang", 0.97),
        ("Kota Malang", 1.00),
        ("Kab. Nganjuk", 0.92),
        ("Kab. Banyuwangi", 1.02),
        ("Kota Batu", 0.95),
        ("Kota Surabaya", 1.08),
        ("Kab. Sidoarjo", 1.05),
        ("Kab. Probolinggo", 0.96),
    ]
    base_prices = [
        (1, 45000),
        (2, 32000),
        (3, 38000),
        (4, 14000),
        (5, 18500),
        (6, 9500),
    ]

    for regency, factor in regencies:
        for cid, base in base_prices:
            price = int(round((base * factor) / 500.0)) * 500
            await conn.execute(
                """
                INSERT INTO market_prices (
                    commodity_id, regency_name, price_per_kg, recorded_date, is_cached_fallback
                ) VALUES ($1, $2, $3, $4, 0)
                """,
                cid,
                regency,
                price,
                today_str,
            )


async def _seed_weather_cache(conn: asyncpg.Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM weather_cache")
    if count and count > 0:
        return

    items = [
        ("Kab. Kediri", -7.8166, 112.0114, 145.0, 29.0, "Musim Hujan Awal"),
        ("Kota Kediri", -7.8228, 112.0119, 140.0, 29.5, "Musim Hujan Awal"),
        ("Kab. Malang", -8.1333, 112.5667, 130.0, 26.5, "Hujan Ringan"),
        ("Kota Malang", -7.9839, 112.6214, 125.0, 26.0, "Hujan Ringan"),
        ("Kab. Nganjuk", -7.6050, 111.9035, 118.0, 30.0, "Cerah Berawan"),
        ("Kab. Banyuwangi", -8.2192, 114.3691, 110.0, 30.5, "Berawan"),
        ("Kota Batu", -7.8671, 112.5239, 152.0, 23.0, "Hujan Sore"),
        ("Kota Surabaya", -7.2575, 112.7521, 85.0, 32.0, "Cerah"),
        ("Kab. Sidoarjo", -7.4478, 112.7183, 90.0, 31.5, "Cerah Berawan"),
        ("Kab. Probolinggo", -7.7547, 113.2159, 105.0, 30.0, "Berawan"),
    ]
    for regency, lat, lon, rain, temp, summary in items:
        await conn.execute(
            """
            INSERT INTO weather_cache (
                regency_name, latitude, longitude, weekly_rainfall_mm, temperature_c, forecast_summary
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (regency_name) DO NOTHING
            """,
            regency,
            lat,
            lon,
            rain,
            temp,
            summary,
        )


async def _seed_planting_plans(conn: asyncpg.Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM planting_plans")
    if count and count > 0:
        return

    today_str = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
    plans = [
        (1, "Kab. Kediri", 420.0, "2026-11-10", 78, "Risiko Tinggi"),
        (2, "Kab. Malang", 290.0, "2026-11-15", 58, "Waspada"),
        (2, "Kab. Nganjuk", 180.0, "2026-11-18", 32, "Aman"),
        (1, "Kab. Banyuwangi", 390.0, "2026-11-19", 74, "Risiko Tinggi"),
        (5, "Kota Batu", 165.0, "2026-11-22", 35, "Aman"),
        (4, "Kab. Kediri", 140.0, "2026-11-25", 34, "Aman"),
    ]
    for cid, regency, area, harvest_date, score, status in plans:
        await conn.execute(
            """
            INSERT INTO planting_plans (
                commodity_id, regency_name, area_ha, start_date, estimated_harvest_date, risk_score, risk_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            cid,
            regency,
            area,
            today_str,
            harvest_date,
            score,
            status,
        )


async def _seed_users(conn: asyncpg.Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM users")
    if count and count > 0:
        return

    today_str = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
    demo_users = [
        (
            "petani@mongso.id",
            "Pak Sugeng (Kelompok Tani Kediri)",
            "mongso2026",
            "Petani Hortikultura",
            "Kab. Kediri",
        ),
        (
            "ardan@mongso.id",
            "Ardan Chaesani Al Fahrizi",
            "admin2026",
            "Ketua Tim / Admin AgriPlan",
            "Kab. Kediri",
        ),
    ]
    for email, name, pwd, role, regency in demo_users:
        hashed = hash_password(pwd)
        await conn.execute(
            """
            INSERT INTO users (
                email, full_name, hashed_password, role, regency, session_token, created_at
            ) VALUES ($1, $2, $3, $4, $5, NULL, $6)
            ON CONFLICT (email) DO NOTHING
            """,
            email,
            name,
            hashed,
            role,
            regency,
            today_str,
        )
