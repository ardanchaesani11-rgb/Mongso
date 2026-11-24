from dataclasses import dataclass
import html
import logging
from typing import Optional

from fastapi import HTTPException
import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class EmailSendResult:
    sent: bool
    dev_code: Optional[str]


async def send_otp_email(
    settings: Settings,
    to_email: str,
    full_name: str,
    code: str,
    purpose: str,
) -> EmailSendResult:
    if purpose == "reset_password":
        subject = f"Kode Reset Kata Sandi Mongso: {code}"
        heading = "Reset Kata Sandi Akun Mongso"
        intro = (
            "Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. "
            "Masukkan kode 6 digit berikut di halaman Mongso (berlaku 10 menit):"
        )
    elif purpose == "login":
        subject = f"Kode Masuk Akun Mongso: {code}"
        heading = "Kode Masuk Akun Mongso"
        intro = (
            "Gunakan kode 6 digit berikut untuk langsung masuk ke akun Mongso Anda "
            "tanpa kata sandi (berlaku 10 menit):"
        )
    else:
        subject = f"Kode Verifikasi Akun Mongso: {code}"
        heading = "Verifikasi Email Pendaftaran Mongso"
        intro = (
            "Terima kasih sudah mendaftar di Mongso AgriPlan. Masukkan kode 6 digit berikut "
            "untuk mengaktifkan akun Anda (berlaku 10 menit):"
        )

    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY belum diatur. Kode OTP (%s) untuk %s: %s",
            purpose,
            to_email,
            code,
        )
        return EmailSendResult(
            sent=False,
            dev_code=code if settings.is_dev else None,
        )

    raw_name = full_name.strip() or "Petani Mongso"
    safe_name_html = html.escape(raw_name)

    html_body = f"""<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f8f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#16211a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3ded5;border-radius:14px;padding:28px;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#23533e;font-weight:600;">MONGSO · AGRIPLAN</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#163323;">{heading}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4a574e;">Halo <strong>{safe_name_html}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4a574e;">{intro}</p>
    <div style="text-align:center;margin:20px 0;padding:18px;background:#eef2ea;border:1px dashed #23533e;border-radius:10px;">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#163323;">{code}</span>
    </div>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6e7d72;">Jika Anda tidak meminta kode ini, abaikan saja email ini. Jangan bagikan kode ini kepada siapa pun.</p>
  </div>
</body>
</html>"""

    text_body = (
        f"Halo {raw_name},\n\n{intro}\n\nKode Anda: {code}\n\n"
        "Kode berlaku 10 menit. Jika Anda tidak meminta kode ini, abaikan email ini.\n\n"
        "- Mongso AgriPlan (https://mongso.site)"
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_body,
                    "text": text_body,
                },
            )
    except Exception as exc:
        logger.error("Gagal menghubungi Resend API: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Gagal mengirim email verifikasi. Coba beberapa saat lagi.",
        )

    if resp.status_code >= 400:
        logger.error("Resend API error (%s): %s", resp.status_code, resp.text)
        raise HTTPException(
            status_code=500,
            detail="Layanan email sedang terkendala. Pastikan domain pengirim sudah terverifikasi di Resend.",
        )

    logger.info("OTP email (%s) terkirim ke %s via Resend", purpose, to_email)
    return EmailSendResult(sent=True, dev_code=None)
