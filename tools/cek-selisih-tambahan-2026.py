"""
Bandingkan baris "Tambahan Booking Update.xlsx" dengan booking Okt-Nov 2026
yang sudah ada pada file impor SQL, supaya hanya selisih yang dimasukkan.

Hanya membaca berkas. Tidak mengubah database maupun berkas apa pun.

Cara pakai (dari folder C:\\xampp\\htdocs\\your_home):
    c:/python314/python.exe tools/cek-selisih-tambahan-2026.py
"""

import glob
import importlib.util
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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


def load_excel_reader():
    path = os.path.join(ROOT, "tools", "baca-excel.py")
    spec = importlib.util.spec_from_file_location("baca_excel", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def split_tuple(text):
    fields, buffer, in_string, index, length = [], [], False, 0, len(text)
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


def read_sql_rows(path):
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read()
    rows = []
    for match in INSERT_RE.finditer(content):
        start = match.end()
        if start >= len(content) or content[start] != "(":
            continue
        depth, in_string, index, length = 0, False, start, len(content)
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
        fields = split_tuple(content[start + 1:index])
        if len(fields) >= len(FIELD_ORDER):
            rows.append(dict(zip(FIELD_ORDER, fields)))
    return rows


def normalize_name(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def as_number(value):
    text = str(value or "").strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", text):
        return int(round(float(text)))
    digits = re.sub(r"\D", "", text)
    return int(digits) if digits else 0


def main():
    existing = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "*.sql"))):
        for row in read_sql_rows(path):
            row_id = row.get("id")
            if row_id and row_id not in existing:
                existing[row_id] = row

    oct_nov = [
        row for row in existing.values()
        if str(row.get("checkin", "")).startswith(("2026-10", "2026-11"))
    ]
    print(f"Booking Okt-Nov 2026 yang sudah ada di file impor: {len(oct_nov)} baris")
    by_key = {}
    for row in oct_nov:
        key = (normalize_name(row.get("guest")), str(row.get("checkin", "")))
        by_key.setdefault(key, []).append(row)

    excel_reader = load_excel_reader()
    sheets = excel_reader.read_sheets(os.path.join(ROOT, "Tambahan Booking Update.xlsx"))

    print()
    print("=== Perbandingan baris Excel ===")
    matched_total = 0
    new_total = 0
    new_rows = []
    for sheet_name, rows in sheets:
        for index, row in enumerate(rows, start=1):
            if len(row) < 9:
                continue
            guest = str(row[1]).strip()
            code = str(row[2]).strip()
            checkin = excel_reader.as_date(row[3])
            checkout = excel_reader.as_date(row[4])
            amount = as_number(row[8])
            note = str(row[11]).strip() if len(row) > 11 else ""
            if not guest and not checkin:
                continue
            key = (normalize_name(guest), checkin)
            hits = by_key.get(key, [])
            same_amount = [hit for hit in hits if as_number(hit.get("amount")) == amount]
            if same_amount:
                matched_total += amount
                status = "SUDAH ADA"
            elif hits:
                matched_total += amount
                status = "NAMA+TANGGAL ADA, nominal beda"
            else:
                new_total += amount
                status = "BELUM ADA"
                new_rows.append((sheet_name, index, guest, code, checkin, checkout, amount, note))
            existing_codes = ",".join(
                sorted({str(hit.get("property_code") or hit.get("property_id") or "") for hit in hits})
            )
            print(
                f"[{status:<27}] {checkin} {guest[:28]:<28} Excel: {code:<6} "
                f"D1: {existing_codes:<8} {amount:>12,}".replace(",", ".")
                + (f"  ({note})" if note else "")
            )

    print()
    print(f"Total nominal baris yang SUDAH ADA/nyaris sama : {matched_total:,}".replace(",", "."))
    print(f"Total nominal baris BELUM ADA                 : {new_total:,}".replace(",", "."))
    print()
    print("=== Daftar baris BELUM ADA ===")
    for item in new_rows:
        _, _, guest, code, checkin, checkout, amount, note = item
        print(f"{checkin} -> {checkout} | {code:<6} | {guest} | {amount:,}".replace(",", ".") + (f" | {note}" if note else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
