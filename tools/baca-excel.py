"""
Baca file Excel (.xlsx) berisi data booking/pemasukan, lalu cetak isinya
sebagai teks berformat pipa (|) yang siap ditempel ke fitur
"Import Banyak Booking" pada Dashboard.

Cara pakai (dari folder c:\\xampp\\htdocs\\your_home):
    c:/python314/python.exe tools/baca-excel.py data-agustus.xlsx
    c:/python314/python.exe tools/baca-excel.py data-agustus.xlsx --sheet "Sheet1"

Catatan:
- File .xls (format lama) tidak didukung. Simpan ulang sebagai .xlsx atau .csv.
- Hanya memakai pustaka bawaan Python (zipfile + XML), tidak perlu memasang paket.
- Tanggal Excel (angka serial) otomatis dikonversi ke YYYY-MM-DD.
- Angka bergaya "Rp 1.818.000" atau "1.818.000" otomatis dibersihkan jadi angka.
- File ini hanya membaca; tidak mengubah berkas Excel maupun database.
"""

import argparse
import datetime
import re
import sys

import zipfile
import xml.etree.ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
EXCEL_EPOCH = datetime.datetime(1899, 12, 30)
BUILTIN_DATE_FORMATS = set(range(14, 23)) | set(range(27, 37)) | set(range(45, 48)) | set(range(50, 59))


def as_date(value):
    """Ubah nilai sel menjadi teks YYYY-MM-DD bila memungkinkan."""
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    text = str(value).strip()
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        return match.group(0)
    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", text)
    if match:
        day, month, year = (int(part) for part in match.groups())
        try:
            return datetime.date(year, month, day).isoformat()
        except ValueError:
            return text
    # Angka serial Excel (mis. 46234) hanya masuk akal pada rentang tahun 2000-2060.
    if re.fullmatch(r"\d{5}", text):
        serial = int(text)
        if 36526 <= serial <= 58454:
            return (EXCEL_EPOCH + datetime.timedelta(days=serial)).date().isoformat()
    return text


def as_amount(value):
    """Ambil angka murni dari sel yang mungkin berisi 'Rp 1.818.000'."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(int(round(value)))
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".")[0]
    digits = re.sub(r"\D", "", text)
    return digits or ""


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return as_date(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def column_index(reference):
    """A1 -> 1, B2 -> 2, AA3 -> 27."""
    letters = re.match(r"^[A-Z]+", str(reference or "").upper())
    if not letters:
        return 0
    value = 0
    for character in letters.group(0):
        value = value * 26 + (ord(character) - 64)
    return value


def serial_to_date(serial):
    """Angka serial Excel -> YYYY-MM-DD."""
    return (EXCEL_EPOCH + datetime.timedelta(days=float(serial))).date().isoformat()


def parse_date_styles(data):
    """Kumpulkan indeks cellXfs yang berformat tanggal dari styles.xml."""
    date_styles = set()
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return date_styles
    custom = {}
    for numfmt in root.findall(f".//{{{MAIN_NS}}}numFmts/{{{MAIN_NS}}}numFmt"):
        custom[str(numfmt.get("numFmtId"))] = numfmt.get("formatCode", "")
    for index, xf in enumerate(root.findall(f".//{{{MAIN_NS}}}cellXfs/{{{MAIN_NS}}}xf")):
        fmt_id = str(xf.get("numFmtId", "0"))
        if fmt_id.isdigit() and int(fmt_id) in BUILTIN_DATE_FORMATS:
            date_styles.add(index)
            continue
        code = custom.get(fmt_id, "")
        if code and re.search(r"yy|dd|mmm", code, re.IGNORECASE):
            date_styles.add(index)
    return date_styles


def read_sheets(path):
    """Baca .xlsx tanpa pustaka tambahan -> [(nama_sheet, [[sel, ...], ...]), ...]."""

    def tag(name):
        return f"{{{MAIN_NS}}}{name}"

    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall(tag("si")):
                shared.append("".join(node.text or "" for node in item.iter(tag("t"))))
        date_styles = parse_date_styles(archive.read("xl/styles.xml")) if "xl/styles.xml" in names else set()

        targets = []
        if "xl/workbook.xml" in names and "xl/_rels/workbook.xml.rels" in names:
            relations = {}
            for relation in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels")):
                relations[relation.get("Id")] = relation.get("Target", "")
            sheets = ET.fromstring(archive.read("xl/workbook.xml")).findall(f".//{{{MAIN_NS}}}sheets/{{{MAIN_NS}}}sheet")
            for sheet in sheets:
                target = relations.get(sheet.get(f"{{{REL_NS}}}id"), "").lstrip("/")
                if target:
                    targets.append((sheet.get("name"), target if target.startswith("xl/") else f"xl/{target}"))
        if not targets:
            targets = [
                (f"Sheet{index}", name)
                for index, name in enumerate(
                    sorted(name for name in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)), start=1
                )
            ]

        results = []
        for sheet_name, sheet_path in targets:
            if sheet_path not in names:
                continue
            rows = []
            for row in ET.fromstring(archive.read(sheet_path)).iter(tag("row")):
                cells = {}
                for cell in row:
                    position = column_index(cell.get("r")) or (max(cells) + 1 if cells else 1)
                    kind = cell.get("t")
                    style = cell.get("s")
                    text = ""
                    if kind == "s":
                        value = cell.find(tag("v"))
                        index = int(value.text) if value is not None and (value.text or "").isdigit() else None
                        text = shared[index] if index is not None and index < len(shared) else ""
                    elif kind == "inlineStr":
                        text = "".join(node.text or "" for node in cell.iter(tag("t")))
                    else:
                        value = cell.find(tag("v"))
                        text = value.text if value is not None and value.text is not None else ""
                        if text and style is not None and style.isdigit() and int(style) in date_styles:
                            try:
                                text = serial_to_date(text)
                            except (TypeError, ValueError, OverflowError):
                                pass
                    cells[position] = text
                if cells:
                    rows.append([cells.get(position, "") for position in range(1, max(cells) + 1)])
            results.append((sheet_name, rows))
        return results


def main():
    parser = argparse.ArgumentParser(description="Baca Excel dan cetak sebagai teks pipa.")
    parser.add_argument("path", help="Lokasi file .xlsx")
    parser.add_argument("--sheet", help="Nama sheet tertentu (opsional)")
    parser.add_argument("--date-columns", default="3,4", help="Nomor kolom tanggal (1-based), default 3,4")
    parser.add_argument("--amount-columns", default="7,8", help="Nomor kolom nominal (1-based), default 7,8")
    args = parser.parse_args()

    date_columns = {int(part) for part in args.date_columns.split(",") if part.strip()}
    amount_columns = {int(part) for part in args.amount_columns.split(",") if part.strip()}

    sheets = read_sheets(args.path)
    if args.sheet:
        sheets = [sheet for sheet in sheets if sheet[0] == args.sheet]
        if not sheets:
            print(f"# Sheet '{args.sheet}' tidak ditemukan.")
            return 1

    for sheet_name, rows in sheets:
        print(f"# ===== SHEET: {sheet_name} ({len(rows)} baris) =====")
        for row in rows:
            if all(str(cell).strip() == "" for cell in row):
                continue
            cells = []
            for index, value in enumerate(row, start=1):
                if index in date_columns:
                    cells.append(as_date(value))
                elif index in amount_columns:
                    cells.append(as_amount(value))
                else:
                    cells.append(cell_text(value))
            print(" | ".join(cells))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
