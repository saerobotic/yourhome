"""
Siapkan file SQL impor booking dari Book2.xlsx.

Hasil: import-book2-agustus2026.sql di akar proyek (tidak ikut terbit ke internet).

Aturan yang dipakai:
- Yosan  -> Direct
- WA     -> Direct
- Booking-> Booking.com
- Kode properti yang yakin dipetakan ke katalog; yang tidak, dibuatkan
  properti baru berstatus Draft (active = 1, publication_status = 'draft')
  supaya bisa diedit belakangan dari Dashboard tanpa muncul di website.
- Tanggal pemasukan = tanggal check-in.
- Semua INSERT idempoten (INSERT OR IGNORE / WHERE NOT EXISTS),
  jadi aman dijalankan ulang.
"""

import datetime
import importlib.util
import re

BOOK2_PATH = r"D:\DATA\DOWNLOAD\Book2.xlsx"
OUT_SQL = r"c:\xampp\htdocs\your_home\import-book2-agustus2026.sql"
READER_PATH = r"c:\xampp\htdocs\your_home\tools\baca-excel.py"

# kode Book2 -> (kode katalog, nama properti, kategori, sudah dipetakan?)
MAPPING = {
    "7": ("SUD-07", "Lantai 7 Sudirman Suites", "apartment", True),
    "11": ("SUD-11", "Lantai 11 Sudirman Suites", "apartment", True),
    "18": ("SUD-18", "Lantai 18 Sudirman Suites", "apartment", True),
    "19": ("SUD-19", "Lantai 19 Sudirman Suites", "apartment", True),
    "AL1": ("VAL-01", "Villa Alam 1", "villa", True),
    "AL2": ("VAL-02", "Villa Alam 2", "villa", True),
    "X4": ("VX4", "Villa X4", "villa", True),
    "X7": ("VX7", "Villa X7", "villa", True),
    "AWN": ("AWN", "Villa AWN", "villa", True),
    "AUR": ("VAUR", "Villa Aurum", "villa", True),
    "TBS": ("GH-TBS", "Guest House Tatar Banyak Sumba", "guesthouse", True),
    "CSB": ("CSB", "CSB - perlu dipetakan", "villa", False),
    "CKB": ("CKB", "CKB - perlu dipetakan", "villa", False),
    "CZB": ("CZB", "CZB - perlu dipetakan", "villa", False),
    "VIB": ("VIB", "VIB - perlu dipetakan", "villa", False),
    "SMR": ("SMR", "SMR - perlu dipetakan", "villa", False),
    "GCA": ("GCA", "GCA - perlu dipetakan", "apartment", False),
    "Dago": ("DAGO", "DAGO - perlu dipetakan", "villa", False),
    "HIB": ("HIB", "HIB - perlu dipetakan", "villa", False),
}

PLATFORM_MAP = {
    "wa": "Direct",
    "whatsapp": "Direct",
    "yosan": "Direct",
    "direct": "Direct",
    "booking": "Booking.com",
    "booking.com": "Booking.com",
    "airbnb": "Airbnb",
    "agoda": "Agoda",
    "tiket": "Tiket.com",
    "tiket.com": "Tiket.com",
    "traveloka": "Traveloka",
    "agen offline": "Agen Offline",
    "website": "Website",
}

CLEAN_CHARS = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u200e\u200f\u202a\u202b\u202c\u202d\u202e\ufeff"))


def sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").translate(CLEAN_CHARS)).strip()


def load_reader():
    spec = importlib.util.spec_from_file_location("baca", READER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_rows(reader):
    rows = []
    problems = []
    for _, sheet_rows in reader.read_sheets(BOOK2_PATH):
        for line_number, row in enumerate(sheet_rows, start=1):
            values = list(row) + [""] * 10
            guest = clean(values[1])
            code = clean(values[2])
            if not guest and not code:
                continue
            checkin = reader.as_date(values[3])
            checkout = reader.as_date(values[4])
            nights = (datetime.date.fromisoformat(checkout) - datetime.date.fromisoformat(checkin)).days
            amount = int(reader.as_amount(values[8]) or 0)
            raw_platform = clean(values[6])
            platform = PLATFORM_MAP.get(raw_platform.lower())
            if code not in MAPPING:
                problems.append(f"baris {line_number}: kode '{code}' belum ada di peta")
                continue
            if platform is None:
                problems.append(f"baris {line_number}: platform '{raw_platform}' belum ada di peta")
                continue
            if nights <= 0 or amount <= 0 or not guest:
                problems.append(f"baris {line_number}: data tidak lengkap ({guest!r}, {nights} malam, {amount})")
                continue
            rows.append({
                "baris": line_number, "guest": guest, "kode": code,
                "checkin": checkin, "checkout": checkout, "nights": nights,
                "platform": platform, "amount": amount,
            })
    return rows, problems


def build_sql(rows, problems):
    used_codes = [code for code in MAPPING if any(row["kode"] == code for row in rows)]
    parts = []
    parts.append("-- ============================================================")
    parts.append("-- IMPORT BOOKING AGUSTUS 2026 DARI Book2.xlsx")
    parts.append("-- Dibuat otomatis oleh tools/siapkan-import-book2.py")
    parts.append("-- Jalankan di D1 Console, database: your-home-checkin")
    parts.append("--")
    parts.append(f"-- {len(rows)} booking | total Rp {sum(r['amount'] for r in rows):,}".replace(",", "."))
    parts.append("-- Tanggal pemasukan = tanggal check-in (masuk bulan Agustus).")
    parts.append("-- Semua INSERT idempoten: aman dijalankan ulang, tidak menggandakan data.")
    parts.append("-- Penanda data: created_by = 'import-book2'.")
    parts.append("-- ============================================================")
    parts.append("")

    parts.append("-- 1) Pastikan properti tersedia. Yang belum ada dibuat sebagai Draft")
    parts.append("--    (tampil di Dashboard untuk diedit, tidak muncul di website).")
    for code in used_codes:
        lookup_code, lookup_name, category, mapped = MAPPING[code]
        placeholder_id = f"book2-{lookup_code.lower()}"
        status = "dipetakan" if mapped else "PERLU DIPETAKAN"
        parts.append(f"-- {code} -> {lookup_code} ({status})")
        parts.append(
            "INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, "
            "weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, "
            "map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)"
        )
        parts.append(
            f"SELECT {sql_text(placeholder_id)}, {sql_text(placeholder_id)}, {sql_text(lookup_code)}, "
            f"{sql_text(lookup_name)}, {sql_text(category)}, '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', "
            "0, 1, 'draft', datetime('now')"
        )
        parts.append(
            "WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = "
            f"{sql_text(lookup_code)} OR lower(trim(name)) = lower(trim({sql_text(lookup_name)})));"
        )
    parts.append("")

    parts.append("-- 2) Booking + pemasukan Booking-nya (tanggal pemasukan = check-in).")
    values = []
    for index, row in enumerate(rows, start=1):
        lookup_code, lookup_name, _, _ = MAPPING[row["kode"]]
        booking_id = f"BK{row['checkin'].replace('-', '')}-{index:03d}"
        note = f"Import Book2.xlsx baris {row['baris']}"
        values.append(
            "(" + ", ".join([
                sql_text(booking_id), sql_text(lookup_code), sql_text(lookup_name), sql_text(row["guest"]),
                sql_text(row["platform"]), sql_text(row["checkin"]), sql_text(row["checkout"]),
                str(row["nights"]), str(row["amount"]), sql_text(note),
            ]) + ")"
        )
    parts.append(
        "WITH v(id, lookup_code, lookup_name, guest, platform, checkin, checkout, nights, amount, note) AS (VALUES"
    )
    parts.append(",\n".join("  " + value for value in values))
    parts.append("),")
    parts.append("mapped AS (")
    parts.append("  SELECT v.id, v.guest, v.platform, v.checkin, v.checkout, v.nights, v.amount, v.note,")
    parts.append("         (SELECT p.id FROM properties p")
    parts.append("          WHERE p.property_code = v.lookup_code OR lower(trim(p.name)) = lower(trim(v.lookup_name))")
    parts.append("          ORDER BY (p.property_code = v.lookup_code) DESC LIMIT 1) AS property_id")
    parts.append("  FROM v)")
    parts.append(
        "INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, "
        "status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, "
        "platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at)"
    )
    parts.append(
        "SELECT m.id, p.id, p.name, p.property_code, m.guest, m.platform, 'Checked-out', m.checkin, m.checkout, "
        "m.nights, m.amount, 0, 0, 0, 0, m.note, '', 0, 'booking-income-' || m.id, 'import-book2', "
        "datetime('now'), datetime('now')"
    )
    parts.append("FROM mapped m JOIN properties p ON p.id = m.property_id;")
    parts.append("")

    parts.append("-- 3) Pemasukan kategori Booking untuk setiap booking di atas.")
    parts.append(
        "INSERT OR IGNORE INTO finance_entries (id, kind, category_id, category_name, property_id, property_name, "
        "entry_date, amount, description, payee, recurrence, created_by, created_at)"
    )
    parts.append(
        "SELECT b.income_entry_id, 'income', 'income-booking', 'Booking', b.property_id, b.property_name, "
        "b.checkin, b.amount, 'Booking ' || b.id || ' - ' || b.guest, b.platform, 'once', 'import-book2', b.created_at"
    )
    parts.append("FROM dashboard_bookings b WHERE b.created_by = 'import-book2';")
    parts.append("")

    parts.append("-- 4) PEMERIKSAAN: jumlah harus 128 dan total harus Rp 245.046.913.")
    parts.append(
        "SELECT 'booking terimpor' AS pemeriksaan, COUNT(*) AS jumlah, SUM(amount) AS nilai "
        "FROM dashboard_bookings WHERE created_by = 'import-book2'"
    )
    parts.append(
        "UNION ALL SELECT 'pemasukan Booking terimpor', COUNT(*), SUM(amount) FROM finance_entries "
        "WHERE created_by = 'import-book2' AND category_id = 'income-booking';"
    )
    parts.append("")
    parts.append(
        "SELECT p.property_code AS kode, p.name AS properti, p.publication_status AS status, "
        "COUNT(b.id) AS booking, SUM(b.amount) AS nilai "
        "FROM dashboard_bookings b JOIN properties p ON p.id = b.property_id "
        "WHERE b.created_by = 'import-book2' GROUP BY p.id ORDER BY nilai DESC;"
    )
    parts.append("")
    if problems:
        parts.append("-- CATATAN: baris yang DILEWATI:")
        parts.extend("--   " + problem for problem in problems)
        parts.append("")
    return "\n".join(parts)


def main():
    reader = load_reader()
    rows, problems = read_rows(reader)
    sql = build_sql(rows, problems)
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(sql)

    per_code = {}
    for row in rows:
        entry = per_code.setdefault(row["kode"], {"jumlah": 0, "nilai": 0})
        entry["jumlah"] += 1
        entry["nilai"] += row["amount"]

    print("FILE :", OUT_SQL)
    print("BARIS:", len(rows), "| TOTAL: Rp", f"{sum(r['amount'] for r in rows):,}".replace(",", "."))
    print("MASALAH:", len(problems))
    for problem in problems[:10]:
        print("   ", problem)
    print()
    print("PER KODE (dipetakan / perlu dipetakan):")
    for code in sorted(per_code, key=lambda item: -per_code[item]["nilai"]):
        lookup_code, lookup_name, _, mapped = MAPPING[code]
        label = f"-> {lookup_code}" if mapped else "-> BARU (perlu diedit)"
        print(f"  {code:<6} {per_code[code]['jumlah']:>3} booking  Rp {per_code[code]['nilai']:>11,}  {label}".replace(",", "."))
    print()
    print("UKURAN SQL:", round(len(sql) / 1024, 1), "KB")


if __name__ == "__main__":
    main()
