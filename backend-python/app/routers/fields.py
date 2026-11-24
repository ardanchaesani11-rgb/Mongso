from typing import Any

import asyncpg
from fastapi import APIRouter, HTTPException, Request

from app.models import CreateFieldRequest
from app.routers.auth import extract_user

router = APIRouter(prefix="/fields", tags=["fields"])


@router.get("")
async def list_fields(request: Request) -> list[dict[str, Any]]:
    user = await extract_user(request)
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM user_fields WHERE user_id = $1 ORDER BY id ASC",
            user["id"],
        )
    return [
        {
            "id": int(f["id"]),
            "name": f["name"],
            "latitude": float(f["latitude"]),
            "longitude": float(f["longitude"]),
            "commodity_id": int(f["commodity_id"]),
        }
        for f in rows
    ]


@router.post("")
async def create_field(payload: CreateFieldRequest, request: Request) -> dict[str, Any]:
    user = await extract_user(request)
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_fields WHERE user_id = $1",
            user["id"],
        )
        if int(count or 0) >= 5:
            raise HTTPException(
                status_code=400,
                detail="Batas maksimal 5 lahan tersimpan telah tercapai.",
            )

        clean_name = payload.name.strip()
        new_id = await conn.fetchval(
            """
            INSERT INTO user_fields (user_id, name, latitude, longitude, commodity_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            user["id"],
            clean_name,
            payload.latitude,
            payload.longitude,
            payload.commodity_id,
        )

    return {
        "id": int(new_id),
        "name": clean_name,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "commodity_id": payload.commodity_id,
    }


@router.delete("/{field_id}")
async def delete_field(field_id: int, request: Request) -> dict[str, str]:
    user = await extract_user(request)
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        status = await conn.execute(
            "DELETE FROM user_fields WHERE id = $1 AND user_id = $2",
            field_id,
            user["id"],
        )
    if status.endswith(" 0"):
        raise HTTPException(status_code=404, detail="Petak lahan tidak ditemukan")
    return {"detail": "deleted"}
