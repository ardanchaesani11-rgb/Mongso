from typing import Any
import asyncpg

DAFTAR_PASAR_INDUK_JATIM = [
    {
        "id": "surabaya_keputran",
        "name": "Pasar Induk Keputran & PIOS",
        "city": "Kota Surabaya",
        "regency_match": "Kota Surabaya",
        "commodities": [1, 2, 3, 4, 5, 6],
        "role": "Pasar Induk Grosir Metropolitan & Konsumsi Terbesar Jatim",
        "facilities": "Bongkar muat 24 jam non-stop, sirkulasi pedagang antar-provinsi, akses Tol Surabaya-Gresik",
        "contact_info": "UPTD Pasar Surya Surabaya (031-5678910) / Paguyuban Pedagang Sayur Jatim",
        "estimated_freight_per_kg": 1200,
    },
    {
        "id": "sidoarjo_puspa_agro",
        "name": "Pusat Distribusi Regional Puspa Agro",
        "city": "Kab. Sidoarjo",
        "regency_match": "Kab. Sidoarjo",
        "commodities": [1, 2, 3, 4, 5, 6],
        "role": "Hub Agribisnis Terpadu BUMD Pemprov Jawa Timur",
        "facilities": "Gudang Cold Storage berpendingin kapasitas 5.000 ton, fasilitas grading, sortir & kemasan ekspor",
        "contact_info": "PT Puspa Agro Jatim (Pemprov Jatim) — CS Agribisnis: (031) 7878888",
        "estimated_freight_per_kg": 1100,
    },
    {
        "id": "malang_gadang",
        "name": "Pasar Induk Gadang",
        "city": "Kota Malang",
        "regency_match": "Kab. Malang",
        "commodities": [1, 3, 4, 5, 6],
        "role": "Sentra Penampung Sayur Dataran Tinggi Malang Raya",
        "facilities": "Terminal bongkar muat sayur dataran tinggi Malang Raya, Blitar, & Pesisir Selatan",
        "contact_info": "Paguyuban Pedagang Grosir Sayur Pasar Gadang Malang",
        "estimated_freight_per_kg": 900,
    },
    {
        "id": "kediri_ngronggo",
        "name": "Pasar Grosir Ngronggo",
        "city": "Kota Kediri",
        "regency_match": "Kab. Kediri",
        "commodities": [1, 3, 4],
        "role": "Pusat Lelang & Barometer Harga Cabai Jawa Timur",
        "facilities": "Bursa lelang harian cabai rawit & merah, timbangan digital grosir, transit truk antar-pulau",
        "contact_info": "Asosiasi Agribisnis Cabai Indonesia (AACI) Wilayah Jawa Timur (0812-3456-7890)",
        "estimated_freight_per_kg": 750,
    },
    {
        "id": "nganjuk_sukomoro",
        "name": "Pasar Bawang Sukomoro",
        "city": "Kab. Nganjuk",
        "regency_match": "Kab. Nganjuk",
        "commodities": [2],
        "role": "Sentra Grosir Bawang Merah Terbesar Indonesia Timur",
        "facilities": "Gudang penyimpanan sistem instorase (ventilasi sirkulasi), timbangan armada truk, lelang harian",
        "contact_info": "Koperasi Petani Bawang Merah Sukomoro Nganjuk (0358-321456)",
        "estimated_freight_per_kg": 800,
    },
    {
        "id": "banyuwangi_rogojampi",
        "name": "Pasar Induk Rogojampi & Banyuwangi",
        "city": "Kab. Banyuwangi",
        "regency_match": "Kab. Banyuwangi",
        "commodities": [1, 2, 4],
        "role": "Hub Distribusi Ujung Timur Jatim & Gerbang Bali",
        "facilities": "Akses penyeberangan Ketapang-Gilimanuk, hub pasokan hotel/restoran Bali & Lombok",
        "contact_info": "Dinas Pertanian & Ketahanan Pangan Kab. Banyuwangi (0333-421745)",
        "estimated_freight_per_kg": 1300,
    },
]


def get_commodity_icon(cid: int) -> str:
    return {
        1: "🌶️",
        2: "🧅",
        3: "🌶️",
        4: "🍅",
        5: "🥔",
        6: "🥬",
    }.get(cid, "🌱")


def get_dominant_commodity(regency: str) -> int:
    return {
        "Kab. Kediri": 1,
        "Kab. Malang": 2,
        "Kab. Nganjuk": 2,
        "Kab. Banyuwangi": 1,
        "Kota Batu": 5,
        "Kota Surabaya": 1,
    }.get(regency, 1)


def hitung_status_risiko(
    rasio_persen: float,
    hujan_mm: float,
    batas_hujan_mm: float,
) -> tuple[int, str, str]:
    penalti_cuaca = 8 if hujan_mm > batas_hujan_mm else 0
    skor_raw = int(round((rasio_persen * 0.56) + penalti_cuaca))
    skor_risiko = max(0, min(100, skor_raw))

    if skor_risiko >= 70:
        return skor_risiko, "RISIKO OVERSUPPLY TINGGI", "Risiko Tinggi"
    if skor_risiko >= 50:
        return skor_risiko, "WASPADA PASOKAN", "Waspada"
    return skor_risiko, "AMAN / DIREKOMENDASIKAN", "Aman"


async def hitung_radar_pasar_alternatif(
    commodity_id: int,
    regency_asal: str,
    pool: asyncpg.Pool,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        kom = await conn.fetchrow(
            "SELECT * FROM commodities WHERE id = $1",
            commodity_id,
        )
        harga_jatim_avg = int(kom["jatim_avg_price"]) if kom else 45000
        commodity_name = kom["name"] if kom else "Komoditas"

        harga_asal = await conn.fetchval(
            "SELECT price_per_kg FROM market_prices WHERE regency_name = $1 AND commodity_id = $2 ORDER BY id DESC LIMIT 1",
            regency_asal,
            commodity_id,
        )
        harga_asal = int(harga_asal) if harga_asal is not None else harga_jatim_avg

        radar_list: list[dict[str, Any]] = []
        for hub in DAFTAR_PASAR_INDUK_JATIM:
            if commodity_id not in hub["commodities"]:
                continue

            is_same_regency = (
                hub["regency_match"] == regency_asal or hub["city"] == regency_asal
            )
            harga_tujuan = await conn.fetchval(
                "SELECT price_per_kg FROM market_prices WHERE regency_name = $1 AND commodity_id = $2 ORDER BY id DESC LIMIT 1",
                hub["regency_match"],
                commodity_id,
            )
            harga_tujuan = int(harga_tujuan) if harga_tujuan is not None else harga_jatim_avg

            selisih_rp = harga_tujuan - harga_asal
            ongkos_kirim = 250 if is_same_regency else hub["estimated_freight_per_kg"]
            margin_bersih_rp = selisih_rp - ongkos_kirim

            if margin_bersih_rp >= 3000:
                rekomendasi_badge = "Sangat Disarankan Kirim"
                badge_type = "badge-success"
                status_note = (
                    f"Disparitas harga tinggi (+Rp {selisih_rp}/kg). "
                    "Sangat menguntungkan untuk penyelamatan panen raya."
                )
            elif margin_bersih_rp > 0:
                rekomendasi_badge = "Alternatif Pasokan"
                badge_type = "badge-warning"
                status_note = (
                    f"Ada margin bersih +Rp {margin_bersih_rp}/kg setelah dipotong ongkos angkut."
                )
            elif is_same_regency:
                rekomendasi_badge = "Pasar Lokal Terdekat"
                badge_type = "badge-info"
                status_note = (
                    "Pasar sentra utama di wilayah Anda sendiri. Tanpa biaya ekspedisi antar-kabupaten."
                )
            else:
                rekomendasi_badge = "Lebih Efisien Jual Lokal"
                badge_type = "badge-secondary"
                status_note = (
                    "Harga pasar tujuan belum menutup biaya angkut truk dari wilayah Anda."
                )

            radar_list.append(
                {
                    "hub_id": hub["id"],
                    "market_name": hub["name"],
                    "city": hub["city"],
                    "role": hub["role"],
                    "facilities": hub["facilities"],
                    "contact_info": hub["contact_info"],
                    "destination_price_rp": harga_tujuan,
                    "origin_price_rp": harga_asal,
                    "price_diff_rp": selisih_rp,
                    "freight_cost_per_kg": ongkos_kirim,
                    "net_margin_per_kg": margin_bersih_rp,
                    "potential_gain_per_ton": margin_bersih_rp * 1000,
                    "recommendation_badge": rekomendasi_badge,
                    "badge_type": badge_type,
                    "status_note": status_note,
                    "is_same_regency": is_same_regency,
                }
            )

    radar_list.sort(key=lambda x: x["net_margin_per_kg"], reverse=True)
    return {
        "origin_regency": regency_asal,
        "commodity_name": commodity_name,
        "origin_price_rp": harga_asal,
        "markets": radar_list,
        "hubs": list(radar_list),
    }


def analisis_rekomendasi_hama(
    commodity_id: int,
    curah_hujan_mm: float,
    _harvest_duration_days: int = 90,
) -> dict[str, Any]:
    if commodity_id in (1, 3):
        if curah_hujan_mm >= 120.0:
            return {
                "risk_level": "TINGGI",
                "risk_badge": "Bahaya Hujan Ekstrem",
                "risk_color": "#C93B2B",
                "primary_threat": "Antraknosa / Patek (Colletotrichum) & Lalat Buah",
                "trigger_weather": f"Curah hujan tinggi ({curah_hujan_mm} mm/minggu) memicu kelembapan tinggi & spora jamur ganas.",
                "critical_phase": "HST 45–75 (Fase Pembungaan & Pembentukan Buah)",
                "symptoms": "Bercak melingkar cokelat kehitaman melekuk pada buah cabai, buah cepat membusuk dan rontok massal.",
                "action_steps": [
                    "Tinggikan bedengan hingga 35–40 cm dan bersihkan parit drainase agar air tidak menggenangi perakaran.",
                    "Stop pemberian pupuk Nitrogen tinggi (Urea); perbanyak Kalium Nitrat & Kalsium untuk mempertebal dinding sel buah.",
                    "Semprot fungisida tembaga hidroksida / mankozeb bergantian bahan aktif azoksistrobin sesaat setelah hujan reda di sore hari.",
                    "Pasang perangkap lekat kuning (Yellow Sticky Trap) dan atraktan metil eugenol untuk membasmi lalat buah.",
                ],
                "biological_solution": "Aplikasi agens hayati suspensi jamur antagonis Trichoderma harzianum pada pangkal batang sejak olah tanah.",
                "chemical_solution": "Fungisida Mankozeb 80% + Kalsium cair 2 ml/liter air disemprotkan rutin setiap 4 hari pada cuaca basah.",
            }
        return {
            "risk_level": "SEDANG",
            "risk_badge": "Waspada Kutu Kebul",
            "risk_color": "#D99B26",
            "primary_threat": "Thrips & Kutu Kebul (Vektor Virus Kuning / Gemini)",
            "trigger_weather": f"Cuaca cerah/panas ({curah_hujan_mm} mm/minggu) mempercepat siklus hama pengisap daun.",
            "critical_phase": "HST 15–40 (Fase Vegetatif & Pertumbuhan Daun Muda)",
            "symptoms": "Daun keriting menggulung ke atas, pucuk kerdil, dan daun belang kekuningan terserang virus.",
            "action_steps": [
                "Pasang mulsa perak memantulkan sinar UV untuk mengusir serangga vektor kutu daun.",
                "Rutin bersihkan gulma di parit yang menjadi inang alternatif hama pengisap daun.",
                "Semprot insektisida abamektin berselang imidakloprid pada pagi hari sebelum kutu aktif terbang.",
            ],
            "biological_solution": "Penyemprotan bioinsektisida ekstrak daun mimba dan jamur Beauveria bassiana.",
            "chemical_solution": "Insektisida Abamektin 18 g/l dikombinasikan dengan Perekat Perata.",
        }

    if commodity_id == 2:
        if curah_hujan_mm >= 90.0:
            return {
                "risk_level": "TINGGI",
                "risk_badge": "Bahaya Moler & Trotol",
                "risk_color": "#C93B2B",
                "primary_threat": "Layu Fusarium (Moler / Inul) & Bercak Ungu (Trotol)",
                "trigger_weather": f"Kelembapan tanah tinggi ({curah_hujan_mm} mm/minggu) memicu busuk umbi dan layu jamur.",
                "critical_phase": "HST 20–45 (Fase Pertumbuhan Daun & Pembesaran Umbi)",
                "symptoms": "Daun meliuk-liuk seperti layu terpilin, pangkal umbi membusuk basah kecokelatan, daun bertotol ungu.",
                "action_steps": [
                    "Aplikasi kapur pertanian (Dolomit) 1,5–2 ton/Ha agar pH tanah netral di kisaran 6,5–7,0.",
                    "Pendalaman saluran got keliling bedengan sedalam 50–60 cm agar perakaran bawang tidak jenuh air.",
                    "Gunakan benih umbi bersertifikat bebas penyakit yang telah disimpan minimal 60 hari.",
                    "Semprot fungisida sistemik berbahan aktif difenokonazol dan klorotalonil secara berselang.",
                ],
                "biological_solution": "Perendaman bibit umbi dalam larutan biofungisida Trichoderma sp. sebelum tanam.",
                "chemical_solution": "Kombinasi Fungisida Difenokonazol 250 EC + Perekat Perata non-ionik.",
            }
        return {
            "risk_level": "SEDANG",
            "risk_badge": "Waspada Ulat Grayak",
            "risk_color": "#D99B26",
            "primary_threat": "Ulat Grayak Bawang (Spodoptera exigua)",
            "trigger_weather": f"Kondisi kering ({curah_hujan_mm} mm/minggu) sangat disukai ngengat ulat grayak untuk bertelur.",
            "critical_phase": "HST 15–35 (Fase Vegetatif Aktif)",
            "symptoms": "Daun bawang terlihat transparan menerawang karena bagian dalam daun dimakan ulat dari dalam rongga daun.",
            "action_steps": [
                "Pasang perangkap lampu (Light Trap) bertenaga surya di malam hari di tepi petakan sawah.",
                "Pasang feromon atraktan (Feromonas Spodoptera) untuk memikat dan mematikan ngengat jantan.",
                "Kutip kelompok telur ulat yang berwarna keputihan seperti kapas di ujung daun pada pagi hari.",
                "Semprot insektisida berbahan aktif emamektin benzoat atau klorantraniliprol pada senja hari.",
            ],
            "biological_solution": "Aplikasi bioinsektisida virus SeNPV (Spodoptera exigua Nuclear Polyhedrosis Virus).",
            "chemical_solution": "Insektisida Emamektin Benzoat 5% disemprotkan saat ulat keluar di malam hari.",
        }

    if commodity_id == 4:
        is_high = curah_hujan_mm >= 110.0
        return {
            "risk_level": "TINGGI" if is_high else "SEDANG",
            "risk_badge": "Bahaya Busuk Daun" if is_high else "Waspada Layu Bakteri",
            "risk_color": "#C93B2B" if is_high else "#D99B26",
            "primary_threat": "Hawar Daun (Phytophthora infestans) & Layu Bakteri",
            "trigger_weather": f"Curah hujan {curah_hujan_mm} mm/minggu. Kelembapan tinggi memicu busuk basah daun & batang.",
            "critical_phase": "HST 30–60 (Fase Pembungaan & Pembesaran Buah)",
            "symptoms": "Bercak basah kehitaman berminyak pada tepi daun menyebar ke batang dan buah hingga membusuk.",
            "action_steps": [
                "Lakukan perempelan / pemangkasan tunas air bawah agar sirkulasi udara di bawah tajuk lancar.",
                "Hindari penyiraman atau percikan air langsung mengenai daun tanaman saat sore hari.",
                "Ikat batang tanaman pada ajir bambu secara tegak agar daun tidak menyentuh tanah.",
                "Semprot fungisida simoksanil atau dimetomorf bergantian dengan mankozeb.",
            ],
            "biological_solution": "Semprot bakteri Bacillus subtilis pada permukaan daun untuk menekan patogen jamur.",
            "chemical_solution": "Fungisida Simoksanil + Mankozeb disemprotkan dengan volume semprot tinggi.",
        }

    if commodity_id == 5:
        is_high = curah_hujan_mm >= 120.0
        return {
            "risk_level": "TINGGI" if is_high else "SEDANG",
            "risk_badge": "Hawar Daun Late Blight",
            "risk_color": "#C93B2B" if is_high else "#D99B26",
            "primary_threat": "Busuk Daun / Hawar Kentang (Phytophthora infestans)",
            "trigger_weather": f"Suhu dingin pegunungan disertai hujan {curah_hujan_mm} mm/minggu.",
            "critical_phase": "HST 40–80 (Fase Pembentukan & Pengisian Umbi)",
            "symptoms": "Bercak nekrotik cokelat pada daun dikelilingi halo kekuningan, umbi membusuk kering berwarna cokelat kemerahan.",
            "action_steps": [
                "Gunakan bibit umbi G2 bersertifikat bebas virus dan bakteri.",
                "Lakukan pembumbunan tanah bedengan secara teratur agar umbi tidak terpapar sinar matahari dan spora jamur.",
                "Aplikasi fungisida kontak dan sistemik preventif sebelum gejala meluas ke petakan lain.",
                "Sanitasi sisa tanaman yang terinfeksi ke luar area pertanaman dan musnahkan.",
            ],
            "biological_solution": "Penggunaan varietas tahan dan pengocoran agen hayati Trichoderma pada lubang tanam.",
            "chemical_solution": "Fungisida Propineb 70% dikombinasikan dengan Metalaksil.",
        }

    return {
        "risk_level": "SEDANG",
        "risk_badge": "Waspada Busuk Hitam",
        "risk_color": "#D99B26",
        "primary_threat": "Busuk Hitam (Xanthomonas) & Ulat Krop (Plutella)",
        "trigger_weather": f"Curah hujan {curah_hujan_mm} mm/minggu.",
        "critical_phase": "HST 30–65 (Fase Pembentukan Krop Daun)",
        "symptoms": "Bercak berbentuk huruf V berwarna kuning kecokelatan di tepi daun, urat daun menghitam, krop berulat.",
        "action_steps": [
            "Perlakuan perendaman benih dengan air hangat (50°C) selama 20 menit sebelum semai.",
            "Pembersihan gulma famili Brassicaceae di pematang sawah yang menjadi inang alternatif.",
            "Aplikasi insektisida biologi Bacillus thuringiensis (Bt) untuk mengendalikan ulat pemakan krop.",
            "Pencegahan bakteri dengan bakterisida tembaga oksiklorida atau kasugamisin.",
        ],
        "biological_solution": "Aplikasi bioinsektisida Bacillus thuringiensis (Bt) 2 gram/liter air.",
        "chemical_solution": "Bakterisida Kasugamisin 20 g/l + Insektisida Klorantraniliprol.",
    }


def hitung_modal_dan_kelayakan(
    commodity_id: int,
    area_ha: float,
    harga_pasar_per_kg: int,
) -> dict[str, Any]:
    if commodity_id == 1:
        nama_bibit = "Benih Cabai Rawit Hibrida Unggul (Ori 212 / Asmoro)"
        kebutuhan_bibit = f"{180.0 * area_ha:.1f} gram (~{int(18000.0 * area_ha)} bibit semai)"
        biaya_bibit_rp = int(3_200_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(450.0 * area_ha)} kg NPK 16-16-16 + {int(300.0 * area_ha)} kg ZA + {int(3500.0 * area_ha)} kg Kompos Organik"
        biaya_pupuk_rp = int(18_500_000.0 * area_ha)
        kebutuhan_sarana = f"Mulsa Plastik MPHP {int(8.0 * area_ha)} rol + Ajir Bambu {int(18000.0 * area_ha)} batang"
        biaya_mulsa_ajir_rp = int(12_000_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(22_000_000.0 * area_ha)
        biaya_pestisida_rp = int(8_500_000.0 * area_ha)
        estimasi_panen_kg = int(8500.0 * area_ha)
    elif commodity_id == 2:
        nama_bibit = "Umbi Bibit Bawang Merah Siap Tanam Varietas Tajuk / Bauji"
        kebutuhan_bibit = f"{int(1200.0 * area_ha)} kg umbi bibit pilihan"
        biaya_bibit_rp = int(36_000_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(350.0 * area_ha)} kg NPK + {int(200.0 * area_ha)} kg SP-36 + {int(2500.0 * area_ha)} kg Pupuk Kandang"
        biaya_pupuk_rp = int(14_000_000.0 * area_ha)
        kebutuhan_sarana = f"Kapur Dolomit {int(1500.0 * area_ha)} kg + Selang Siram & Sprinkler"
        biaya_mulsa_ajir_rp = int(2_500_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(15_000_000.0 * area_ha)
        biaya_pestisida_rp = int(6_500_000.0 * area_ha)
        estimasi_panen_kg = int(10000.0 * area_ha)
    elif commodity_id == 3:
        nama_bibit = "Benih Cabai Merah Besar Hibrida (Imola / Elegance)"
        kebutuhan_bibit = f"{160.0 * area_ha:.1f} gram (~{int(16000.0 * area_ha)} bibit semai)"
        biaya_bibit_rp = int(3_500_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(450.0 * area_ha)} kg NPK + {int(250.0 * area_ha)} kg KCl + {int(3000.0 * area_ha)} kg Kompos"
        biaya_pupuk_rp = int(17_500_000.0 * area_ha)
        kebutuhan_sarana = f"Mulsa Plastik MPHP {int(7.0 * area_ha)} rol + Ajir Bambu {int(16000.0 * area_ha)} batang"
        biaya_mulsa_ajir_rp = int(12_000_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(21_000_000.0 * area_ha)
        biaya_pestisida_rp = int(8_000_000.0 * area_ha)
        estimasi_panen_kg = int(12500.0 * area_ha)
    elif commodity_id == 4:
        nama_bibit = "Benih Tomat Sayur Hibrida (Servo / Tymoti F1)"
        kebutuhan_bibit = f"{150.0 * area_ha:.1f} gram (~{int(18000.0 * area_ha)} bibit semai)"
        biaya_bibit_rp = int(2_800_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(400.0 * area_ha)} kg NPK + {int(2500.0 * area_ha)} kg Kompos Matang"
        biaya_pupuk_rp = int(15_000_000.0 * area_ha)
        kebutuhan_sarana = f"Mulsa MPHP {int(8.0 * area_ha)} rol + Tali Salaran & Ajir Bambu"
        biaya_mulsa_ajir_rp = int(11_000_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(18_000_000.0 * area_ha)
        biaya_pestisida_rp = int(6_500_000.0 * area_ha)
        estimasi_panen_kg = int(22000.0 * area_ha)
    elif commodity_id == 5:
        nama_bibit = "Bibit Umbi Kentang G2 Granola Bersertifikat"
        kebutuhan_bibit = f"{int(1500.0 * area_ha)} kg umbi bibit bertunas"
        biaya_bibit_rp = int(38_000_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(600.0 * area_ha)} kg NPK + {int(4000.0 * area_ha)} kg Pupuk Kandang Kambing/Sapi"
        biaya_pupuk_rp = int(22_000_000.0 * area_ha)
        kebutuhan_sarana = f"Kapur Pertanian Dolomit {int(2000.0 * area_ha)} kg + Karung Panen"
        biaya_mulsa_ajir_rp = int(3_000_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(16_000_000.0 * area_ha)
        biaya_pestisida_rp = int(8_500_000.0 * area_ha)
        estimasi_panen_kg = int(18000.0 * area_ha)
    else:
        nama_bibit = "Benih Kubis Unggul Krop Padat (Green Nova F1)"
        kebutuhan_bibit = f"{250.0 * area_ha:.1f} gram (~{int(25000.0 * area_ha)} bibit semai)"
        biaya_bibit_rp = int(2_200_000.0 * area_ha)
        kebutuhan_pupuk = f"{int(400.0 * area_ha)} kg NPK + {int(3000.0 * area_ha)} kg Kompos"
        biaya_pupuk_rp = int(14_000_000.0 * area_ha)
        kebutuhan_sarana = f"Kapur Dolomit {int(1000.0 * area_ha)} kg + Keranjang Panen"
        biaya_mulsa_ajir_rp = int(1_500_000.0 * area_ha)
        biaya_tenaga_kerja_rp = int(14_000_000.0 * area_ha)
        biaya_pestisida_rp = int(5_500_000.0 * area_ha)
        estimasi_panen_kg = int(24000.0 * area_ha)

    total_modal_rp = (
        biaya_bibit_rp
        + biaya_pupuk_rp
        + biaya_mulsa_ajir_rp
        + biaya_tenaga_kerja_rp
        + biaya_pestisida_rp
    )
    est_panen_kg = max(100, estimasi_panen_kg)
    hpp_per_kg = int(round(total_modal_rp / est_panen_kg))
    est_omzet_rp = est_panen_kg * harga_pasar_per_kg
    potensi_keuntungan_rp = est_omzet_rp - total_modal_rp
    roi_percent = (
        round((potensi_keuntungan_rp / total_modal_rp) * 100.0, 1)
        if total_modal_rp > 0
        else 0.0
    )

    if roi_percent >= 40.0:
        kelayakan_status = "SANGAT LAYAK (MARGIN TINGGI)"
        kelayakan_badge_class = "text-success"
    elif roi_percent >= 10.0:
        kelayakan_status = "LAYAK TERBATAS (MARGIN AMAN)"
        kelayakan_badge_class = "text-warning"
    else:
        kelayakan_status = "BERISIKO MERUGI (HARGA PASAR RENDAH)"
        kelayakan_badge_class = "text-danger"

    return {
        "area_ha": area_ha,
        "total_modal_rp": total_modal_rp,
        "estimasi_panen_kg": est_panen_kg,
        "hpp_per_kg": hpp_per_kg,
        "harga_pasar_saat_ini_rp": harga_pasar_per_kg,
        "estimasi_omzet_rp": est_omzet_rp,
        "potensi_keuntungan_rp": potensi_keuntungan_rp,
        "roi_percent": roi_percent,
        "kelayakan_status": kelayakan_status,
        "kelayakan_badge_class": kelayakan_badge_class,
        "breakdown": {
            "bibit": {
                "nama": nama_bibit,
                "kebutuhan": kebutuhan_bibit,
                "biaya_rp": biaya_bibit_rp,
            },
            "pupuk": {
                "kebutuhan": kebutuhan_pupuk,
                "biaya_rp": biaya_pupuk_rp,
            },
            "sarana_prasarana": {
                "kebutuhan": kebutuhan_sarana,
                "biaya_rp": biaya_mulsa_ajir_rp,
            },
            "tenaga_kerja": {
                "keterangan": f"Olah tanah, pemasangan mulsa, penanaman, pemeliharaan & panen ({area_ha:.1f} Ha)",
                "biaya_rp": biaya_tenaga_kerja_rp,
            },
            "proteksi_tanaman": {
                "keterangan": "Fungisida, insektisida nabati/kimia, & perangkap hama",
                "biaya_rp": biaya_pestisida_rp,
            },
        },
    }
