from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import html
import re
import time
from typing import Any, Optional

import httpx

WIB = timezone(timedelta(hours=7))
CACHE_TTL_SECS = 30 * 60
_news_cache: Optional[tuple[float, list[dict[str, Any]]]] = None

RSS_SOURCES = [
    ("Agrofarm Pangan & Pertanian", "https://www.agrofarm.co.id/feed/", False),
    ("Agrofarm Hortikultura", "https://www.agrofarm.co.id/category/hortikultura/feed/", False),
    ("Agrofarm Pangan", "https://www.agrofarm.co.id/category/pangan/feed/", False),
    ("ANTARA Jawa Timur", "https://jatim.antaranews.com/rss/terkini.xml", True),
]

MONTH_SHORT_ID = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
    7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
}

AGRI_KEYWORDS = (
    "petani", "pertanian", "pangan", "cabai", "bawang", "tomat", "beras", "jagung",
    "pupuk", "panen", "cuaca", "hujan", "angin", "banjir", "kekeringan", "bmkg",
    "bpbd", "harga", "pasar", "komoditas", "hortikultura", "bulog", "sawah", "lahan",
    "irigasi", "benih", "hama", "ekonomi", "inflasi", "sembako", "sayur", "tebu",
)


def today_label_id() -> str:
    now = datetime.now(WIB)
    return f"{now.day} {MONTH_SHORT_ID[now.month]} {now.year}"


def _format_thousands(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def _is_valid_direct_url(url: str) -> bool:
    return (
        (url.startswith("https://") or url.startswith("http://"))
        and "news.google.com/rss/articles/" not in url
        and " " not in url
    )


def _strip_html(raw: str) -> str:
    decoded = html.unescape(raw)
    cleaned = re.sub(r"<[^>]+>", " ", decoded)
    return " ".join(cleaned.split())


def _extract_tag(block: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", block, flags=re.DOTALL | re.IGNORECASE)
    if not m:
        return ""
    val = m.group(1).strip()
    if val.startswith("<![CDATA[") and val.endswith("]]>"):
        val = val[9:-3]
    return html.unescape(val.strip())


def _format_pub_date(raw: str) -> tuple[str, str]:
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(WIB)
        now = datetime.now(WIB)
        diff = now - local
        mins = int(diff.total_seconds() // 60)
        if mins < 60:
            time_ago = f"{max(1, mins)} menit lalu"
        elif mins < 1440:
            time_ago = f"{mins // 60} jam lalu"
        else:
            time_ago = f"{mins // 1440} hari lalu"
        label = f"{local.day} {MONTH_SHORT_ID[local.month]} {local.year}"
        return label, time_ago
    except Exception:
        return today_label_id(), "Hari ini"


def _classify_category(title: str, summary: str) -> str:
    combined = f"{title} {summary}".lower()
    if any(k in combined for k in ("cuaca", "hujan", "bmkg", "bpbd", "kemarau", "iklim", "angin", "banjir")):
        return "Cuaca & Iklim"
    if any(k in combined for k in ("hama", "penyakit", "benih", "varietas", "budidaya", "opt", "produktivitas")):
        return "Hama & Budidaya"
    if any(k in combined for k in ("subsidi", "kementan", "bapanas", "pemerintah", "kebijakan", "kuota", "bulog", "mentan", "hpp")):
        return "Kebijakan & Subsidi"
    return "Harga & Pasar"


def _parse_rss(xml: str, source_name: str, filter_keywords: bool, max_items: int = 5) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for m in re.finditer(r"<item>(.*?)</item>", xml, flags=re.DOTALL | re.IGNORECASE):
        block = m.group(1)
        title = _extract_tag(block, "title")
        link = _extract_tag(block, "link")
        if not title or not _is_valid_direct_url(link):
            continue

        raw_desc = _extract_tag(block, "description")
        clean_desc = _strip_html(raw_desc).replace("[…]", "…").replace("[...]", "…")
        if filter_keywords:
            combined = f"{title} {clean_desc}".lower()
            if not any(k in combined for k in AGRI_KEYWORDS):
                continue

        pub_date, time_ago = _format_pub_date(_extract_tag(block, "pubDate"))
        if not clean_desc:
            summary = f"Berita terbaru dari {source_name} seputar perkembangan komoditas dan kondisi lapangan."
        elif len(clean_desc) > 200:
            summary = clean_desc[:200].rstrip() + "…"
        else:
            summary = clean_desc

        items.append(
            {
                "title": title,
                "link": link,
                "url": link,
                "source": source_name,
                "pub_date": pub_date,
                "published_label": f"{pub_date} ({time_ago})",
                "date": pub_date,
                "time_ago": time_ago,
                "category": _classify_category(title, summary),
                "summary": summary,
            }
        )
        if len(items) >= max_items:
            break
    return items


async def _fetch_all_rss() -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    try:
        async with httpx.AsyncClient(
            timeout=4.5,
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) MongsoAgriPlan/2.0"},
        ) as client:
            for name, url, filter_kw in RSS_SOURCES:
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        for item in _parse_rss(resp.text, name, filter_kw, 5):
                            if item["url"] not in seen_urls and item["title"] not in seen_titles:
                                seen_urls.add(item["url"])
                                seen_titles.add(item["title"])
                                all_items.append(item)
                except Exception:
                    continue
    except Exception:
        return []
    return all_items


def get_news_feed_fallback(limit: int) -> dict[str, Any]:
    today = today_label_id()
    items = [
        {
            "title": "Pemerintah Tak Melarang Petani Menjual Komoditas Pangan di Atas HPP",
            "link": "https://www.agrofarm.co.id/2026/11/pemerintah-tak-melarang-petani-jagung-menjual-di-atas-hpp/",
            "url": "https://www.agrofarm.co.id/2026/11/pemerintah-tak-melarang-petani-jagung-menjual-di-atas-hpp/",
            "source": "Agrofarm Pangan",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Kebijakan & Subsidi",
            "summary": "Badan Pangan Nasional (Bapanas) memastikan patokan HPP merupakan batas minimal perlindungan harga di tingkat petani.",
        },
        {
            "title": "BPBD Jawa Timur Imbau Kewaspadaan Cuaca Ekstrem dan Angin Kencang di Sentra Tani",
            "link": "https://jatim.antaranews.com/berita/1120099/bpbd-madiun-tangani-kerusakan-rumah-terdampak-angin-kencang",
            "url": "https://jatim.antaranews.com/berita/1120099/bpbd-madiun-tangani-kerusakan-rumah-terdampak-angin-kencang",
            "source": "ANTARA Jawa Timur",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Cuaca & Iklim",
            "summary": "Mitigasi dampak hujan deras disertai angin kencang di wilayah Jawa Timur guna menjaga ketahanan lahan dan infrastruktur warga.",
        },
        {
            "title": "Berita Agribisnis & Hortikultura Terkini Indonesia",
            "link": "https://www.agrofarm.co.id/category/hortikultura/",
            "url": "https://www.agrofarm.co.id/category/hortikultura/",
            "source": "Agrofarm Hortikultura",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Hama & Budidaya",
            "summary": "Kumpulan laporan lapangan budidaya cabai, bawang merah, pengendalian OPT, dan inovasi teknologi pertanian.",
        },
        {
            "title": "Pantauan Ekonomi & Distribusi Pangan Jawa Timur",
            "link": "https://jatim.antaranews.com/kanal/ekonomi",
            "url": "https://jatim.antaranews.com/kanal/ekonomi",
            "source": "ANTARA Jawa Timur",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Harga & Pasar",
            "summary": "Update harian pergerakan harga pangan, pasokan pasar induk, dan kebijakan ekonomi daerah di Jawa Timur.",
        },
        {
            "title": "Kabar Pangan Nasional & Stabilisasi Pasokan Komoditas",
            "link": "https://www.agrofarm.co.id/category/pangan/",
            "url": "https://www.agrofarm.co.id/category/pangan/",
            "source": "Agrofarm Pangan",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Harga & Pasar",
            "summary": "Informasi ketersediaan stok pangan strategis, distribusi antarwilayah, dan serapan hasil panen petani.",
        },
        {
            "title": "Prakiraan Cuaca Resmi BMKG Wilayah Jawa Timur",
            "link": "https://www.bmkg.go.id/cuaca/prakiraan-cuaca.bmkg",
            "url": "https://www.bmkg.go.id/cuaca/prakiraan-cuaca.bmkg",
            "source": "BMKG Pusat",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Cuaca & Iklim",
            "summary": "Pantauan citra satelit, prakiraan hujan harian, dan peringatan dini cuaca ekstrem dari Badan Meteorologi, Klimatologi, dan Geofisika.",
        },
    ]
    return {
        "items": items[:limit],
        "configured_sources": len(RSS_SOURCES),
        "total_sources": len(RSS_SOURCES),
    }


async def get_news_feed_async(limit: int = 6) -> dict[str, Any]:
    global _news_cache
    now_mono = time.monotonic()
    if _news_cache is not None:
        fetched_at, cached_items = _news_cache
        if (now_mono - fetched_at) < CACHE_TTL_SECS and cached_items:
            return {
                "items": cached_items[:limit],
                "configured_sources": len(RSS_SOURCES),
                "total_sources": len(RSS_SOURCES),
            }

    live_items = await _fetch_all_rss()
    if live_items:
        _news_cache = (now_mono, live_items)
        return {
            "items": live_items[:limit],
            "configured_sources": len(RSS_SOURCES),
            "total_sources": len(RSS_SOURCES),
        }

    return get_news_feed_fallback(limit)


def build_field_advisories(
    regency: str,
    commodity_name: str,
    price_rp: int,
    weekly_change_pct: float,
    rainfall_mm: float,
    risk_score: int,
) -> list[dict[str, Any]]:
    today = today_label_id()
    arah_harga = (
        f"naik +{weekly_change_pct:.1f}%"
        if weekly_change_pct >= 0.0
        else f"turun {weekly_change_pct:.1f}%"
    )
    price_fmt = _format_thousands(price_rp)

    return [
        {
            "title": f"Pantauan Harga {commodity_name} di {regency}: Rp {price_fmt}/kg ({arah_harga})",
            "link": "/pasar.html",
            "url": "/pasar.html",
            "source": "Bursa Pasar MONGSO",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Lapangan",
            "summary": f"Referensi harga rata-rata {commodity_name} di wilayah {regency} tercatat Rp {price_fmt}/kg dengan perubahan mingguan {arah_harga}.",
            "action_advice": "Cek selisih harga antar-kabupaten di Bursa Pasar sebelum melepas panen ke pengepul.",
        },
        {
            "title": f"Pantauan Cuaca Kebun {regency}: Hujan Seminggu {rainfall_mm:.1f} mm",
            "link": "/cuaca.html",
            "url": "/cuaca.html",
            "source": "Cuaca MONGSO & BMKG",
            "pub_date": today,
            "published_label": today,
            "date": today,
            "time_ago": "Hari ini",
            "category": "Lapangan",
            "summary": f"Curah hujan 7 hari di {regency} sekitar {rainfall_mm:.1f} mm dengan perkiraan risiko lapangan {risk_score}%.",
            "action_advice": (
                "Bersihkan parit bedengan agar air tidak menggenang dan tunda nyemprot saat mendung gelap."
                if rainfall_mm > 120.0
                else "Gunakan waktu pagi pukul 06.00-09.00 WIB untuk nyemprot obat atau pupuk daun."
            ),
        },
    ]
