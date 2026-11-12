import csv
import io

from openpyxl import load_workbook

from tests.conftest import PASSWORD, signup

HEADERS = ["Date", "Job Card No", "Description", "Section", "Division", "Subdivision", "DTC", "Feeder No",
           "Status", "Close Date", "MO No", "MO Amount", "MO ID", "WO No", "W.O Amount", "Expenses"]


def add_job(client, wid, **values):
    body = {"date": "2026-10-30", "description": "Fix", "status": "open", **values}
    r = client.post(f"/workspaces/{wid}/jobs", json={"values": body})
    assert r.status_code == 201, r.text
    return r.json()


def parse_csv(content: bytes):
    assert content.startswith(b"\xef\xbb\xbf")
    return list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))


def test_csv_headers_equal_the_data_table_headers_in_order(client, electrical):
    add_job(client, electrical, mo_amount="1250.50", section="Westgate", division="North")
    r = client.get(f"/workspaces/{electrical}/jobs/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment")
    rows = parse_csv(r.content)
    assert rows[0] == HEADERS
    row = dict(zip(HEADERS, rows[1]))
    assert row["Date"] == "30-10-2026" and row["MO Amount"] == "1250.5" and row["Section"] == "Westgate"
    assert row["Close Date"] == ""  # empty stays empty in a file


def test_formulas_are_neutralised_in_csv_and_xlsx(client, electrical):
    evil = "=HYPERLINK(\"http://evil.example\",\"click\")"
    add_job(client, electrical, description=evil, dtc="+SUM(A1)", feeder_no="-2+3", mo_no="@cmd")
    rows = parse_csv(client.get(f"/workspaces/{electrical}/jobs/export").content)
    cells = dict(zip(rows[0], rows[1]))
    for header in ("Description", "DTC", "Feeder No", "MO No"):
        assert cells[header].startswith("'"), (header, cells[header])

    book = load_workbook(io.BytesIO(client.get(f"/workspaces/{electrical}/jobs/export", params={"format": "xlsx"}).content))
    sheet = book.active
    assert [c.value for c in sheet[1]] == HEADERS
    for cell in sheet[2]:
        assert cell.data_type != "f", cell.value  # nothing in the file is a formula
    description = sheet[2][HEADERS.index("Description")]
    assert description.value.startswith("'=HYPERLINK")


def test_xlsx_keeps_numbers_numeric_and_negative_amounts_are_not_mangled(client, electrical):
    add_job(client, electrical, mo_amount="-40.25", wo_amount="1000")
    sheet = load_workbook(io.BytesIO(client.get(f"/workspaces/{electrical}/jobs/export", params={"format": "xlsx"}).content)).active
    row = {h: c.value for h, c in zip(HEADERS, sheet[2])}
    assert row["MO Amount"] == -40.25 and row["W.O Amount"] == 1000 and row["Job Card No"] == 1
    csv_row = dict(zip(HEADERS, parse_csv(client.get(f"/workspaces/{electrical}/jobs/export").content)[1]))
    assert csv_row["MO Amount"] == "-40.25"


def test_export_follows_search_filters_and_sort(client, electrical):
    add_job(client, electrical, description="alpha", division="North")
    add_job(client, electrical, description="bravo", division="South")
    add_job(client, electrical, description="charlie", division="North")
    rows = parse_csv(client.get(f"/workspaces/{electrical}/jobs/export", params={"f.division": "North", "sort": "description", "order": "asc"}).content)
    assert [r[HEADERS.index("Description")] for r in rows[1:]] == ["alpha", "charlie"]
    rows = parse_csv(client.get(f"/workspaces/{electrical}/jobs/export", params={"q": "bravo"}).content)
    assert len(rows) == 2
    assert client.get(f"/workspaces/{electrical}/jobs/export", params={"sort": "x; drop table jobs"}).status_code == 422


def test_hidden_columns_and_deleted_jobs_are_left_out(client, electrical):
    job = add_job(client, electrical, description="gone")
    add_job(client, electrical, description="kept")
    client.delete(f"/workspaces/{electrical}/jobs/{job['id']}")
    dtc = next(f for f in client.get(f"/workspaces/{electrical}/fields").json() if f["key"] == "dtc")
    client.patch(f"/workspaces/{electrical}/fields/{dtc['id']}", json={"is_hidden": True})
    rows = parse_csv(client.get(f"/workspaces/{electrical}/jobs/export").content)
    assert "DTC" not in rows[0] and len(rows) == 2 and rows[1][2] == "kept"


def test_only_supervisors_and_admins_can_export(make_client, client, electrical):
    admin = client
    me = admin.get("/auth/me").json()
    for role in ("crew", "supervisor"):
        email = f"{role}@example.com"
        admin.post(f"/workspaces/{electrical}/members", json={"email": email, "name": role, "role": role, "password": PASSWORD})
        person = make_client()
        token = person.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
        person.headers["Authorization"] = f"Bearer {token}"
        expected = 403 if role == "crew" else 200
        assert person.get(f"/workspaces/{electrical}/jobs/export").status_code == expected, role
    assert me["workspaces"][0]["role"] == "admin"


def test_job_card_pdf_is_a_pdf_for_that_job_only(client, electrical):
    job = add_job(client, electrical, description="Replace 11kV cable", remarks="line <b>bold</b> & more")
    r = client.get(f"/workspaces/{electrical}/jobs/{job['id']}/card")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(r.content) > 1500
    assert client.get(f"/workspaces/{electrical}/jobs/00000000-0000-0000-0000-000000000000/card").status_code == 404


def test_markup_in_a_value_cannot_break_the_pdf(client, electrical):
    job = add_job(client, electrical, description="<para><font size='999'>x</font>&nbsp;</para> <unclosed", remarks="</b></i>" * 20)
    assert client.get(f"/workspaces/{electrical}/jobs/{job['id']}/card").status_code == 200


def test_neutralise_covers_every_formula_trigger():
    from app.services.exports import neutralise

    for text in ("=1+1", "+1", "-1", "@x", "\tx", "\rx", "\nx"):
        assert neutralise(text) == "'" + text
    assert neutralise("plain") == "plain" and neutralise("") == ""
