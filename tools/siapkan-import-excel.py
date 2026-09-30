"""
Ubah hasil ekstraksi Excel menjadi SQL impor untuk database D1 (YOUR HOME).

Masukan — pilih salah satu:
  --text FILE    teks format:
                 Nama | Kode | Checkin | Checkout | Malam | Platform | Total | HargaHari
                 Aman walau semua barisnya menyatu jadi satu baris panjang
                 (mis. hasil copy-paste dari WhatsApp).
  --xlsx FILE    workbook Excel. Kolom: B nama, C kode, D check-in, E check-out,
                 F malam, G platform, I total payment, J harga per hari.

Contoh:
  c:/python314/python.exe tools/siapkan-import-excel.py --text data-excel-2024.txt --period 2024
  c:/python314/python.exe tools/siapkan-import-excel.py --xlsx "D:/Master.xlsx" --sheet 2024 --period 2024

Hasil: file SQL di akar proyek (default import-excel.sql), plus ringkasan di layar.
"""

import argparse
import datetime
import importlib.util
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READER_PATH = os.path.join(ROOT, "tools", "baca-excel.py")

# kode di Excel -> kode katalog di database
PETA = {
    "7": "SUD-07", "11": "SUD-11", "18": "SUD-18", "19": "SUD-19",
    "AL1": "VAL-01", "AL2": "VAL-02", "AL12": "VAL-12", "X4": "VX4", "X7": "VX7",
    "AWN": "AWN", "AUR": "VLAR", "TBS": "GH-TBS", "TGV": "VTG",
    "Dago": "VBD", "77": "SUD-07", "GCA": "GCB-03", "KBP": "GH-KBP",
}

PLATFORM = {
    "wa": "Direct", "whatsapp": "Direct", "yosan": "Direct", "direct": "Direct",
    "langsung": "Direct", "telp": "Direct", "telepon": "Direct",
    "booking": "Booking.com", "booking.com": "Booking.com",
    "airbnb": "Airbnb", "agoda": "Agoda",
    "tiket": "Tiket.com", "tiket.com": "Tiket.com",
    "traveloka": "Traveloka", "agen offline": "Agen Offline", "website": "Website",
    "travelio": "Agen Offline", "24hours": "Direct", "24 hours": "Direct", "agent": "Agen Offline",
}

ROW_RE = re.compile(
    r"([^|]+?)\s*\|\s*([0-9A-Za-z\-]{1,8})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*"
    r"(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,3})\s*\|\s*([A-Za-z][A-Za-z.\- ]*?)\s*\|\s*"
    r"(\d+)\s*\|\s*(\d+)"
)


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def to_iso(value):
    """Terima '2024-01-31', '31/01/2024', atau serial tanggal Excel."""
    text = clean(value)
    if not text:
        return ""
    match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", text)
    if not match:
        match = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", text)
        if match:
            text = f"{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}"
    else:
        text = f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    try:
        datetime.date.fromisoformat(text)
        return text
    except ValueError:
        return ""


def to_int(value):
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    return int(digits) if digits else 0


def to_amount(value):
    """Nominal dari sel Excel.

    Nilai desimal dibulatkan ke rupiah terdekat. Kalau titiknya cuma
    dihapus, 7661823.1999999993 akan jadi 7 kuadriliun - itu pernah terjadi.
    """
    text = clean(value)
    if not text:
        return 0
    if re.fullmatch(r"-?\d+(?:[.,]\d+)?", text):
        return int(round(float(text.replace(",", "."))))
    return to_int(text)


def read_text(path):
    with open(path, "r", encoding="utf-8-sig", errors="replace") as handle:
        blob = handle.read()
    rows = []
    for match in ROW_RE.finditer(blob):
        rows.append({
            "guest": clean(match.group(1)),
            "code": clean(match.group(2)),
            "checkin": match.group(3),
            "checkout": match.group(4),
            "nights_given": int(match.group(5)),
            "platform": clean(match.group(6)),
            "amount": int(match.group(7)),
            "rate": int(match.group(8)),
        })
    return rows


def read_xlsx(path, sheet):
    spec = importlib.util.spec_from_file_location("baca", READER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = []
    for sheet_name, sheet_rows in module.read_sheets(path):
        if sheet and clean(sheet_name).lower() != clean(sheet).lower():
            continue
        for raw in sheet_rows:
            values = list(raw) + [""] * 12
            guest = clean(values[1])
            code = clean(values[2])
            if not code:
                continue
            if guest.lower() in ("nama", "name", "nama konsumen", "konsumen", "total") or code.lower() in ("kode", "lantai"):
                continue
            # Baris bernilai tetapi tanpa nama tamu tetap diambil, supaya tidak hilang diam-diam.
            if not guest:
                if not to_amount(values[8]):
                    continue
                guest = "(tanpa nama)"
            rows.append({
                "guest": guest,
                "code": code,
                "checkin": to_iso(module.as_date(values[3]) or values[3]),
                "checkout": to_iso(module.as_date(values[4]) or values[4]),
                "nights_given": to_int(values[5]),
                "platform": clean(values[6]),
                "amount": to_amount(values[8]),
                "rate": to_amount(values[9]),
            })
    return rows


def normalize(rows, period):
    bookings, problems = [], []
    for index, row in enumerate(rows, start=1):
        label = f"baris {index}"
        checkin, checkout = to_iso(row["checkin"]), to_iso(row["checkout"])
        if not checkin or not checkout:
            problems.append(f"{label}: tanggal tidak valid ({row['checkin']} / {row['checkout']})")
            continue
        if period and not checkin.startswith(period):
            continue
        nights = (datetime.date.fromisoformat(checkout) - datetime.date.fromisoformat(checkin)).days
        if nights <= 0:
            problems.append(f"{label}: check-out tidak setelah check-in ({row['guest']})")
            continue
        if nights != row["nights_given"] and row["nights_given"]:
            problems.append(
                f"{label}: malam tertulis {row['nights_given']}, dari tanggal {nights} ({row['guest']})"
            )
        amount = row["amount"]
        if amount <= 0:
            problems.append(f"{label}: total payment kosong/nol ({row['guest']}) - dilewati")
            continue
        platform = PLATFORM.get(row["platform"].lower())
        if platform is None:
            problems.append(f"{label}: platform '{row['platform']}' tidak dikenal ({row['guest']}) - dilewati")
            continue
        code = PETA.get(row["code"], row["code"])
        bookings.append({
            "guest": row["guest"], "code": code, "checkin": checkin, "checkout": checkout,
            "nights": nights, "platform": platform, "amount": amount, "rate": row["rate"],
        })
    return bookings, problems


def sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"


def build_sql(bookings, marker, label, extra_head=None):
    columns = ["id", "code", "guest", "platform", "checkin", "checkout", "nights", "amount", "note"]
    values = []
    for index, booking in enumerate(bookings, start=1):
        booking_id = f"BKE{booking['checkin'].replace('-', '')}-{index:04d}"
        note = f"Import Excel {label}"
        values.append([
            sql_text(booking_id), sql_text(booking["code"]), sql_text(booking["guest"]),
            sql_text(booking["platform"]), sql_text(booking["checkin"]), sql_text(booking["checkout"]),
            str(booking["nights"]), str(booking["amount"]), sql_text(note),
        ])

    codes = sorted({booking["code"] for booking in bookings})
    parts = []
    parts.append("-- " + "=" * 60)
    parts.append(f"-- IMPORT BOOKING DARI EXCEL - {label}")
    parts.append("-- Dibuat otomatis oleh tools/siapkan-import-excel.py")
    parts.append("-- Jalankan di D1 Console, database: your-home-checkin")
    parts.append("--")
    parts.append(f"-- {len(bookings)} booking | total Rp {sum(b['amount'] for b in bookings):,}".replace(",", "."))
    parts.append("-- Tanggal pemasukan = tanggal check-in.")
    parts.append(f"-- Penanda data: created_by = '{marker}' (aman dijalankan ulang).")
    parts.append("-- " + "=" * 60)
    if extra_head:
        parts.extend(extra_head)
    parts.append("")

    parts.append("-- 1) Booking - satu INSERT per baris (D1 membatasi jumlah cabang UNION ALL)")
    booking_columns = (
        "id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, "
        "nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, "
        "cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at"
    )
    for index, booking in enumerate(bookings, start=1):
        booking_id = f"BKE{booking['checkin'].replace('-', '')}-{index:04d}"
        # Booking yang check-in-nya belum lewat belum bisa dianggap selesai.
        status = "Checked-out" if booking["checkin"] <= datetime.date.today().isoformat() else "Confirmed"
        row = [
            sql_text(booking_id), sql_text(booking["code"]), "''", sql_text(booking["code"]),
            sql_text(booking["guest"]), sql_text(booking["platform"]), sql_text(status),
            sql_text(booking["checkin"]), sql_text(booking["checkout"]),
            str(booking["nights"]), str(booking["amount"]),
            "0", "0", "0", "0",
            sql_text(f"Import Excel {label}"), "''", "0",
            sql_text(f"booking-income-{booking_id}"), sql_text(marker),
            "datetime('now')", "datetime('now')",
        ]
        parts.append(
            f"INSERT OR IGNORE INTO dashboard_bookings ({booking_columns}) VALUES ({', '.join(row)});"
        )

    parts.append("")
    parts.append("-- 2) Tautkan ke properti. Kode yang tidak ada di katalog ditandai BELUM-<kode>.")
    parts.append(
        "UPDATE dashboard_bookings SET "
        "property_id = COALESCE(NULLIF(TRIM((SELECT dashboard_id FROM properties WHERE property_code = dashboard_bookings.property_code)), ''), "
        "(SELECT id FROM properties WHERE property_code = dashboard_bookings.property_code), 'BELUM-' || property_code), "
        "property_name = COALESCE((SELECT name FROM properties WHERE property_code = dashboard_bookings.property_code), "
        "'Properti ' || property_code || ' - kode perlu diperiksa'), "
        "note = CASE WHEN (SELECT COUNT(*) FROM properties WHERE property_code = dashboard_bookings.property_code) = 0 "
        "AND note NOT LIKE '%KODE PERLU DIPERIKSA%' THEN note || ' - KODE PERLU DIPERIKSA' ELSE note END "
        f"WHERE created_by = {sql_text(marker)};"
    )
    parts.append("")

    parts.append("-- 2) Pemasukan Booking untuk setiap booking di atas")
    parts.append(
        "INSERT OR IGNORE INTO finance_entries (id, kind, category_id, category_name, property_id, "
        "property_name, entry_date, amount, description, payee, recurrence, created_by, created_at)"
    )
    parts.append(
        "SELECT b.income_entry_id, 'income', 'income-booking', 'Booking', b.property_id, b.property_name, "
        "b.checkin, b.amount, 'Booking ' || b.id || ' - ' || b.guest, b.platform, 'once', b.created_by, "
        "b.created_at"
    )
    parts.append(f"FROM dashboard_bookings b WHERE b.created_by = {sql_text(marker)};")
    parts.append("")

    parts.append("-- 4) PEMERIKSAAN - jalankan terpisah, D1 hanya menampilkan hasil query pertama")
    parts.append(
        f"SELECT COUNT(*) AS jumlah_booking, COALESCE(SUM(amount), 0) AS nilai_booking "
        f"FROM dashboard_bookings WHERE created_by = {sql_text(marker)};"
    )
    parts.append("")
    parts.append(
        f"SELECT COUNT(*) AS jumlah_pemasukan, COALESCE(SUM(amount), 0) AS nilai_pemasukan "
        f"FROM finance_entries WHERE created_by = {sql_text(marker)};"
    )
    parts.append("")
    parts.append(
        f"SELECT substr(checkin, 1, 7) AS bulan, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai "
        f"FROM dashboard_bookings WHERE created_by = {sql_text(marker)} GROUP BY bulan ORDER BY bulan;"
    )
    parts.append("")
    parts.append("-- Booking yang kodenya TIDAK ketemu di katalog.")
    parts.append("-- Muncul di Dashboard sebagai booking belum terhubung - perbaiki kodenya di sana.")
    parts.append(
        f"SELECT property_code AS kode_perlu_diperiksa, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai "
        f"FROM dashboard_bookings WHERE created_by = {sql_text(marker)} AND property_id LIKE 'BELUM-%' "
        f"GROUP BY property_code;"
    )
    parts.append("")
    parts.append("-- Kode properti yang dipakai: ada_properti harus lebih dari 0")
    for code in codes:
        parts.append(
            f"SELECT {sql_text(code)} AS kode, "
            f"(SELECT COUNT(*) FROM properties p WHERE p.property_code = {sql_text(code)}) AS ada_properti;"
        )
    return "\n".join(parts) + "\n"


def strip_comments(sql):
    """Buang baris komentar.

    Kalau semua baris menyatu jadi satu baris panjang (efek copy-paste),
    tanda '--' akan menelan seluruh query dan D1 menolaknya dengan
    'Requests without any query are not supported'. Versi tanpa komentar
    tetap aman walau barisnya menyatu.
    """
    return "\n".join(
        line for line in sql.split("\n")
        if line.strip() and not line.strip().startswith("--")
    ) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text")
    parser.add_argument("--xlsx")
    parser.add_argument("--sheet", default="")
    parser.add_argument("--period", default="", help="mis. 2024 atau 2026-08 (kosong = semua)")
    parser.add_argument("--label", default="")
    parser.add_argument("--out", default="")
    parser.add_argument("--plain", action="store_true",
                        help="buang baris komentar (aman walau barisnya menyatu jadi satu)")
    parser.add_argument("--split", type=int, default=0,
                        help="pecah hasil jadi beberapa file, mis. --split 200")
    args = parser.parse_args()

    if not args.text and not args.xlsx:
        print("Perlu --text atau --xlsx")
        return 1

    rows = read_text(args.text) if args.text else read_xlsx(args.xlsx, args.sheet)
    if not rows:
        print("Tidak ada baris data yang terbaca.")
        return 1

    bookings, problems = normalize(rows, args.period)
    label = args.label or args.period or "semua periode"
    marker = "import-excel" + (f"-{args.period}" if args.period else "")
    default_name = f"import-excel-{args.period}.sql" if args.period else "import-excel.sql"
    if args.plain:
        default_name = default_name.replace(".sql", "-tanpa-komentar.sql")
    out_path = args.out or os.path.join(ROOT, default_name)

    parts = []
    if args.split and len(bookings) > args.split:
        for offset in range(0, len(bookings), args.split):
            parts.append(bookings[offset:offset + args.split])
    else:
        parts.append(bookings)

    written = []
    for number, part in enumerate(parts, start=1):
        part_marker = marker if len(parts) == 1 else f"{marker}-bagian{number}"
        this_path = out_path if len(parts) == 1 else os.path.join(
            ROOT, default_name.replace(".sql", f"-bagian{number}.sql")
        )
        sql = build_sql(part, part_marker, label)
        if args.plain:
            sql = strip_comments(sql)
        with open(this_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(sql)
        written.append((part, part_marker, this_path))

    per_month = Counter(booking["checkin"][:7] for booking in bookings)
    print(f"Terbaca          : {len(rows)} baris")
    print(f"Dipakai          : {len(bookings)} booking")
    print(f"Total payment    : Rp {sum(b['amount'] for b in bookings):,}".replace(",", "."))
    if bookings:
        biggest = max(bookings, key=lambda booking: booking["amount"])
        print(f"Nilai terbesar   : Rp {biggest['amount']:,} ({biggest['guest']} - {biggest['code']})".replace(",", "."))
    print(f"Bagian           : {len(written)}")
    for part, part_marker, this_path in written:
        size_kb = os.path.getsize(this_path) / 1024
        print(f"  {os.path.basename(this_path)} : {len(part)} booking, {size_kb:.0f} KB, penanda {part_marker}")
    print("Per bulan        :")
    for month in sorted(per_month):
        print(f"  {month} : {per_month[month]}")
    if problems:
        print(f"Catatan ({len(problems)}):")
        for problem in problems:
            print("  - " + problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
