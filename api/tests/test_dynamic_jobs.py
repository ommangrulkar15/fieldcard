"""Phase 1: the dynamic-field core, proven against a real Postgres."""

from concurrent.futures import ThreadPoolExecutor

from app.services import jobs as job_service

# The reference client's table headers, in order (Actions is a UI-only column).
EXPECTED_HEADERS = [
    "Date", "Job Card No", "Description", "Section", "Division", "Subdivision", "DTC", "Feeder No",
    "Status", "Close Date", "MO No", "MO Amount", "MO ID", "WO No", "W.O Amount", "Expenses",
]

FULL_JOB = {
    "date": "2026-10-30", "description": "120 sq mm cable, 12 m", "status": "closed",
    "section": "Westgate", "division": "North", "dtc": "207", "feeder_no": "F-11",
    "mo_no": "4501", "mo_amount": "12500.50", "mo_id": "MO-9", "wo_no": "7801", "wo_amount": "9800",
    "job_expenses": "Cable 12 m, labour 2 men", "period": "Oct 2026", "agency_name": "Northgate Electricals",
    "subdivision": "North East", "fault_location": "Pole 14", "remarks": "Done",
    "agency_rep": "A. Rao", "line_staff": "S. Khan", "section_officer": "P. Iyer", "subdivision_officer": "D. Nair",
}


def post_job(client, wid, **values):
    return client.post(f"/workspaces/{wid}/jobs", json={"values": values})


def column_headers(client, wid):
    fields = client.get(f"/workspaces/{wid}/fields").json()
    columns = sorted((f for f in fields if f["table_position"] is not None), key=lambda f: f["table_position"])
    return [f["table_label"] or f["label"] for f in columns]


# ------------------------------------------------------------------ template fidelity


def test_electrical_template_matches_reference_layout(client, electrical):
    fields = client.get(f"/workspaces/{electrical}/fields").json()
    on_form = [f for f in fields if f["on_form"]]
    assert len(on_form) == 24
    assert column_headers(client, electrical) == EXPECTED_HEADERS
    core = {f["key"] for f in fields if f["is_core"]}
    assert core == {"date", "job_no", "description", "status", "closed_at"}


def test_all_24_fields_round_trip(client, electrical):
    created = post_job(client, electrical, **FULL_JOB)
    assert created.status_code == 201, created.text
    job = client.get(f"/workspaces/{electrical}/jobs/{created.json()['id']}").json()
    values = job["values"]
    for key, expected in FULL_JOB.items():
        if key in ("mo_amount", "wo_amount"):
            continue
        assert values[key] == expected, key
    assert values["mo_amount"] == "12500.5"  # exact decimal, trailing zero normalised
    assert values["wo_amount"] == "9800"
    assert values["job_no"] == 1
    assert values["closed_at"]  # set by the system when the job is closed


# ------------------------------------------------------------------ validation


def test_required_and_type_errors_are_reported_per_field(client, electrical):
    response = post_job(client, electrical, mo_amount="abc", division="East", unknown_thing="x")
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert errors["mo_amount"] == "Must be a number"
    assert errors["division"] == "Pick one of the listed options"
    assert errors["unknown_thing"] == "Unknown field"
    assert errors["description"] == "Required"
    assert errors["date"] == "Required"


def test_number_rejects_infinity_and_bool(client, electrical):
    base = {"date": "2026-10-30", "description": "x", "status": "open"}
    assert post_job(client, electrical, mo_amount="Infinity", **base).status_code == 422
    assert post_job(client, electrical, mo_amount="NaN", **base).status_code == 422
    assert post_job(client, electrical, mo_amount=True, **base).status_code == 422
    assert post_job(client, electrical, mo_amount="1.23456", **base).status_code == 422  # > 4 decimals


# ------------------------------------------------------------------ sorting, filtering, search


def seed_amounts(client, wid, amounts):
    for i, amount in enumerate(amounts, start=1):
        r = post_job(client, wid, date=f"2026-10-{i:02d}", description=f"job {i}", status="open", mo_amount=str(amount),
                     division="North" if i % 2 else "South", dtc=f"DTC-{i}")
        assert r.status_code == 201, r.text


def test_numeric_sort_is_numeric_not_alphabetical(client, electrical):
    seed_amounts(client, electrical, [9, 10, 100, 2.5])
    items = client.get(f"/workspaces/{electrical}/jobs?sort=mo_amount&order=asc").json()["items"]
    assert [i["values"]["mo_amount"] for i in items] == ["2.5", "9", "10", "100"]
    items = client.get(f"/workspaces/{electrical}/jobs?sort=mo_amount&order=desc").json()["items"]
    assert [i["values"]["mo_amount"] for i in items] == ["100", "10", "9", "2.5"]


def test_filter_by_choice_range_and_status(client, electrical):
    seed_amounts(client, electrical, [100, 200, 300, 400])
    north = client.get(f"/workspaces/{electrical}/jobs?f.division=North").json()
    assert north["total"] == 2
    ranged = client.get(f"/workspaces/{electrical}/jobs?f.mo_amount=150..350").json()
    assert sorted(i["values"]["mo_amount"] for i in ranged["items"]) == ["200", "300"]
    both = client.get(f"/workspaces/{electrical}/jobs?f.division=South&f.mo_amount=..250").json()
    assert both["total"] == 1
    assert client.get(f"/workspaces/{electrical}/jobs?f.status=closed").json()["total"] == 0


def test_search_matches_custom_fields_and_treats_wildcards_literally(client, electrical):
    post_job(client, electrical, date="2026-10-01", description="HRC fuse", status="open", dtc="207")
    post_job(client, electrical, date="2026-10-02", description="100% done_ok", status="open")
    assert client.get(f"/workspaces/{electrical}/jobs?q=207").json()["total"] == 1
    assert client.get(f"/workspaces/{electrical}/jobs?q=fuse").json()["total"] == 1
    assert client.get(f"/workspaces/{electrical}/jobs?q=%25").json()["total"] == 1  # only the real '%'
    assert client.get(f"/workspaces/{electrical}/jobs?q=done_ok").json()["total"] == 1
    assert client.get(f"/workspaces/{electrical}/jobs?q=d_ne").json()["total"] == 0  # '_' is not a wildcard


def test_pagination_is_stable(client, electrical):
    seed_amounts(client, electrical, list(range(1, 8)))
    seen = []
    for page in (1, 2, 3):
        body = client.get(f"/workspaces/{electrical}/jobs?page={page}&page_size=3").json()
        assert body["total"] == 7
        seen += [i["id"] for i in body["items"]]
    assert len(seen) == len(set(seen)) == 7


# ------------------------------------------------------------------ injection


def test_hostile_keys_never_reach_sql(client, electrical, db):
    seed_amounts(client, electrical, [1, 2])
    nasty = "x'); DROP TABLE jobs;--"
    for url in (
        f"/workspaces/{electrical}/jobs?sort={nasty}",
        f"/workspaces/{electrical}/jobs?f.{nasty}=1",
        f"/workspaces/{electrical}/jobs?sort=data",
        f"/workspaces/{electrical}/jobs?sort=deleted_at",
        f"/workspaces/{electrical}/jobs?f.photos=1",
    ):
        assert client.get(url).status_code == 422, url
    assert client.get(f"/workspaces/{electrical}/jobs").json()["total"] == 2  # table still there
    # A hostile *value* is just data.
    assert client.get(f"/workspaces/{electrical}/jobs", params={"f.division": "North'; DROP TABLE jobs;--"}).json()["total"] == 0


def test_field_keys_are_validated(client, blank):
    for key in ("Bad Key", "1abc", "a-b", "x'); drop", "A", "", "a" * 41):
        r = client.post(f"/workspaces/{blank}/fields", json={"key": key, "label": "L", "type": "text"})
        assert r.status_code == 422, key


# ------------------------------------------------------------------ numbering


def test_job_numbers_are_sequential_and_manual_duplicates_conflict(client, blank):
    base = {"date": "2026-10-30", "description": "x", "status": "open"}
    numbers = [post_job(client, blank, **base).json()["values"]["job_no"] for _ in range(3)]
    assert numbers == [1, 2, 3]
    dup = post_job(client, blank, job_no=2, **base)
    assert dup.status_code == 409
    jump = post_job(client, blank, job_no=50, **base)
    assert jump.json()["values"]["job_no"] == 50
    assert post_job(client, blank, **base).json()["values"]["job_no"] == 51  # counter moved past the manual number


def test_concurrent_creates_never_collide(session_factory, client, blank):
    import uuid

    wid = uuid.UUID(blank)

    def create(i):
        with session_factory() as session:
            return job_service.create_job(
                session, wid, {"date": "2026-10-30", "description": f"job {i}", "status": "open"}
            )["values"]["job_no"]

    with ThreadPoolExecutor(max_workers=12) as pool:
        numbers = sorted(pool.map(create, range(40)))
    assert numbers == list(range(1, 41))


# ------------------------------------------------------------------ lifecycle


def test_closing_sets_close_date_and_reopening_clears_it(client, blank):
    base = {"date": "2026-10-30", "description": "x"}
    job = post_job(client, blank, status="open", **base).json()
    assert "closed_at" not in job["values"]
    closed = client.patch(f"/workspaces/{blank}/jobs/{job['id']}", json={"values": {"status": "closed"}}).json()
    assert closed["values"]["closed_at"]
    reopened = client.patch(f"/workspaces/{blank}/jobs/{job['id']}", json={"values": {"status": "open"}}).json()
    assert "closed_at" not in reopened["values"]


def test_soft_delete_hides_the_job_and_frees_nothing_automatically(client, blank):
    base = {"date": "2026-10-30", "description": "x", "status": "open"}
    job = post_job(client, blank, **base).json()
    assert client.delete(f"/workspaces/{blank}/jobs/{job['id']}").status_code == 204
    assert client.get(f"/workspaces/{blank}/jobs/{job['id']}").status_code == 404
    assert client.get(f"/workspaces/{blank}/jobs").json()["total"] == 0
    assert post_job(client, blank, **base).json()["values"]["job_no"] == 2  # numbers are never reused automatically


def test_patch_can_clear_an_optional_field_but_not_a_required_one(client, electrical):
    job = post_job(client, electrical, date="2026-10-30", description="x", status="open", dtc="207").json()
    url = f"/workspaces/{electrical}/jobs/{job['id']}"
    cleared = client.patch(url, json={"values": {"dtc": ""}}).json()
    assert "dtc" not in cleared["values"]
    assert client.patch(url, json={"values": {"description": ""}}).status_code == 422


# ------------------------------------------------------------------ hide, restore, options


def test_hiding_a_field_keeps_old_values_and_blocks_new_writes(client, electrical):
    job = post_job(client, electrical, date="2026-10-30", description="x", status="open", mo_id="MO-9").json()
    fields = {f["key"]: f for f in client.get(f"/workspaces/{electrical}/fields").json()}
    patch = client.patch(f"/workspaces/{electrical}/fields/{fields['mo_id']['id']}", json={"is_hidden": True})
    assert patch.status_code == 200
    shown = client.get(f"/workspaces/{electrical}/jobs/{job['id']}").json()["values"]
    assert "mo_id" not in shown  # hidden from the app
    rejected = post_job(client, electrical, date="2026-10-30", description="y", status="open", mo_id="MO-10")
    assert rejected.status_code == 422
    client.patch(f"/workspaces/{electrical}/fields/{fields['mo_id']['id']}", json={"is_hidden": False})
    restored = client.get(f"/workspaces/{electrical}/jobs/{job['id']}").json()["values"]
    assert restored["mo_id"] == "MO-9"  # the data was never lost


def test_core_fields_cannot_be_hidden_and_key_or_type_cannot_change(client, electrical):
    fields = {f["key"]: f for f in client.get(f"/workspaces/{electrical}/fields").json()}
    date_url = f"/workspaces/{electrical}/fields/{fields['date']['id']}"
    assert client.patch(date_url, json={"is_hidden": True}).status_code == 422
    assert client.patch(date_url, json={"required": False}).status_code == 422
    dtc_url = f"/workspaces/{electrical}/fields/{fields['dtc']['id']}"
    assert client.patch(dtc_url, json={"type": "number"}).status_code == 422
    assert client.patch(dtc_url, json={"key": "other"}).status_code == 422
    assert client.patch(dtc_url, json={"label": "Distribution Transformer"}).json()["label"] == "Distribution Transformer"


def test_removed_options_are_archived_so_old_jobs_stay_valid(client, electrical):
    fields = {f["key"]: f for f in client.get(f"/workspaces/{electrical}/fields").json()}
    division = fields["division"]
    job = post_job(client, electrical, date="2026-10-30", description="x", status="open", division="South").json()
    url = f"/workspaces/{electrical}/fields/{division['id']}"
    updated = client.patch(url, json={"options": ["North", "East"]}).json()
    by_value = {o["value"]: o["archived"] for o in updated["options"]}
    assert by_value == {"North": False, "East": False, "South": True}
    assert client.get(f"/workspaces/{electrical}/jobs/{job['id']}").json()["values"]["division"] == "South"
    rejected = post_job(client, electrical, date="2026-10-30", description="y", status="open", division="South")
    assert rejected.status_code == 422  # archived options cannot be chosen again


def test_admin_adds_a_custom_field_and_crew_can_use_it(client, electrical):
    r = client.post(f"/workspaces/{electrical}/fields", json={
        "key": "shift", "label": "Shift", "type": "dropdown", "options": ["Morning", "Evening", "Night"],
        "table_position": 17,
    })
    assert r.status_code == 201, r.text
    job = post_job(client, electrical, date="2026-10-30", description="x", status="open", shift="Night")
    assert job.status_code == 201
    assert client.get(f"/workspaces/{electrical}/jobs?f.shift=Night").json()["total"] == 1
    assert post_job(client, electrical, date="2026-10-30", description="x", status="open", shift="Dawn").status_code == 422
    duplicate = client.post(f"/workspaces/{electrical}/fields", json={"key": "shift", "label": "Shift 2", "type": "text"})
    assert duplicate.status_code == 409


# ------------------------------------------------------------------ tenant scoping (full coverage arrives with auth, phase 2)


def test_a_job_is_invisible_under_another_workspace(client, electrical, blank):
    job = post_job(client, electrical, date="2026-10-30", description="secret", status="open").json()
    assert client.get(f"/workspaces/{blank}/jobs/{job['id']}").status_code == 404
    assert client.patch(f"/workspaces/{blank}/jobs/{job['id']}", json={"values": {"description": "x"}}).status_code == 404
    assert client.delete(f"/workspaces/{blank}/jobs/{job['id']}").status_code == 404
    assert client.get(f"/workspaces/{blank}/jobs").json()["total"] == 0


def test_reorder_sets_the_form_order_atomically_and_rejects_foreign_or_duplicate_ids(client, electrical, blank):
    fields = client.get(f"/workspaces/{electrical}/fields").json()
    ids = [f["id"] for f in fields]
    flipped = list(reversed(ids))
    ok = client.post(f"/workspaces/{electrical}/fields/reorder", json={"ids": flipped})
    assert ok.status_code == 200
    assert [f["id"] for f in client.get(f"/workspaces/{electrical}/fields").json()] == flipped
    assert client.post(f"/workspaces/{electrical}/fields/reorder", json={"ids": [ids[0], ids[0]]}).status_code == 422
    foreign = client.get(f"/workspaces/{blank}/fields").json()[0]["id"]
    assert client.post(f"/workspaces/{electrical}/fields/reorder", json={"ids": [foreign]}).status_code == 404
    after = [f["id"] for f in client.get(f"/workspaces/{electrical}/fields").json()]
    assert after == flipped  # the failed calls changed nothing


def test_field_patch_rejects_wrong_value_types(client, electrical):
    field = next(f for f in client.get(f"/workspaces/{electrical}/fields").json() if f["key"] == "dtc")
    url = f"/workspaces/{electrical}/fields/{field['id']}"
    for body in ({"required": "yes"}, {"is_hidden": 1}, {"label": 5}, {"position": "3"}, {"position": True},
                 {"position": -4}, {"options": "a,b"}, {"config": {"evil": 1}}, {"config": {"allow_custom": "x"}},
                 {"group_id": "not-a-uuid"}, {"table_label": ["x"]}):
        assert client.patch(url, json=body).status_code == 422, body
    assert client.patch(url, json={"required": True, "table_label": "DTC No"}).status_code == 200


def test_concurrent_edits_to_different_fields_both_survive(client, electrical):
    """Review finding: read-merge-write of the JSONB column let one editor silently erase another's change."""
    from threading import Barrier

    first = post_job(client, electrical, date="2026-10-30", description="x", status="open").json()["id"]
    fields = ["section", "division", "dtc", "feeder_no", "agency_name", "remarks"]
    gate = Barrier(len(fields))

    def edit(key):
        gate.wait()
        return client.patch(f"/workspaces/{electrical}/jobs/{first}", json={"values": {key: "dtc-1" if key != "division" else "North"}}).status_code

    with ThreadPoolExecutor(len(fields)) as pool:
        codes = list(pool.map(edit, fields))
    assert codes == [200] * len(fields), codes
    values = client.get(f"/workspaces/{electrical}/jobs/{first}").json()["values"]
    missing = [k for k in fields if k not in values]
    assert not missing, f"edits lost: {missing}"


def test_a_job_body_with_thousands_of_keys_is_refused_cheaply(client, electrical):
    """Review finding: 50,000 junk keys produced a 1.2 MB validation reply."""
    body = {"values": {f"k{i}": "x" for i in range(5000)}}
    r = client.post(f"/workspaces/{electrical}/jobs", json=body)
    assert r.status_code == 422 and len(r.content) < 5000
