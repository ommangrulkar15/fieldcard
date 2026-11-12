import pytest

from app.config import settings
from app.demo_guard import DEMO_DOMAIN
from tests.conftest import PASSWORD, signup


@pytest.fixture()
def demo_on(monkeypatch):
    monkeypatch.setattr(settings, "demo_enabled", True)


def demo_client(make_client, role):
    c = make_client()
    r = c.post("/auth/demo", json={"role": role})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c


def test_demo_is_off_by_default(client):
    assert client.post("/auth/demo", json={"role": "admin"}).status_code == 404
    assert client.get("/config").json() == {"signup_enabled": True, "demo_enabled": False}


def test_demo_roles_get_seeded_data_and_exactly_their_permissions(make_client, demo_on):
    admin = demo_client(make_client, "admin")
    me = admin.get("/auth/me").json()
    ws = me["workspaces"][0]
    assert ws["name"] == "Demo Electricals" and ws["role"] == "admin"
    jobs = admin.get(f"/workspaces/{ws['id']}/jobs", params={"page_size": 100}).json()
    assert jobs["total"] == 45
    statuses = {j["values"]["status"] for j in jobs["items"]}
    assert statuses == {"open", "closed"}

    crew = demo_client(make_client, "crew")
    wid = crew.get("/auth/me").json()["workspaces"][0]["id"]
    assert wid == ws["id"]  # same shared demo workspace
    assert crew.get(f"/workspaces/{wid}/jobs/export").status_code == 403
    assert crew.get(f"/workspaces/{wid}/members").status_code == 403
    assert demo_client(make_client, "supervisor").get(f"/workspaces/{wid}/jobs/export").status_code == 200


def test_unknown_role_and_repeat_logins_do_not_reseed(make_client, demo_on):
    assert make_client().post("/auth/demo", json={"role": "root"}).status_code == 404
    a = demo_client(make_client, "admin")
    ws = a.get("/auth/me").json()["workspaces"][0]["id"]
    a.post(f"/workspaces/{ws}/jobs", json={"values": {"date": "2026-10-30", "description": "visitor job", "status": "open"}})
    b = demo_client(make_client, "admin")
    assert b.get(f"/workspaces/{ws}/jobs").json()["total"] == 46


def test_demo_sign_in_details_cannot_be_changed_by_visitors(make_client, demo_on):
    admin = demo_client(make_client, "admin")
    ws = admin.get("/auth/me").json()["workspaces"][0]["id"]
    assert admin.post("/auth/change-password", json={"current_password": "x", "new_password": "a brand new passphrase"}).status_code in (403, 401)
    members = admin.get(f"/workspaces/{ws}/members").json()
    crew = next(m for m in members if m["email"].startswith("crew@"))
    assert admin.patch(f"/workspaces/{ws}/members/{crew['user_id']}", json={"role": "admin"}).status_code == 403
    assert admin.delete(f"/workspaces/{ws}/members/{crew['user_id']}").status_code == 403
    assert admin.post(f"/workspaces/{ws}/members/{crew['user_id']}/password", json={"new_password": "takeover attempt 123"}).status_code == 403


def test_nobody_can_register_a_demo_address(client):
    r = client.post("/auth/signup", json={"email": f"admin@{DEMO_DOMAIN}", "password": PASSWORD, "name": "X",
                                          "workspace_name": "W", "template": "blank"})
    assert r.status_code == 422 and "email" in r.json()["errors"]


def test_signup_can_be_closed_and_config_says_so(client, monkeypatch):
    monkeypatch.setattr(settings, "signup_enabled", False)
    r = client.post("/auth/signup", json={"email": "n@example.com", "password": PASSWORD, "name": "N",
                                          "workspace_name": "W", "template": "blank"})
    assert r.status_code == 403
    assert client.get("/config").json()["signup_enabled"] is False


def test_reset_rebuilds_the_demo_and_removes_visitor_photos(make_client, demo_on, db, tmp_path):
    import io

    from PIL import Image

    from app.services import demo
    from app.storage import LocalStorage

    admin = demo_client(make_client, "admin")
    ws = admin.get("/auth/me").json()["workspaces"][0]["id"]
    job = admin.get(f"/workspaces/{ws}/jobs").json()["items"][0]["id"]
    buf = io.BytesIO()
    Image.new("RGB", (50, 50)).save(buf, "PNG")
    admin.post(f"/workspaces/{ws}/jobs/{job}/photos", files={"file": ("p.png", buf.getvalue(), "image/png")})
    storage = LocalStorage(str(tmp_path / "photos"))
    assert list((tmp_path / "photos").rglob("*.webp"))
    demo.reset(db, storage)
    assert not list((tmp_path / "photos").rglob("*.webp"))
    demo.seed(db)
    assert demo_client(make_client, "admin").get("/auth/me").json()["workspaces"][0]["id"] != ws
