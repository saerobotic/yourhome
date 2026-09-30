"""Uji tools/siapkan-import-excel.py terhadap SQLite tiruan skema D1."""

import os
import sqlite3
import subprocess
import sys

ROOT = r"c:\xampp\htdocs\your_home"
PY = r"c:/python314/python.exe"
TOOL = os.path.join(ROOT, "tools", "siapkan-import-excel.py")
SAMPLE = os.path.join(ROOT, "tools", "_contoh-2024.txt")
OUT = os.path.join(ROOT, "import-uji.sql")

# Semua baris sengaja menyatu jadi SATU baris panjang, meniru hasil copy dari WhatsApp.
# Termasuk 1 baris harga 0 (harus dilewati) dan 1 baris tahun 2025 (harus tersaring).
SAMPLE_TEXT = (
    "Dwicky Zen | SUD-07 | 2024-01-01 | 2024-01-02 | 1 | Airbnb | 393447 | 393447 "
    "Irkham Trisandi | SUD-07 | 2024-01-02 | 2024-01-03 | 1 | Airbnb | 345112 | 345112 "
    "Ricky Chandra | SUD-07 | 2024-01-04 | 2024-01-06 | 2 | Airbnb | 933199 | 466600 "
    "Fathira Salsabila | SUD-07 | 2024-08-31 | 2024-09-01 | 1 | WA | 0 | 0 "
    "Tamu 2025 | SUD-11 | 2025-03-01 | 2025-03-02 | 1 | Agoda | 100000 | 100000 "
    "Tamu Kode Aneh | TBS | 2024-02-01 | 2024-02-03 | 2 | Agoda | 500000 | 250000"
)

MOCK_SCHEMA = """
CREATE TABLE properties (id TEXT PRIMARY KEY, dashboard_id TEXT, property_code TEXT, name TEXT);
CREATE TABLE dashboard_bookings (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL, property_name TEXT NOT NULL,
  property_code TEXT NOT NULL DEFAULT '', guest TEXT NOT NULL, platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Inquiry','Confirmed','Checked-in','Checked-out','Cancelled')),
  checkin TEXT NOT NULL, checkout TEXT NOT NULL,
  nights INTEGER NOT NULL CHECK (nights > 0), amount INTEGER NOT NULL CHECK (amount > 0),
  extra_bed_quantity INTEGER NOT NULL DEFAULT 0, extra_bed_price INTEGER NOT NULL DEFAULT 0,
  cleaning_fee INTEGER NOT NULL DEFAULT 0, platform_fee_pct INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '', cancellation_reason TEXT NOT NULL DEFAULT '',
  refund_amount INTEGER NOT NULL DEFAULT 0, income_entry_id TEXT NOT NULL,
  refund_entry_id TEXT, created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE finance_entries (
  id TEXT PRIMARY KEY, kind TEXT, category_id TEXT, category_name TEXT, property_id TEXT,
  property_name TEXT, entry_date TEXT, amount INTEGER, description TEXT, payee TEXT,
  recurrence TEXT, proof_url TEXT DEFAULT '', created_by TEXT, created_at TEXT);
INSERT INTO properties (id, dashboard_id, property_code, name) VALUES
  ('u-1', 'dashboard-p1', 'SUD-07', 'Lantai 7 Sudirman Suites'),
  ('u-2', 'dashboard-p2', 'SUD-11', 'Lantai 11 Sudirman Suites');
"""


def main():
    # Tanpa argumen: uji alat dengan contoh bawaan.
    # Dengan argumen: uji file SQL yang sudah dibuat.
    target = sys.argv[1] if len(sys.argv) > 1 else OUT
    if target == OUT:
        with open(SAMPLE, "w", encoding="utf-8") as handle:
            handle.write(SAMPLE_TEXT)
        run = subprocess.run(
            [PY, TOOL, "--text", SAMPLE, "--period", "2024", "--out", OUT],
            capture_output=True, text=True,
        )
        print("--- keluaran alat ---")
        print(run.stdout.strip())
        if run.stderr.strip():
            print("STDERR:", run.stderr.strip())

    with open(target, encoding="utf-8") as handle:
        sql = handle.read()
    print(f"--- ukuran SQL: {len(sql) / 1024:.1f} KB ---")

    db = sqlite3.connect(":memory:")
    db.executescript(MOCK_SCHEMA)
    try:
        db.executescript(sql)
        print("EKSEKUSI: OK")
    except Exception as error:
        print("EKSEKUSI GAGAL:", error)
        return 1

    print("booking   :", db.execute("SELECT COUNT(*), SUM(amount) FROM dashboard_bookings").fetchone())
    print("pemasukan :", db.execute("SELECT COUNT(*), SUM(amount) FROM finance_entries").fetchone())
    print("per baris :", db.execute(
        "SELECT id, property_id, guest, checkin, nights, amount FROM dashboard_bookings ORDER BY id"
    ).fetchall())
    print("ditandai  :", db.execute(
        "SELECT property_code, COUNT(*) FROM dashboard_bookings WHERE property_id LIKE 'BELUM-%' "
        "GROUP BY property_code"
    ).fetchall())

    db.executescript(sql)  # uji idempoten: dijalankan ulang tidak boleh menggandakan
    print("ULANG     :", db.execute("SELECT COUNT(*) FROM dashboard_bookings").fetchone(),
          db.execute("SELECT COUNT(*) FROM finance_entries").fetchone())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
