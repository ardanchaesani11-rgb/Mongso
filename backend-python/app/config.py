from dataclasses import dataclass
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=False)


def _non_empty_env(key: str) -> Optional[str]:
    val = os.getenv(key)
    if val is None:
        return None
    stripped = val.strip()
    return stripped if stripped else None


def _resolve_database_url() -> str:
    raw = _non_empty_env("DATABASE_URL")
    if raw:
        for prefix in ("postgres://", "postgresql+psycopg2://", "postgresql+asyncpg://"):
            if raw.startswith(prefix):
                return "postgresql://" + raw[len(prefix):]
        return raw
    user = os.getenv("POSTGRES_USER", "ardan")
    password = os.getenv("POSTGRES_PASSWORD", "mongso_rahasia_2026")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "mongso_db")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    database_url: str
    admin_secret_token: str
    web_dir: str
    app_env: str
    resend_api_key: Optional[str]
    email_from: str
    google_client_id: Optional[str]

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() != "production"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            database_url=_resolve_database_url(),
            admin_secret_token=os.getenv("ADMIN_SECRET_TOKEN", "mongso-tim6-rahasia"),
            web_dir=os.getenv("WEB_DIR", "../web-frontend"),
            app_env=os.getenv("APP_ENV", "development"),
            resend_api_key=_non_empty_env("RESEND_API_KEY"),
            email_from=_non_empty_env("EMAIL_FROM")
            or "Mongso AgriPlan <noreply@mongso.site>",
            google_client_id=_non_empty_env("GOOGLE_CLIENT_ID"),
        )
