"""
Ubah file Buku Kas pengeluaran (mis. Book4.xlsx) menjadi SQL impor untuk D1 (YOUR HOME).

Format kolom yang diharapkan (tanpa baris judul):
  --layout lebar  (default, Book4): A tanggal | B kode | C kategori | D keterangan |
                 E detail | F catatan | G penerima | H masuk | I keluar | J saldo
  --layout ringkas (Book5): A tanggal | B kode | C kategori | D keterangan |
                 E jumlah | F saldo

Aturan penting:
- Hanya kolom I (keluar) yang menjadi pengeluaran. Kolom H dicatat sebagai pemasukan.
- Nilai keluar yang MINUS berarti uang masuk -> dicatat sebagai pemasukan (amount selalu positif).
- Baris keluar = 0 dan masuk = 0 dilewati.
- Baris bagi hasil / sharing owner / pendapatan sewa / kembali deposit TIDAK ditempelkan ke
  properti (property_id NULL) supaya bagi hasil owner tidak ikut terpotong.
- "Pendapatan Sewa" yang masuk (kolom H) dilewati karena sudah terwakili data booking.

Contoh:
  c:/python314/python.exe tools/siapkan-pengeluaran-buku-kas.py --xlsx "D:/Book4.xlsx" --prefix import-pengeluaran-2026

Hasil: file SQL di sql/imports/, plus ringkasan di layar.
"""

import argparse
import importlib.util
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READER_PATH = os.path.join(ROOT, "tools", "baca-excel.py")

# kode di file buku kas -> kode katalog di database
PETA = {
    "Ora": "KDO", "Dago": "VBD", "GCA": "GCB-03", "KBP": "GH-KBP",
    "VIB": "VIB", "18": "SUD-18", "HIB": "HIB",
    "7": "SUD-07", "11": "SUD-11", "19": "SUD-19", "77": "SUD-07",
    "AL1": "VAL-01", "AL2": "VAL-02", "AL12": "VAL-12",
    "X4": "VX4", "X7": "VX7", "AWN": "AWN", "AUR": "VLAR",
    "TBS": "GH-TBS", "TGV": "VTG",
}

# kategori di file -> kategori di dashboard
PETA_KAT = {
    "listrik": ("expense-electricity", "Listrik"),
    "token": ("expense-electricity", "Listrik"),
    "wifi": ("expense-internet", "WiFi / Internet"),
    "internet": ("expense-internet", "WiFi / Internet"),
    "laundry": ("expense-laundry", "Laundry"),
    "gaji": ("expense-salary", "Gaji"),
    "perbaikan": ("expense-repair", "Perbaikan"),
    "perawatan": ("expense-repair", "Perbaikan"),
    "pest control": ("expense-pest-control", "Pest Control"),
    "pest": ("expense-pest-control", "Pest Control"),
    "ipl": ("expense-dues", "Iuran"),
    "refund": ("expense-other", "Lain-lain"),
    "amenities": ("expense-amenities", "Amenities"),
    "chemical": ("expense-amenities", "Amenities"),
    "iuran": ("expense-dues", "Iuran"),
    "depo": ("expense-other", "Lain-lain"),
    "lain": ("expense-other", "Lain-lain"),
    "pajak": ("expense-tax", "Pajak"),
}

# dipakai kalau kolom kategori kosong
FALLBACK = [
    ("bagi hasil", ("expense-other", "Lain-lain")),
    ("sharing owner", ("expense-other", "Lain-lain")),
    ("pendapatan sewa", ("expense-other", "Lain-lain")),
    ("kembali deposit", ("expense-other", "Lain-lain")),
    ("biaya adm", ("expense-other", "Lain-lain")),
    ("adm bank", ("expense-other", "Lain-lain")),
    ("pajak bunga", ("expense-other", "Lain-lain")),
    ("hosting", ("expense-other", "Lain-lain")),
    ("domain", ("expense-other", "Lain-lain")),
    ("pulsa", ("expense-other", "Lain-lain")),
    ("refund", ("expense-other", "Lain-lain")),
    ("kompensasi", ("expense-other", "Lain-lain")),
    ("kelebihan transfer", ("expense-other", "Lain-lain")),
    ("sumbangan", ("expense-other", "Lain-lain")),
    ("extra bed", ("expense-other", "Lain-lain")),
    ("pest", ("expense-pest-control", "Pest Control")),
    ("laundry", ("expense-laundry", "Laundry")),
    ("internet", ("expense-internet", "WiFi / Internet")),
    ("indihome", ("expense-internet", "WiFi / Internet")),
    ("listrik", ("expense-electricity", "Listrik")),
    ("token", ("expense-electricity", "Listrik")),
    ("gaji", ("expense-salary", "Gaji")),
    ("pompa", ("expense-repair", "Perbaikan")),
    ("service", ("expense-repair", "Perbaikan")),
    ("perbaikan", ("expense-repair", "Perbaikan")),
    ("renov", ("expense-repair", "Perbaikan")),
    ("kunci", ("expense-repair", "Perbaikan")),
    ("lampu", ("expense-repair", "Perbaikan")),
    ("pipa", ("expense-repair", "Perbaikan")),
    ("galon", ("expense-amenities", "Amenities")),
    ("aqua", ("expense-amenities", "Amenities")),
    ("gas", ("expense-amenities", "Amenities")),
    ("baygon", ("expense-amenities", "Amenities")),
    ("tissue", ("expense-amenities", "Amenities")),
    ("ipl", ("expense-dues", "Iuran")),
    ("iuran", ("expense-dues", "Iuran")),
    ("keamanan", ("expense-dues", "Iuran")),
    ("sampah", ("expense-dues", "Iuran")),
    ("pbb", ("expense-tax", "Pajak")),
]

# tidak ditempelkan ke properti + ditandai di keterangan
LUAR_OPERASIONAL = ["bagi hasil", "sharing owner", "pendapatan sewa", "kembali deposit"]
TANDA_LUAR = " (di luar operasional)"
PETA_BY_UPPER = {kunci.upper(): nilai for kunci, nilai in PETA.items()}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_empty(value):
    return clean(value) in ("", "None", "-")


def to_iso(value):
    """Terima '2026-02-01', '01/02/2026', atau serial tanggal Excel."""
    text = clean(value)
    if not text:
        return ""
    match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", text)
    if match:
        return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    match = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", text)
    if match:
        return f"{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}"
    try:  # serial tanggal Excel
        serial = float(text)
    except ValueError:
        return ""
    if 20000 <= serial <= 80000:
        import datetime
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))).isoformat()
    return ""


def to_num(value):
    """Angka rupiah: '1.234.567' -> 1234567. Pecahan (pajak bunga) tetap dibiarkan."""
    text = clean(value)
    if not text:
        return 0.0
    if re.match(r"^-?\d{1,3}(\.\d{3})+$", text):
        text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def num_sql(value):
    """Tulis angka: bulat tanpa desimal, pecahan apa adanya."""
    if abs(value - round(value)) < 0.005:
        return str(int(round(value)))
    return repr(round(value, 2))


def sql_text(value):
    return "'" + clean(value).replace("'", "''") + "'"


def rupiah(value):
    """Format gaya Indonesia: 1500000 -> '1.500.000', 53.44 -> '53,44'."""
    text = f"{value:,.2f}"
    text = text.replace(",", "@").replace(".", ",").replace("@", ".")
    return text[:-3] if text.endswith(",00") else text


def read_rows(path, sheet="", layout="lebar"):
    spec = importlib.util.spec_from_file_location("baca", READER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = []
    for sheet_name, sheet_rows in module.read_sheets(path):
        if sheet and clean(sheet_name).lower() != clean(sheet).lower():
            continue
        for index, raw in enumerate(sheet_rows, start=1):
            values = list(raw) + [""] * 10
            if all(is_empty(values[column]) for column in range(10)):
                continue
            if layout == "ringkas":
                masuk, keluar = 0.0, to_num(values[4])
                detail, catatan, penerima = "", "", ""
            else:
                masuk, keluar = to_num(values[7]), to_num(values[8])
                detail = "" if is_empty(values[4]) else clean(values[4])
                catatan = "" if is_empty(values[5]) else clean(values[5])
                penerima = "" if is_empty(values[6]) else clean(values[6])
            result.append({
                "baris": index,
                "tanggal": to_iso(values[0]),
                "kode": clean(values[1]),
                "kategori": clean(values[2]),
                "keterangan": clean(values[3]),
                "detail": detail,
                "catatan": catatan,
                "penerima": penerima,
                "masuk": masuk,
                "keluar": keluar,
            })
    return result


def kategori_untuk(row):
    kunci = row["kategori"].lower()
    if kunci in PETA_KAT:
        return PETA_KAT[kunci]
    gabungan = " ".join([row["keterangan"], row["detail"], row["catatan"], row["kategori"]]).lower()
    for kata, kategori in FALLBACK:
        if kata in gabungan:
            return kategori
    return ("expense-other", "Lain-lain")


def keterangan_lengkap(row):
    bagian = [row["keterangan"]]
    for tambahan in (row["detail"], row["catatan"]):
        if tambahan and tambahan not in bagian:
            bagian.append(tambahan)
    return " · ".join([teks for teks in bagian if teks])


def kode_properti(row):
    return PETA_BY_UPPER.get(row["kode"].upper(), "")


def klasifikasi(rows, pendapatan_sewa="skip"):
    hasil = []
    dilewati = []
    for row in rows:
        if not row["tanggal"]:
            dilewati.append({**row, "alasan": "tanggal tidak terbaca / baris judul"})
            continue
        gabungan = " ".join([row["keterangan"], row["detail"], row["catatan"]]).lower()
        if row["keluar"] < 0:  # uang masuk
            hasil.append({**row, "kind": "income", "category_id": "income-other",
                          "category_name": "Pemasukan Lain", "amount": abs(row["keluar"]),
                          "kode_properti": "", "luar": True,
                          "keterangan_akhir": keterangan_lengkap(row) + " (uang masuk)"})
            continue
        if row["keluar"] > 0:
            category_id, category_name = kategori_untuk(row)
            luar = any(kata in gabungan for kata in LUAR_OPERASIONAL)
            hasil.append({**row, "kind": "expense", "category_id": category_id,
                          "category_name": category_name, "amount": row["keluar"],
                          "kode_properti": "" if luar else kode_properti(row), "luar": luar,
                          "keterangan_akhir": keterangan_lengkap(row) + (TANDA_LUAR if luar else "")})
            continue
        if row["masuk"] > 0:
            if "pendapatan sewa" in gabungan and pendapatan_sewa == "skip":
                dilewati.append({**row, "alasan": "pemasukan sewa (sudah ada di data booking)"})
                continue
            hasil.append({**row, "kind": "income", "category_id": "income-other",
                          "category_name": "Pemasukan Lain", "amount": row["masuk"],
                          "kode_properti": "", "luar": False,
                          "keterangan_akhir": keterangan_lengkap(row)})
            continue
        dilewati.append({**row, "alasan": "nilai 0"})
    return hasil, dilewati


def properti_sql(kode):
    if not kode:
        return "NULL, ''"
    if not re.match(r"^[A-Za-z0-9\-]+$", kode):
        return "NULL, ''"
    kode_sql = sql_text(kode)
    return (
        f"(SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties "
        f"WHERE UPPER(property_code) = UPPER({kode_sql})), "
        f"COALESCE((SELECT name FROM properties WHERE UPPER(property_code) = UPPER({kode_sql})), '')"
    )


def build_sql(rows, marker, label):
    bagian = []
    bagian.append("-- " + "=" * 60)
    bagian.append(f"-- IMPORT PENGELUARAN DARI BUKU KAS - {label}")
    bagian.append("-- Dibuat otomatis oleh tools/siapkan-pengeluaran-buku-kas.py")
    bagian.append("-- Jalankan di D1 Console, database: your-home-checkin")
    bagian.append("--")
    pengeluaran = [r for r in rows if r["kind"] == "expense"]
    pemasukan = [r for r in rows if r["kind"] == "income"]
    bagian.append(f"-- {len(pengeluaran)} pengeluaran | Rp {rupiah(sum(r['amount'] for r in pengeluaran))}")
    if pemasukan:
        bagian.append(f"-- {len(pemasukan)} pemasukan (uang masuk) | Rp {rupiah(sum(r['amount'] for r in pemasukan))}")
    bagian.append(f"-- Penanda data: created_by = '{marker}'.")
    bagian.append("-- Aman dijalankan ulang: baris berpenanda ini dihapus dulu, lalu ditulis lagi.")
    bagian.append("-- Keterangan bertanda '(di luar operasional)' tidak dihitung sebagai beban properti.")
    bagian.append("-- " + "=" * 60)
    bagian.append("")
    bagian.append(f"DELETE FROM finance_entries WHERE created_by = {sql_text(marker)};")
    bagian.append("")
    kolom = ("id, kind, category_id, category_name, property_id, property_name, entry_date, amount, "
             "description, payee, recurrence, created_by, created_at")
    nomor = defaultdict(lambda: {"expense": 0, "income": 0})
    for row in rows:
        bulan = row["tanggal"][:7].replace("-", "")
        nomor[bulan][row["kind"]] += 1
        awal_id = "exp" if row["kind"] == "expense" else "inc"
        entry_id = f"{awal_id}-{bulan}-{nomor[bulan][row['kind']]:04d}"
        nilai = [sql_text(entry_id), sql_text(row["kind"]), sql_text(row["category_id"]),
                 sql_text(row["category_name"]), properti_sql(row["kode_properti"]),
                 sql_text(row["tanggal"]), num_sql(row["amount"]),
                 sql_text(row["keterangan_akhir"]), sql_text(row["penerima"]),
                 "'once'", sql_text(marker), "datetime('now')"]
        bagian.append(f"INSERT OR IGNORE INTO finance_entries ({kolom}) VALUES ({', '.join(nilai)});")
    bagian.append("")
    bagian.append("-- PEMERIKSAAN - jalankan terpisah (D1 hanya menampilkan hasil query pertama)")
    bagian.append(f"SELECT COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM finance_entries WHERE created_by = {sql_text(marker)};")
    bagian.append("")
    bagian.append(f"SELECT entry_date, description, amount FROM finance_entries WHERE created_by = {sql_text(marker)} ORDER BY entry_date;")
    return "\n".join(bagian) + "\n"


def strip_comments(sql):
    return "\n".join(
        line for line in sql.split("\n")
        if line.strip() and not line.strip().startswith("--")
    ) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", required=True)
    parser.add_argument("--sheet", default="")
    parser.add_argument("--layout", choices=["lebar", "ringkas"], default="lebar",
                        help="lebar = kolom H masuk / I keluar (default); ringkas = kolom E jumlah")
    parser.add_argument("--prefix", default="import-pengeluaran")
    parser.add_argument("--bulan-per-file", type=int, default=2,
                        help="jumlah bulan dalam satu file (default 2)")
    parser.add_argument("--pendapatan-sewa", choices=["skip", "impor"], default="skip",
                        help="pemasukan sewa: dilewati (sudah ada di data booking) atau diimpor")
    parser.add_argument("--plain", action="store_true", help="buang baris komentar")
    args = parser.parse_args()

    rows = read_rows(args.xlsx, args.sheet, args.layout)
    if not rows:
        print("Tidak ada baris data yang terbaca.")
        return 1

    hasil, dilewati = klasifikasi(rows, args.pendapatan_sewa)
    if not hasil:
        print("Tidak ada baris yang bisa diimpor.")
        return 1

    bulan = sorted({row["tanggal"][:7] for row in hasil if row["tanggal"]})
    kelompok = [bulan[i:i + args.bulan_per_file] for i in range(0, len(bulan), args.bulan_per_file)]
    output_dir = os.path.join(ROOT, "sql", "imports")
    os.makedirs(output_dir, exist_ok=True)

    ditulis = []
    for nomor, isi_bulan in enumerate(kelompok, start=1):
        bagian_rows = [row for row in hasil if row["tanggal"][:7] in isi_bulan]
        bulan_teks = [b.replace("-", "") for b in isi_bulan]
        marker = (f"import-pengeluaran-{bulan_teks[0]}" if len(bulan_teks) == 1
                  else f"import-pengeluaran-{bulan_teks[0]}-{bulan_teks[-1]}")
        label = f"{isi_bulan[0]} s.d. {isi_bulan[-1]}"
        rentang = "-".join(b.replace("-", "") for b in isi_bulan)
        if len(isi_bulan) == 1:
            rentang = isi_bulan[0].replace("-", "")
        nama = f"{args.prefix}-bagian{nomor}-{rentang}.sql" if len(kelompok) > 1 else f"{args.prefix}-{rentang}.sql"
        if args.plain:
            nama = nama.replace(".sql", "-tanpa-komentar.sql")
        path = os.path.join(output_dir, nama)
        sql = build_sql(bagian_rows, marker, label)
        if args.plain:
            sql = strip_comments(sql)
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(sql)
        ditulis.append((bagian_rows, marker, path))

    total_pengeluaran = sum(r["amount"] for r in hasil if r["kind"] == "expense")
    total_pemasukan = sum(r["amount"] for r in hasil if r["kind"] == "income")
    print(f"Terbaca          : {len(rows)} baris")
    print(f"Dipakai          : {len(hasil)} baris ({len(hasil) - sum(1 for r in hasil if r['kind'] == 'income')} pengeluaran, {sum(1 for r in hasil if r['kind'] == 'income')} pemasukan)")
    print(f"Dilewati         : {len(dilewati)} baris")
    print(f"Pengeluaran      : Rp {rupiah(total_pengeluaran)}")
    print(f"Pemasukan        : Rp {rupiah(total_pemasukan)}")
    print(f"Netto            : Rp {rupiah(total_pengeluaran - total_pemasukan)}")
    print(f"Bagian           : {len(ditulis)} file")
    for bagian_rows, marker, path in ditulis:
        ukuran = os.path.getsize(path) / 1024
        exp = sum(r["amount"] for r in bagian_rows if r["kind"] == "expense")
        inc = sum(r["amount"] for r in bagian_rows if r["kind"] == "income")
        print(f"  {os.path.basename(path)}")
        print(f"      {len(bagian_rows)} baris, {ukuran:.0f} KB, penanda {marker}")
        print(f"      pengeluaran Rp {rupiah(exp)} | pemasukan Rp {rupiah(inc)}")
    print("Per bulan        :")
    per_bulan = defaultdict(lambda: [0, 0.0, 0.0])
    for row in hasil:
        slot = per_bulan[row["tanggal"][:7]]
        if row["kind"] == "expense":
            slot[0] += 1
            slot[1] += row["amount"]
        else:
            slot[2] += row["amount"]
    for kunci in sorted(per_bulan):
        jumlah, keluar, masuk = per_bulan[kunci]
        print(f"  {kunci}: {jumlah} baris | pengeluaran Rp {rupiah(keluar)} | pemasukan Rp {rupiah(masuk)}")
    print("Per kategori     :")
    per_kategori = defaultdict(lambda: [0, 0.0])
    for row in hasil:
        if row["kind"] != "expense":
            continue
        per_kategori[row["category_name"]][0] += 1
        per_kategori[row["category_name"]][1] += row["amount"]
    for kunci, (jumlah, nilai) in sorted(per_kategori.items(), key=lambda item: -item[1][1]):
        print(f"  {kunci:<16} {jumlah:>4} baris | Rp {rupiah(nilai)}")
    print("Per properti     :")
    per_properti = defaultdict(lambda: [0, 0.0])
    for row in hasil:
        if row["kind"] != "expense":
            continue
        per_properti[row["kode_properti"] or "(tanpa properti)"][0] += 1
        per_properti[row["kode_properti"] or "(tanpa properti)"][1] += row["amount"]
    for kunci, (jumlah, nilai) in sorted(per_properti.items(), key=lambda item: -item[1][1]):
        print(f"  {kunci:<16} {jumlah:>4} baris | Rp {rupiah(nilai)}")
    luar = [row for row in hasil if row["luar"] and row["kind"] == "expense"]
    if luar:
        print(f"Di luar operasional (property_id NULL): {len(luar)} baris, Rp {rupiah(sum(r['amount'] for r in luar))}")
        for row in luar:
            print(f"  {row['tanggal']} | {row['keterangan']} | Rp {rupiah(row['amount'])}")
    if dilewati:
        print("Dilewati:")
        for row in dilewati[:20]:
            print(f"  baris {row['baris']} | {row['tanggal']} | {row['keterangan']} | {row['alasan']}")
        if len(dilewati) > 20:
            print(f"  ... dan {len(dilewati) - 20} baris lain")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
