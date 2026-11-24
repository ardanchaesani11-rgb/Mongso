from dataclasses import dataclass
import hashlib
import hmac
import secrets
from fastapi import HTTPException
import httpx


def generate_token() -> str:
    return secrets.token_hex(32)


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(email: str, purpose: str, code: str) -> str:
    payload = f"{email.strip().lower()}:{purpose}:{code.strip()}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _compute_hash(salt: str, password: str) -> str:
    """
    100% byte-compatible with backend-rust/src/services/auth.rs:
    Initial SHA-256(salt + password), then 10,000 rounds of SHA-256(salt + raw_digest_bytes).
    """
    salt_bytes = salt.encode("utf-8")
    digest = hashlib.sha256(salt_bytes + password.encode("utf-8")).digest()
    for _ in range(10_000):
        digest = hashlib.sha256(salt_bytes + digest).digest()
    return digest.hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest_hex = _compute_hash(salt, password)
    return f"{salt}${digest_hex}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    parts = hashed_password.split("$")
    if len(parts) != 2:
        return False
    salt, expected_hash = parts[0], parts[1]
    computed = _compute_hash(salt, plain_password)
    return hmac.compare_digest(computed, expected_hash)


@dataclass
class GoogleUserClaims:
    sub: str
    email: str
    name: str


async def verify_google_id_token(
    credential: str,
    expected_client_id: str,
) -> GoogleUserClaims:
    trimmed = credential.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Token Google tidak ditemukan.")

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": trimmed},
            )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Gagal memverifikasi token dengan server Google.",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Token Google tidak valid atau sudah kedaluwarsa.",
        )

    try:
        info = resp.json()
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Respon verifikasi Google tidak valid.",
        )

    if info.get("aud") != expected_client_id:
        raise HTTPException(
            status_code=401,
            detail="Token Google tidak cocok dengan aplikasi ini.",
        )

    if str(info.get("email_verified", "")).lower() != "true":
        raise HTTPException(
            status_code=401,
            detail="Email akun Google Anda belum terverifikasi.",
        )

    sub = (info.get("sub") or "").strip()
    email = (info.get("email") or "").strip().lower()
    if not sub:
        raise HTTPException(status_code=401, detail="ID akun Google tidak ditemukan.")
    if not email:
        raise HTTPException(status_code=401, detail="Email akun Google tidak ditemukan.")

    name = (info.get("name") or "").strip() or email.split("@")[0] or "Petani Mongso"
    return GoogleUserClaims(sub=sub, email=email, name=name)
