from copy import deepcopy
from datetime import date, datetime, timezone
from typing import Any

ALL_SEASONS: list[dict[str, Any]] = [
    {
        "mangsa_number": 1,
        "mangsa_name": "Kasa",
        "javanese_alias": "Kartika",
        "duration_days": 41,
        "start_date": "22 Juni",
        "end_date": "01 Agustus",
        "candrasangkala_meaning": "Sesotya Murca Ing Embanan",
        "characteristic": "Godhong-godhong padha rontok, hawa panas, lemah garing nela.",
        "agronomic_guidance": "Musim kemarau awal. Cocok untuk pengolahan tanah palawija (kedelai, jagung) dan pembersihan lahan.",
        "suitable_crops": ["Jagung", "Kedelai", "Kacang Tanah"],
        "pest_watch": "Waspadai hama belalang dan uret tanah pada persemaian kering.",
        "is_active": False,
    },
    {
        "mangsa_number": 2,
        "mangsa_name": "Karo",
        "javanese_alias": "Puso",
        "duration_days": 23,
        "start_date": "02 Agustus",
        "end_date": "24 Agustus",
        "candrasangkala_meaning": "Bantala Rengka",
        "characteristic": "Lemah nela-nela (pecah-pecah), wit randhu lan pelem wiwit semi/ngembang.",
        "agronomic_guidance": "Puncak kekeringan tanah. Tanam palawija kedua dengan irigasi tetes atau sumur bor.",
        "suitable_crops": ["Kacang Hijau", "Bawang Merah (Irigasi Pompa)"],
        "pest_watch": "Waspada kutu kebul dan thrips yang berkembang biak pesat di hawa kering terik.",
        "is_active": False,
    },
    {
        "mangsa_number": 3,
        "mangsa_name": "Katelu",
        "javanese_alias": "Manggasri",
        "duration_days": 24,
        "start_date": "25 Agustus",
        "end_date": "17 September",
        "candrasangkala_meaning": "Suta Manut Ing Bapa",
        "characteristic": "Sumur wiwit asat, wit gadhung wiwit mrambat, palawija wiwit dipanen.",
        "agronomic_guidance": "Panen palawija dan persiapan lahan persemaian menjelang mangsa labuh.",
        "suitable_crops": ["Ubi Jalar", "Singkong", "Semangka"],
        "pest_watch": "Tikus sawah mulai mencari sumber air dan tanaman muda.",
        "is_active": False,
    },
    {
        "mangsa_number": 4,
        "mangsa_name": "Kapat",
        "javanese_alias": "Sitra",
        "duration_days": 25,
        "start_date": "18 September",
        "end_date": "12 Oktober",
        "candrasangkala_meaning": "Waspa Kumembeng Ing Netra",
        "characteristic": "Sumber banyu asat, wit randhu wiwit pentil, hawa sumuk panas banter.",
        "agronomic_guidance": "Masa transisi (labuh). Persiapan benih dan sanitasi saluran drainase sebelum hujan turun.",
        "suitable_crops": ["Cabai Rawit (Semai)", "Tomat (Semai)"],
        "pest_watch": "Perangkap lalat buah dan serangga vektor mulai dipasang pada fase persemaian.",
        "is_active": False,
    },
    {
        "mangsa_number": 5,
        "mangsa_name": "Kalima",
        "javanese_alias": "Manggala",
        "duration_days": 27,
        "start_date": "13 Oktober",
        "end_date": "08 November",
        "candrasangkala_meaning": "Pancuran Mas Sumawur Ing Jagat",
        "characteristic": "Wiwit ana grimis/udan rintik, wit asem wiwit thukul pupus anyar, uler wiwit ngendhog.",
        "agronomic_guidance": "Musim hujan awal (labuh). Pindah tanam cabai dan sayuran ke bedengan yang sudah diberi pupuk dasar.",
        "suitable_crops": ["Cabai Rawit", "Bawang Merah", "Jagung Hibrida"],
        "pest_watch": "Munculnya ulat daun muda dan orong-orong pada tanaman pindah tanam baru.",
        "is_active": False,
    },
    {
        "mangsa_number": 6,
        "mangsa_name": "Kanem",
        "javanese_alias": "Naya",
        "duration_days": 43,
        "start_date": "09 November",
        "end_date": "21 Desember",
        "candrasangkala_meaning": "Rasa Mulya Kasucian",
        "characteristic": "Udan ngreceh saben dina, banyu kali wiwit luber, petani wiwit ngolah sawah.",
        "agronomic_guidance": "Musim hujan merata. Sangat baik untuk pembesaran vegetatif sayuran hortikultura dataran rendah/menengah. Pastikan parit drainase dalam.",
        "suitable_crops": ["Cabai Rawit", "Bawang Merah", "Padi Sawah", "Tomat"],
        "pest_watch": "Waspada penyakit jamur fusarium, antraknosa (patek), dan siput murbei.",
        "is_active": False,
    },
    {
        "mangsa_number": 7,
        "mangsa_name": "Kapitu",
        "javanese_alias": "Palguna",
        "duration_days": 43,
        "start_date": "22 Desember",
        "end_date": "02 Februari",
        "candrasangkala_meaning": "Wisa Kentir Ing Maruta",
        "characteristic": "Puncak mangsa rendheng, udan deres barat lesus, banyu luber ing ngendi-endi.",
        "agronomic_guidance": "Waspada genangan air tinggi. Perkuat bedengan, perbanyak pupuk Kalium & Kalsium untuk daya tahan tanaman.",
        "suitable_crops": ["Padi Sawah", "Kangkung Air", "Talas"],
        "pest_watch": "Serangan busuk daun (phytophthora) dan hawar pelepah padi sangat agresif.",
        "is_active": False,
    },
    {
        "mangsa_number": 8,
        "mangsa_name": "Kawolu",
        "javanese_alias": "Wisaka",
        "duration_days": 27,
        "start_date": "03 Februari",
        "end_date": "28 Februari",
        "candrasangkala_meaning": "Anjrah Jroning Kayun",
        "characteristic": "Udan wiwit suda, pari wiwit mblegodhawa/metu malai, kucing padha gandheng.",
        "agronomic_guidance": "Fase generatif tanaman pangan dan hortikultura. Waspadai serangan walang sangit pada malai padi.",
        "suitable_crops": ["Padi Generatif", "Kubis", "Kentang"],
        "pest_watch": "Walang sangit, wereng batang cokelat, dan ulat penggerek batang.",
        "is_active": False,
    },
    {
        "mangsa_number": 9,
        "mangsa_name": "Kasanga",
        "javanese_alias": "Jitha",
        "duration_days": 25,
        "start_date": "01 Maret",
        "end_date": "25 Maret",
        "candrasangkala_meaning": "Wedaring Wacana Mulya",
        "characteristic": "Pari wiwit kuning, tonggeret/garengpung wiwit muni, hawa wiwit sumuk.",
        "agronomic_guidance": "Menjelang panen raya rendeng. Kurangi penyiraman, siapkan lantai jemur dan lumbung simpan.",
        "suitable_crops": ["Padi Menguning", "Kacang Panjang", "Mentimun"],
        "pest_watch": "Burung pipit pemakan bulir padi dan tikus sawah.",
        "is_active": False,
    },
    {
        "mangsa_number": 10,
        "mangsa_name": "Kasadasa",
        "javanese_alias": "Srawana",
        "duration_days": 24,
        "start_date": "26 Maret",
        "end_date": "18 April",
        "candrasangkala_meaning": "Gedhong Mineb Jroning Kalbu",
        "characteristic": "Panen raya pari, banyu kali wiwit surut, manuk-manuk padha gawe susu.",
        "agronomic_guidance": "Musim panen raya (mareng). Pengeringan gabah optimal dengan sinar matahari terik.",
        "suitable_crops": ["Palawija Setelah Padi", "Bawang Merah", "Semangka"],
        "pest_watch": "Kutu daun dan ulat grayak pada tanaman palawija pasca-padi.",
        "is_active": False,
    },
    {
        "mangsa_number": 11,
        "mangsa_name": "Desta",
        "javanese_alias": "Padrawana",
        "duration_days": 23,
        "start_date": "19 April",
        "end_date": "11 Mei",
        "candrasangkala_meaning": "Tirta Syah Saking Sasana",
        "characteristic": "Manuk-manuk padha ngloloh anake, hawa wiwit adhem nyenyet ing wayah wengi.",
        "agronomic_guidance": "Awal musim kemarau. Tanam palawija dan hortikultura yang efisien air (bawang merah, cabai).",
        "suitable_crops": ["Bawang Merah", "Cabai Merah Besar", "Kedelai"],
        "pest_watch": "Ulat grayak Spodoptera exigua pada pertanaman bawang merah muda.",
        "is_active": False,
    },
    {
        "mangsa_number": 12,
        "mangsa_name": "Saddha",
        "javanese_alias": "Asuji",
        "duration_days": 41,
        "start_date": "12 Mei",
        "end_date": "21 Juni",
        "candrasangkala_meaning": "Tirta Wening",
        "characteristic": "Hawa bediding (adhem banget wayah subuh), lemah wiwit garing, embun es ing dataran tinggi.",
        "agronomic_guidance": "Musim dingin bediding dataran tinggi (Bromo, Batu). Lindungi tanaman kentang dari embun upas (frost).",
        "suitable_crops": ["Kentang Dataran Tinggi", "Wortel", "Kubis"],
        "pest_watch": "Embun upas (frost damage) dan nematoda bintil akar pada umbi kentang.",
        "is_active": False,
    },
]


def _mangsa_number_for_date(d: date) -> int:
    m, day = d.month, d.day
    if (m == 6 and day >= 22) or m == 7 or (m == 8 and day == 1):
        return 1
    if m == 8 and day <= 24:
        return 2
    if m == 8 or (m == 9 and day <= 17):
        return 3
    if m == 9 or (m == 10 and day <= 12):
        return 4
    if m == 10 or (m == 11 and day <= 8):
        return 5
    if m == 11 or (m == 12 and day <= 21):
        return 6
    if m == 12 or m == 1 or (m == 2 and day <= 2):
        return 7
    if m == 2:
        return 8
    if m == 3 and day <= 25:
        return 9
    if m == 3 or (m == 4 and day <= 18):
        return 10
    if m == 4 or (m == 5 and day <= 11):
        return 11
    if m == 5 or (m == 6 and day <= 21):
        return 12
    return 6


def calculate_current_season(target_date: date | None = None) -> dict[str, Any]:
    d = target_date or datetime.now(timezone.utc).date()
    num = _mangsa_number_for_date(d)
    for season in deepcopy(ALL_SEASONS):
        if season["mangsa_number"] == num:
            season["is_active"] = True
            return season
    fallback = deepcopy(ALL_SEASONS[5])
    fallback["is_active"] = True
    return fallback


def get_seasons_overview(target_date: date | None = None) -> dict[str, Any]:
    current = calculate_current_season(target_date)
    all_items = deepcopy(ALL_SEASONS)
    for item in all_items:
        item["is_active"] = item["mangsa_number"] == current["mangsa_number"]
    return {
        "current_season": current,
        "all_seasons": all_items,
    }
