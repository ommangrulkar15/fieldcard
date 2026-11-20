def test_health_checks_the_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_documents_every_route(client):
    assert client.get("/openapi.json").status_code == 200


def test_every_table_has_row_level_security_on(db):
    from sqlalchemy import text

    off = db.execute(text(
        "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity"
    )).scalars().all()
    assert off == []
