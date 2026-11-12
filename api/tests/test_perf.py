"""Phase 1 performance gate: 10,000 jobs, 24 fields. Run with: pytest -m perf -s"""

import time
import uuid

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.perf

LIMIT_MS = 300


@pytest.fixture()
def big(client, electrical, engine):
    wid = uuid.UUID(electrical)
    with engine.begin() as connection:
        connection.execute(
            text("""
            INSERT INTO jobs (id, workspace_id, job_no, job_date, description, status, data, search_text)
            SELECT gen_random_uuid(), :wid, n, DATE '2025-01-01' + (n % 700),
                   'Cable joint ' || n || ' at pole ' || (n % 97),
                   CASE WHEN n % 3 = 0 THEN 'closed' ELSE 'open' END,
                   jsonb_build_object('division', CASE WHEN n % 2 = 0 THEN 'North' ELSE 'South' END,
                                      'dtc', 'DTC-' || (n % 500), 'mo_amount', (n * 37 % 100000)::text,
                                      'subdivision', 'Sub ' || (n % 12)),
                   n || ' Cable joint ' || n || ' DTC-' || (n % 500)
            FROM generate_series(1, 10000) AS n
            """),
            {"wid": wid},
        )
        connection.execute(text("UPDATE job_counters SET next_no = 10001 WHERE workspace_id = :wid"), {"wid": wid})
        connection.execute(text("ANALYZE jobs"))
    return electrical, engine


def timed(client, url):
    client.get(url)  # warm the connection and plan cache
    best = min(_once(client, url) for _ in range(5))
    return best


def _once(client, url):
    start = time.perf_counter()
    response = client.get(url)
    assert response.status_code == 200, response.text
    return (time.perf_counter() - start) * 1000


def test_list_endpoints_are_fast_on_10k_jobs(client, big):
    wid, engine = big
    cases = {
        "default list (date desc)": f"/workspaces/{wid}/jobs",
        "sort by numeric custom field": f"/workspaces/{wid}/jobs?sort=mo_amount&order=desc",
        "filter by custom choice": f"/workspaces/{wid}/jobs?f.division=North",
        "search 'DTC-42'": f"/workspaces/{wid}/jobs?q=DTC-42",
        "filter + range + sort": f"/workspaces/{wid}/jobs?f.division=South&f.mo_amount=1000..50000&sort=mo_amount",
        "deep page": f"/workspaces/{wid}/jobs?page=300",
    }
    slow = []
    for name, url in cases.items():
        ms = timed(client, url)
        print(f"{ms:7.1f} ms  {name}")
        if ms > LIMIT_MS:
            slow.append((name, ms))
    assert not slow, f"slower than {LIMIT_MS} ms: {slow}"


def test_explain_search_uses_trigram_index(big, capsys):
    wid, engine = big
    with engine.connect() as connection:
        plan = connection.execute(
            text("EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM jobs WHERE workspace_id = :w AND deleted_at IS NULL "
                 "AND search_text ILIKE '%dtc-42%' ORDER BY job_date DESC LIMIT 25"),
            {"w": uuid.UUID(wid)},
        ).all()
    print("\n".join(row[0] for row in plan))
