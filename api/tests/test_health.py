def test_health_checks_the_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_documents_every_route(client):
    assert client.get("/openapi.json").status_code == 200
