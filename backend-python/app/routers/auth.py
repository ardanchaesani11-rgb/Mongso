from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, HTTPException, Request

from app.config import Settings
from app.models import (
    EmailOnlyRequest,
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.services.email import EmailSendResult, send_otp_email
from app.services.security import (
    generate_otp_code,
    generate_token,
    hash_otp,
    hash_password,
    verify_google_id_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECS = 45
OTP_MAX_ATTEMPTS = 5


def _is_valid_email(email: str) -> bool:
    parts = email.split("@")
    return (
        len(parts) == 2
        and bool(parts[0])
        and "." in parts[1]
        and not parts[1].startswith(".")
        and not parts[1].endswith(".")
    )


def _to_profile(user: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": int(user["id"]),
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"] or "Petani Hortikultura",
        "regency": user["regency"] or "Kab. Kediri",
    }


def extract_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Header Authorization tidak ditemukan")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token otentikasi kosong")
    return token


async def extract_user(request: Request) -> asyncpg.Record:
    token = extract_token(request)
    pool: asyncpg.Pool = request.app.state.pool
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM users WHERE session_token = $1",
            token,
        )
    if not user:
        raise HTTPException(status_code=401, detail="Sesi telah berakhir atau tidak valid")
    return user


async def _issue_otp(
    pool: asyncpg.Pool,
    settings: Settings,
    email: str,
    full_name: str,
    purpose: str,
    enforce_cooldown: bool,
) -> EmailSendResult:
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        if enforce_cooldown:
            latest = await conn.fetchrow(
                "SELECT * FROM auth_codes WHERE email = $1 AND purpose = $2 AND used = 0 ORDER BY id DESC LIMIT 1",
                email,
                purpose,
            )
            if latest:
                try:
                    created = datetime.fromisoformat(latest["created_at"])
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    elapsed = int((now - created).total_seconds())
                    if elapsed < OTP_RESEND_COOLDOWN_SECS:
                        wait = max(1, OTP_RESEND_COOLDOWN_SECS - elapsed)
                        raise HTTPException(
                            status_code=400,
                            detail=f"Tunggu {wait} detik sebelum meminta kode verifikasi baru.",
                        )
                except ValueError:
                    pass

        await conn.execute(
            "UPDATE auth_codes SET used = 1 WHERE email = $1 AND purpose = $2 AND used = 0",
            email,
            purpose,
        )

        code = generate_otp_code()
        code_hash = hash_otp(email, purpose, code)
        expires_at = (now + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
        created_at = now.isoformat()

        await conn.execute(
            """
            INSERT INTO auth_codes (email, purpose, code_hash, expires_at, attempts, used, created_at)
            VALUES ($1, $2, $3, $4, 0, 0, $5)
            """,
            email,
            purpose,
            code_hash,
            expires_at,
            created_at,
        )

    return await send_otp_email(settings, email, full_name, code, purpose)


async def _consume_otp(
    pool: asyncpg.Pool,
    email: str,
    purpose: str,
    code: str,
) -> None:
    clean_code = code.strip()
    if len(clean_code) != 6 or not clean_code.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Kode verifikasi harus berupa 6 digit angka.",
        )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM auth_codes WHERE email = $1 AND purpose = $2 AND used = 0 ORDER BY id DESC LIMIT 1",
            email,
            purpose,
        )
        if not row:
            raise HTTPException(
                status_code=400,
                detail="Kode verifikasi tidak ditemukan atau sudah dipakai. Silakan kirim kode baru.",
            )

        if int(row["attempts"]) >= OTP_MAX_ATTEMPTS:
            await conn.execute("UPDATE auth_codes SET used = 1 WHERE id = $1", row["id"])
            raise HTTPException(
                status_code=400,
                detail="Kode sudah terlalu banyak dicoba. Silakan kirim kode baru.",
            )

        try:
            exp = datetime.fromisoformat(row["expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            expired = datetime.now(timezone.utc) > exp
        except ValueError:
            expired = True

        if expired:
            await conn.execute("UPDATE auth_codes SET used = 1 WHERE id = $1", row["id"])
            raise HTTPException(
                status_code=400,
                detail="Kode verifikasi sudah kedaluwarsa (lebih dari 10 menit). Kirim ulang kode baru.",
            )

        expected_hash = hash_otp(email, purpose, clean_code)
        if expected_hash != row["code_hash"]:
            await conn.execute(
                "UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1",
                row["id"],
            )
            raise HTTPException(
                status_code=400,
                detail="Kode verifikasi tidak cocok. Periksa kembali 6 digit kode Anda.",
            )

        await conn.execute("UPDATE auth_codes SET used = 1 WHERE id = $1", row["id"])


@router.get("/config")
async def auth_config(request: Request) -> dict[str, Any]:
    settings: Settings = request.app.state.settings
    return {
        "google_client_id": settings.google_client_id,
        "email_provider_configured": settings.resend_api_key is not None,
    }


@router.post("/register")
async def register(payload: RegisterRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings

    email_clean = payload.email.strip().lower()
    full_name = payload.full_name.strip()
    if not email_clean or not payload.password or not full_name:
        raise HTTPException(status_code=400, detail="Semua bidang wajib diisi.")
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Format alamat email tidak valid.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Kata sandi minimal 8 karakter.")

    hashed = hash_password(payload.password)
    role = payload.role or "Petani Hortikultura"
    regency = payload.regency or "Kab. Kediri"
    now_date = datetime.now(timezone.utc).date().isoformat()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM users WHERE email = $1",
            email_clean,
        )
        if existing:
            if int(existing["email_verified"]) != 0:
                raise HTTPException(
                    status_code=400,
                    detail="Alamat email sudah terdaftar di sistem! Silakan masuk ke akun Anda.",
                )
            await conn.execute(
                """
                UPDATE users
                SET full_name = $1, hashed_password = $2, role = $3, regency = $4, session_token = NULL
                WHERE id = $5
                """,
                full_name,
                hashed,
                role,
                regency,
                existing["id"],
            )
        else:
            await conn.execute(
                """
                INSERT INTO users (email, full_name, hashed_password, role, regency, session_token, email_verified, created_at)
                VALUES ($1, $2, $3, $4, $5, NULL, 0, $6)
                """,
                email_clean,
                full_name,
                hashed,
                role,
                regency,
                now_date,
            )

    mail = await _issue_otp(pool, settings, email_clean, full_name, "register", False)
    message = (
        f"Kode verifikasi 6 digit telah dikirim ke {email_clean}. Periksa kotak masuk atau folder spam Anda."
        if mail.sent
        else "Kode verifikasi 6 digit berhasil dibuat. Masukkan kode di bawah untuk mengaktifkan akun."
    )
    res: dict[str, Any] = {
        "success": True,
        "requires_verification": True,
        "email": email_clean,
        "message": message,
    }
    if mail.dev_code is not None:
        res["dev_code"] = mail.dev_code
    return res


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    email_clean = payload.email.strip().lower()
    if not email_clean:
        raise HTTPException(status_code=400, detail="Alamat email wajib diisi.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(status_code=400, detail="Akun dengan email tersebut tidak ditemukan.")

    await _consume_otp(pool, email_clean, "register", payload.code)

    token = generate_token()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET email_verified = 1, session_token = $1 WHERE id = $2",
            token,
            user["id"],
        )

    return {
        "success": True,
        "message": "Email terverifikasi! Akun Mongso Anda sudah aktif.",
        "token": token,
        "user": _to_profile(user),
    }


@router.post("/resend-code")
async def resend_code(payload: EmailOnlyRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings
    email_clean = payload.email.strip().lower()
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Alamat email belum terdaftar. Silakan daftar terlebih dahulu.",
        )
    if int(user["email_verified"]) != 0:
        raise HTTPException(
            status_code=400,
            detail="Email Anda sudah terverifikasi. Silakan langsung masuk.",
        )

    mail = await _issue_otp(pool, settings, email_clean, user["full_name"], "register", True)
    message = (
        f"Kode verifikasi baru sudah dikirim ulang ke {email_clean}."
        if mail.sent
        else "Kode verifikasi baru berhasil dibuat."
    )
    res: dict[str, Any] = {"success": True, "message": message}
    if mail.dev_code is not None:
        res["dev_code"] = mail.dev_code
    return res


@router.post("/login")
async def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings
    email_clean = payload.email.strip().lower()

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)

    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi tidak cocok!")

    if int(user["email_verified"]) == 0:
        mail = await _issue_otp(pool, settings, email_clean, user["full_name"], "register", False)
        message = (
            f"Email Anda belum terverifikasi. Kami telah mengirim kode 6 digit baru ke {email_clean}."
            if mail.sent
            else "Email Anda belum terverifikasi. Masukkan kode 6 digit untuk mengaktifkan akun."
        )
        res: dict[str, Any] = {
            "success": False,
            "requires_verification": True,
            "email": email_clean,
            "message": message,
        }
        if mail.dev_code is not None:
            res["dev_code"] = mail.dev_code
        return res

    token = generate_token()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET session_token = $1 WHERE id = $2",
            token,
            user["id"],
        )

    return {
        "success": True,
        "message": "Login berhasil!",
        "token": token,
        "user": _to_profile(user),
    }


@router.post("/login-code/request")
async def request_login_code(payload: EmailOnlyRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings
    email_clean = payload.email.strip().lower()
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Email belum terdaftar. Silakan buat akun baru terlebih dahulu.",
        )

    mail = await _issue_otp(pool, settings, email_clean, user["full_name"], "login", True)
    message = (
        f"Kode masuk 6 digit telah dikirim ke {email_clean}. Berlaku 10 menit."
        if mail.sent
        else "Kode masuk 6 digit berhasil dibuat. Masukkan kode di bawah untuk langsung masuk."
    )
    res: dict[str, Any] = {"success": True, "message": message}
    if mail.dev_code is not None:
        res["dev_code"] = mail.dev_code
    return res


@router.post("/login-code/verify")
async def verify_login_code(payload: VerifyEmailRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    email_clean = payload.email.strip().lower()
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(status_code=401, detail="Akun dengan email tersebut tidak ditemukan.")

    await _consume_otp(pool, email_clean, "login", payload.code)

    token = generate_token()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET email_verified = 1, session_token = $1 WHERE id = $2",
            token,
            user["id"],
        )

    return {
        "success": True,
        "message": "Berhasil masuk dengan kode verifikasi!",
        "token": token,
        "user": _to_profile(user),
    }


@router.post("/forgot-password")
async def forgot_password(payload: EmailOnlyRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings
    email_clean = payload.email.strip().lower()
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(status_code=400, detail="Alamat email belum terdaftar di sistem.")

    mail = await _issue_otp(pool, settings, email_clean, user["full_name"], "reset_password", True)
    message = (
        f"Kode reset kata sandi 6 digit telah dikirim ke {email_clean}."
        if mail.sent
        else "Kode reset kata sandi 6 digit berhasil dibuat."
    )
    res: dict[str, Any] = {"success": True, "message": message}
    if mail.dev_code is not None:
        res["dev_code"] = mail.dev_code
    return res


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    email_clean = payload.email.strip().lower()
    if not _is_valid_email(email_clean):
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Kata sandi baru minimal 8 karakter.")

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email_clean)
    if not user:
        raise HTTPException(status_code=400, detail="Akun dengan email tersebut tidak ditemukan.")

    await _consume_otp(pool, email_clean, "reset_password", payload.code)

    hashed = hash_password(payload.new_password)
    token = generate_token()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET hashed_password = $1, email_verified = 1, session_token = $2 WHERE id = $3",
            hashed,
            token,
            user["id"],
        )

    return {
        "success": True,
        "message": "Kata sandi berhasil diperbarui dan Anda sudah masuk!",
        "token": token,
        "user": _to_profile(user),
    }


@router.post("/google")
async def google_auth(payload: GoogleAuthRequest, request: Request) -> dict[str, Any]:
    pool: asyncpg.Pool = request.app.state.pool
    settings: Settings = request.app.state.settings
    if not settings.google_client_id:
        raise HTTPException(
            status_code=400,
            detail="Login dengan Google belum diaktifkan di server (GOOGLE_CLIENT_ID belum diatur).",
        )

    claims = await verify_google_id_token(payload.credential, settings.google_client_id)
    token = generate_token()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM users WHERE google_sub = $1 OR email = $2 LIMIT 1",
            claims.sub,
            claims.email,
        )
        if existing:
            await conn.execute(
                "UPDATE users SET google_sub = $1, email_verified = 1, session_token = $2 WHERE id = $3",
                claims.sub,
                token,
                existing["id"],
            )
            profile = _to_profile(existing)
        else:
            random_pw_hash = hash_password(generate_token())
            role = "Petani Hortikultura"
            regency = (payload.regency or "").strip() or "Kab. Kediri"
            now_date = datetime.now(timezone.utc).date().isoformat()
            new_id = await conn.fetchval(
                """
                INSERT INTO users (email, full_name, hashed_password, role, regency, session_token, email_verified, google_sub, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
                RETURNING id
                """,
                claims.email,
                claims.name,
                random_pw_hash,
                role,
                regency,
                token,
                claims.sub,
                now_date,
            )
            profile = {
                "id": int(new_id),
                "email": claims.email,
                "full_name": claims.name,
                "role": role,
                "regency": regency,
            }

    return {
        "success": True,
        "message": "Berhasil masuk dengan akun Google!",
        "token": token,
        "user": profile,
    }


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    user = await extract_user(request)
    profile = _to_profile(user)
    return {
        "id": profile["id"],
        "email": profile["email"],
        "full_name": profile["full_name"],
        "role": profile["role"],
        "regency": profile["regency"],
        "user": profile,
    }


@router.post("/logout")
async def logout(request: Request) -> dict[str, str]:
    try:
        token = extract_token(request)
        pool: asyncpg.Pool = request.app.state.pool
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET session_token = NULL WHERE session_token = $1",
                token,
            )
    except HTTPException:
        pass
    return {"detail": "logged out"}
