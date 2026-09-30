"""
Hitung ulang omzet bulanan 2026 dari baris dashboard_bookings pada file impor SQL.

Tujuan: pembanding yang bisa diverifikasi terhadap file Omzet.xlsx, tanpa
menyentuh D1. Aturan duplikat mengikuti D1: "INSERT OR IGNORE" memakai PRIMARY
KEY id, jadi id yang sama hanya dihitung sekali (kemunculan pertama menang).

Cara pakai (dari folder C:\\xampp\\htdocs\\your_home):
    c:/python314/python.exe tools/analisa-omzet-2026.py

Skrip hanya membaca file .sql; tidak mengubah database maupun berkas apa pun.
"""

import glob
import os
import re
import sys
from collections import defaultdict

FIELD_ORDER = [
    "id", "property_id", "property_name", "property_code", "guest", "platform",
    "status", "checkin", "checkout", "nights", "amount", "extra_bed_quantity",
    "extra_bed_price", "cleaning_fee", "platform_fee_pct", "note",
    "cancellation_reason", "refund_amount", "income_entry_id", "created_by",
    "created_at", "updated_at",
]

INSERT_RE = re.compile(
    r"INSERT\s+OR\s+IGNORE\s+INTO\s+dashboard_bookings\s*\([^)]*\)\s*VALUES\s*",
    re.IGNORECASE,
)


def split_tuple(text):
    """Pecah isi satu tuple VALUES(...) menjadi daftar field (mengabaikan koma dalam tanda kutip)."""
    fields = []
    buffer = []
    in_string = False
    index = 0
    length = len(text)
    while index < length:
        character = text[index]
        if in_string:
            if character == "'":
                if index + 1 < length and text[index + 1] == "'":
                    buffer.append("'")
                    index += 2
                    continue
                in_string = False
                index += 1
                continue
            buffer.append(character)
            index += 1
            continue
        if character == "'":
            in_string = True
            index += 1
            continue
        if character == ",":
            fields.append("".join(buffer).strip())
            buffer = []
            index += 1
            continue
        buffer.append(character)
        index += 1
    fields.append("".join(buffer).strip())
    return fields


def read_rows(path):
    """Ambil seluruh baris dashboard_bookings dari satu file SQL."""
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read()
    rows = []
    for match in INSERT_RE.finditer(content):
        start = match.end()
        if start >= len(content) or content[start] != "(":
            continue
        depth = 0
        in_string = False
        index = start
        length = len(content)
        while index < length:
            character = content[index]
            if in_string:
                if character == "'":
                    if index + 1 < length and content[index + 1] == "'":
                        index += 2
                        continue
                    in_string = False
                index += 1
                continue
            if character == "'":
                in_string = True
                index += 1
                continue
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        inner = content[start + 1:index]
        fields = split_tuple(inner)
        if len(fields) >= len(FIELD_ORDER):
            rows.append(dict(zip(FIELD_ORDER, fields)))
    return rows


def as_number(value):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = sorted(glob.glob(os.path.join(root, "*.sql")))
    if not files:
        print("Tidak ada file .sql di folder proyek.")
        return 1

    seen_ids = {}
    duplicate_rows = []
    source_by_id = {}

    for path in files:
        rows = read_rows(path)
        if not rows:
            continue
        name = os.path.basename(path)
        for row in rows:
            row_id = row["id"]
            if not row_id:
                continue
            if row_id in seen_ids:
                duplicate_rows.append((row_id, source_by_id[row_id], name, row))
                continue
            seen_ids[row_id] = row
            source_by_id[row_id] = name

    monthly_amount = defaultdict(int)
    monthly_net = defaultdict(int)
    monthly_count = defaultdict(int)
    monthly_by_source = defaultdict(lambda: defaultdict(int))

    for row in seen_ids.values():
        checkin = str(row.get("checkin", ""))
        if not checkin.startswith("2026-"):
            continue
        month = checkin[:7]
        amount = as_number(row.get("amount"))
        refund = as_number(row.get("refund_amount"))
        extra = as_number(row.get("extra_bed_quantity")) * as_number(row.get("extra_bed_price"))
        status = str(row.get("status", "")).strip().lower()
        cancelled = status in ("cancelled", "canceled")
        net = max(0, amount - refund) if cancelled else amount
        monthly_amount[month] += amount
        monthly_net[month] += net + extra
        monthly_count[month] += 1
        monthly_by_source[month][row.get("created_by", "")] += amount

    labels = {
        "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
        "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
        "09": "September", "10": "Oktober", "11": "November", "12": "Desember",
    }

    print("=== Omzet 2026 dari baris booking di file impor SQL (tanpa duplikat id) ===")
    print(f"{'Bulan':<11}{'Jumlah':>7}{'Sum amount':>16}{'Net+Extrabed':>16}")
    total_amount = 0
    total_net = 0
    total_count = 0
    for key in sorted(labels):
        month = f"2026-{key}"
        total_amount += monthly_amount[month]
        total_net += monthly_net[month]
        total_count += monthly_count[month]
        print(f"{labels[key]:<11}{monthly_count[month]:>7}{monthly_amount[month]:>16,}{monthly_net[month]:>16,}".replace(",", "."))
    print(f"{'TOTAL':<11}{total_count:>7}{total_amount:>16,}{total_net:>16,}".replace(",", "."))

    print()
    print("=== Rincian per batch impor (Sum amount, 2026) ===")
    for key in sorted(labels):
        month = f"2026-{key}"
        parts = ", ".join(
            f"{created_by or '(kosong)'}={value:,}".replace(",", ".")
            for created_by, value in sorted(monthly_by_source[month].items())
        )
        if parts:
            print(f"{labels[key]:<11}{parts}")

    print()
    print(f"=== Duplikat id ditemukan: {len(duplicate_rows)} baris ===")
    for row_id, first_source, again_source, row in duplicate_rows:
        print(
            f"{row_id} | {row.get('checkin')} | amount={as_number(row.get('amount')):,}".replace(",", ".")
            + f" | pertama: {first_source} | diulang: {again_source}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
