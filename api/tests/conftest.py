import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db import get_db
from app.main import app
from app.ratelimit import LIMITERS
from app.storage import LocalStorage, get_storage

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5433/fieldcard_test")
PASSWORD = "correct horse battery"


@pytest.fixture(scope="session")
def engine():
    """A real Postgres. The schema is built by the migrations themselves, down and back up,
    so every migration and its downgrade are exercised on each run."""
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", TEST_DB)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine = create_engine(TEST_DB)
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(engine):
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE workspaces, users CASCADE"))
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture()
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    """Every test starts with empty limiter state, so one test's sign-ins never throttle another's."""
    for limiter in LIMITERS:
        limiter.clear()
    yield


@pytest.fixture()
def make_client(session_factory, tmp_path):
    """Factory for independent clients (separate cookie jars and headers), one per person."""

    def override():
        with session_factory() as session:
            yield session

    storage = LocalStorage(str(tmp_path / "photos"))
    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_storage] = lambda: storage
    yield lambda: TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def client(make_client):
    return make_client()


def signup(client, email="admin@example.com", template="electrical", workspace="Northgate Electricals", name="Admin"):
    """Create an account and its workspace; leaves the client signed in. Returns the workspace id."""
    response = client.post("/auth/signup", json={
        "email": email, "password": PASSWORD, "name": name, "workspace_name": workspace, "template": template,
    })
    assert response.status_code == 201, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client.get("/auth/me").json()["workspaces"][0]["id"]


def login(client, email, password=PASSWORD):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return response


@pytest.fixture()
def electrical(client):
    """A workspace built from the electrical template; `client` is its signed-in admin."""
    return signup(client)


@pytest.fixture()
def blank(client):
    """A blank workspace. Signs the client up if nobody is signed in yet, otherwise adds a second workspace."""
    if "Authorization" not in client.headers:
        return signup(client, template="blank", workspace="Blank Co")
    response = client.post("/workspaces", json={"name": "Blank Co", "template": "blank"})
    assert response.status_code == 201
    return response.json()["id"]
