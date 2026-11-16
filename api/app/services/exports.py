"""CSV and Excel exports of the Data table, and the printable PDF job card.

Exports hold what the user sees in the Data table: the same columns, the same headers, in the
same order. Photos are never included. Every text cell is neutralised against spreadsheet
formula injection: a crew member typing `=HYPERLINK(...)` into a remark must not be able to run
it on an admin's machine.
"""

import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape as xml_escape

from app.models import FormField

EXPORT_LIMIT = 20_000
DANGEROUS_START = ("=", "+", "-", "@", "\t", "\r", "\n")


def neutralise(text: str) -> str:
    """Prefix an apostrophe so Excel and Sheets show the text instead of evaluating it."""
    return "'" + text if text.startswith(DANGEROUS_START) else text


def header(field: FormField) -> str:
    return field.table_label or field.label


def _as_date(value: str) -> str:
    try:
        return date.fromisoformat(value).strftime("%d-%m-%Y")
    except ValueError:
        return value


def _number(value: object) -> Decimal | None:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return number if number.is_finite() else None


def display(field: FormField, value: object) -> str:
    """Text as shown on screen. Empty stays empty (the app shows a dash; a spreadsheet should not)."""
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if field.type == "date":
        return _as_date(str(value))
    if field.key == "status":
        return str(value).capitalize()  # matches the Open / Closed pills in the app
    return str(value)


def _cell(field: FormField, value: object):
    """A typed value for Excel: real numbers stay numbers, everything else is safe text."""
    if value is None or value == "":
        return None
    if field.type == "number" and (number := _number(value)) is not None:
        return float(number) if field.key != "job_no" else int(number)
    return neutralise(display(field, value))


def to_csv(jobs: list[dict], columns: list[FormField]) -> bytes:
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow([neutralise(header(c)) for c in columns])
    for job in jobs:
        row = []
        for column in columns:
            value = job["values"].get(column.key)
            number = _number(value) if column.type == "number" and value not in (None, "") else None
            row.append(format(number.normalize() if number == number.to_integral() else number, "f") if number is not None
                       else neutralise(display(column, value)))
        writer.writerow(row)
    return b"\xef\xbb\xbf" + out.getvalue().encode("utf-8")  # BOM so Excel reads UTF-8 correctly


def to_xlsx(jobs: list[dict], columns: list[FormField], sheet_name: str = "Jobs") -> bytes:
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet(title=sheet_name[:31])
    sheet.freeze_panes = "A2"

    def text_cell(text: str) -> WriteOnlyCell:
        cell = WriteOnlyCell(sheet, value=text)
        cell.data_type = "s"  # a string, never a formula, whatever it starts with
        return cell

    sheet.append([text_cell(neutralise(header(c))) for c in columns])
    for job in jobs:
        row = []
        for column in columns:
            value = _cell(column, job["values"].get(column.key))
            row.append(text_cell(value) if isinstance(value, str) else value)
        sheet.append(row)
    out = io.BytesIO()
    workbook.save(out)
    return out.getvalue()


# ------------------------------------------------------------------ PDF job card


def job_card_pdf(workspace_name: str, job: dict, fields: list[FormField]) -> bytes:
    """One A4 page: title block, then the card fields grouped as the form groups them."""
    values = job["values"]
    on_card = [f for f in fields if f.on_card and not f.is_hidden and f.type != "photo"]
    shown = on_card or [f for f in fields if f.on_form and not f.is_hidden and f.type != "photo"]
    shown.sort(key=lambda f: (f.group_position if f.group_position is not None else 0, f.position))

    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, alignment=0, spaceAfter=2)
    small = ParagraphStyle("s", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#4A5561"))
    group_style = ParagraphStyle("g", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11, spaceBefore=10, spaceAfter=4)
    cell = ParagraphStyle("c", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=13)
    label_style = ParagraphStyle("l", parent=cell, textColor=colors.HexColor("#4A5561"))

    def p(text: str, style) -> Paragraph:
        return Paragraph(xml_escape(text).replace("\n", "<br/>"), style)

    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"Job card {values.get('job_no', '')}", author=workspace_name)
    status = str(values.get("status", "")).capitalize()
    closed = f" · Closed on {_as_date(str(values['closed_at']))}" if values.get("closed_at") else ""
    story = [p(workspace_name, small), p(f"Job Card No. {values.get('job_no', '')}", title),
             p(f"Status: {status}{closed}", small), Spacer(1, 4 * mm)]

    groups: dict[str, list[FormField]] = {}
    for field in shown:
        groups.setdefault(field.group_name or "Details", []).append(field)
    for name, members in groups.items():
        story.append(p(name, group_style))
        rows = [[p(f.label, label_style), p(display(f, values.get(f.key)) or "—", cell)] for f in members]
        table = Table(rows, colWidths=[55 * mm, None])
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E6EA")),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(table)
    doc.build(story)
    return out.getvalue()
