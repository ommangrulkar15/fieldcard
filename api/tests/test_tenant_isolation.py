"""Phase 2: roles, and tenant isolation on EVERY workspace route (enumerated from the app itself)."""

import uuid

import pytest

from app.main import app
from app.permissions import ROLE_PERMISSIONS
from tests.conftest import PASSWORD, login, signup

CSRF = {"X-Fieldcard": "1"}

JOB = {"values": {"date": "2026-10-30", "description": "secret", "status": "open"}}


def workspace_routes():
    """Every (METHOD, path template) under /workspaces/{workspace_id}, read from the app's own
    OpenAPI document, so a route added later is covered automatically."""
    found = []
    for path, operations in app.openapi()["paths"].items():
        if "{workspace_id}" not in path:
            continue
        for method in sorted(operations):
            found.append((method.upper(), path))
    return found


ROUTES = workspace_routes()


def fill(path, ids):
    for name, value in ids.items():
        path = path.replace("{" + name + "}", str(value))
    return path


def body_for(method, path):
    if method == "GET" or method == "DELETE":
        return None
    if path.endswith("/jobs"):
        return JOB
    if path.endswith("/members"):
        return {"email": "new@example.com", "name": "N", "role": "crew", "password": PASSWORD}
    if path.endswith("/password"):
        return {"new_password": "another long password"}
    if "/members/" in path:
        return {"role": "crew"}
    if path.endswith("/photos"):
        return None
    if path.endswith("/fields/reorder"):
        return {"ids": ["00000000-0000-0000-0000-000000000000"]}
    if path.endswith("/fields"):
        return {"key": "k", "label": "K", "type": "text"}
    return {}


@pytest.fixture()
def world(make_client):
    """Alice runs workspace A (with a job and a field). Bob runs workspace B."""
    alice, bob, nobody = make_client(), make_client(), make_client()
    wid_a = signup(alice, email="alice@example.com", template="electrical", workspace="A Co", name="Alice")
    wid_b = signup(bob, email="bob@example.com", template="blank", workspace="B Co", name="Bob")
    job = alice.post(f"/workspaces/{wid_a}/jobs", json=JOB).json()
    field = next(f for f in alice.get(f"/workspaces/{wid_a}/fields").json() if f["key"] == "dtc")
    alice_id = alice.get("/auth/me").json()["user"]["id"]
    from tests.test_photos import picture
    photo = alice.post(f"/workspaces/{wid_a}/jobs/{job['id']}/photos",
                       files={"file": ("p.jpg", picture(size=(100, 100)), "image/jpeg")}).json()
    ids = {"workspace_id": wid_a, "job_id": job["id"], "field_id": field["id"], "user_id": alice_id,
           "photo_id": photo["id"]}
    return {"alice": alice, "bob": bob, "nobody": nobody, "a": wid_a, "b": wid_b, "ids": ids, "job": job}


def test_there_are_workspace_routes_to_check():
    assert len(ROUTES) >= 19, ROUTES  # grows as routes are added; must never silently shrink to zero


@pytest.mark.parametrize("method,path", ROUTES)
def test_anonymous_gets_401_everywhere(world, method, path):
    r = world["nobody"].request(method, fill(path, world["ids"]), json=body_for(method, path))
    assert r.status_code == 401, (method, path, r.text)


@pytest.mark.parametrize("method,path", ROUTES)
def test_another_tenants_user_gets_404_everywhere(world, method, path):
    r = world["bob"].request(method, fill(path, world["ids"]), json=body_for(method, path))
    assert r.status_code == 404, (method, path, r.status_code, r.text)
    assert "secret" not in r.text


def test_the_404_is_not_just_a_missing_id(world):
    """Positive control: the very same URLs work for the owner, so the 404s above are isolation."""
    alice, ids = world["alice"], world["ids"]
    for path in ("/workspaces/{workspace_id}", "/workspaces/{workspace_id}/jobs", "/workspaces/{workspace_id}/jobs/{job_id}",
                 "/workspaces/{workspace_id}/fields", "/workspaces/{workspace_id}/members"):
        assert alice.get(fill(path, ids)).status_code == 200, path


def test_bobs_own_workspace_does_not_list_alices_jobs(world):
    bob = world["bob"]
    assert bob.get(f"/workspaces/{world['b']}/jobs").json()["total"] == 0
    assert bob.get(f"/workspaces/{world['b']}/jobs/{world['job']['id']}").status_code == 404  # a real id, wrong workspace
    assert [w["name"] for w in bob.get("/auth/me").json()["workspaces"]] == ["B Co"]


# ------------------------------------------------------------------ roles


def add(admin, wid, email, role, name="Person"):
    r = admin.post(f"/workspaces/{wid}/members", json={"email": email, "name": name, "role": role, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()["user_id"]


def as_user(make_client, email):
    c = make_client()
    login(c, email)
    return c


def test_role_matrix(world, make_client):
    alice, wid = world["alice"], world["a"]
    add(alice, wid, "crew@example.com", "crew")
    add(alice, wid, "boss@example.com", "supervisor")
    crew, boss = as_user(make_client, "crew@example.com"), as_user(make_client, "boss@example.com")
    job = f"/workspaces/{wid}/jobs/{world['job']['id']}"
    new_field = {"key": "shift", "label": "Shift", "type": "text"}

    # crew: read, create, update; not delete, fields, members
    assert crew.get(f"/workspaces/{wid}/jobs").status_code == 200
    assert crew.post(f"/workspaces/{wid}/jobs", json=JOB).status_code == 201
    assert crew.patch(job, json={"values": {"description": "edited"}}).status_code == 200
    assert crew.delete(job).status_code == 403
    assert crew.post(f"/workspaces/{wid}/fields", json=new_field).status_code == 403
    assert crew.get(f"/workspaces/{wid}/members").status_code == 403

    # supervisor: + delete; still no fields or members
    assert boss.post(f"/workspaces/{wid}/fields", json=new_field).status_code == 403
    assert boss.get(f"/workspaces/{wid}/members").status_code == 403
    assert boss.delete(job).status_code == 204

    # admin: fields and members
    assert alice.post(f"/workspaces/{wid}/fields", json=new_field).status_code == 201
    assert alice.get(f"/workspaces/{wid}/members").status_code == 200


def test_me_reports_the_same_permissions_the_api_enforces(world, make_client):
    add(world["alice"], world["a"], "crew@example.com", "crew")
    crew = as_user(make_client, "crew@example.com")
    permissions = set(crew.get("/auth/me").json()["workspaces"][0]["permissions"])
    assert permissions == ROLE_PERMISSIONS["crew"]


def test_a_role_change_takes_effect_on_the_next_request_with_the_same_token(world, make_client):
    alice, wid = world["alice"], world["a"]
    uid = add(alice, wid, "mover@example.com", "supervisor")
    mover = as_user(make_client, "mover@example.com")
    assert mover.delete(f"/workspaces/{wid}/jobs/{world['job']['id']}").status_code == 204
    job2 = alice.post(f"/workspaces/{wid}/jobs", json=JOB).json()
    assert alice.patch(f"/workspaces/{wid}/members/{uid}", json={"role": "crew"}).status_code == 200
    assert mover.delete(f"/workspaces/{wid}/jobs/{job2['id']}").status_code == 403  # no stale permission in the token


def test_removed_member_loses_access_immediately(world, make_client):
    alice, wid = world["alice"], world["a"]
    uid = add(alice, wid, "gone@example.com", "crew")
    gone = as_user(make_client, "gone@example.com")
    assert gone.get(f"/workspaces/{wid}/jobs").status_code == 200
    assert alice.delete(f"/workspaces/{wid}/members/{uid}").status_code == 204
    assert gone.get(f"/workspaces/{wid}/jobs").status_code == 404


def test_the_last_admin_cannot_be_demoted_or_removed(world):
    alice, wid, alice_id = world["alice"], world["a"], world["ids"]["user_id"]
    assert alice.patch(f"/workspaces/{wid}/members/{alice_id}", json={"role": "crew"}).status_code == 409
    assert alice.delete(f"/workspaces/{wid}/members/{alice_id}").status_code == 409


def test_invalid_role_is_rejected(world):
    r = world["alice"].post(f"/workspaces/{world['a']}/members", json={
        "email": "x@example.com", "name": "X", "role": "owner", "password": PASSWORD})
    assert r.status_code == 422


# ------------------------------------------------------------------ password reset cannot cross tenants


def test_admin_can_reset_only_accounts_they_created_and_that_belong_nowhere_else(world, make_client):
    alice, bob, wid = world["alice"], world["bob"], world["a"]
    own = add(alice, wid, "own@example.com", "crew")
    shared = add(alice, wid, "shared@example.com", "crew")
    # shared@ is later also added to Bob's workspace
    add(bob, world["b"], "shared@example.com", "crew")

    ok = alice.post(f"/workspaces/{wid}/members/{own}/password", json={"new_password": "reset by the admin 1"})
    assert ok.status_code == 204
    fresh = make_client()
    assert fresh.post("/auth/login", json={"email": "own@example.com", "password": "reset by the admin 1"}).status_code == 200

    blocked = alice.post(f"/workspaces/{wid}/members/{shared}/password", json={"new_password": "reset by the admin 2"})
    assert blocked.status_code == 409  # belongs to another workspace too

    bob_id = bob.get("/auth/me").json()["user"]["id"]
    foreign = alice.post(f"/workspaces/{wid}/members/{bob_id}/password", json={"new_password": "takeover attempt 123"})
    assert foreign.status_code == 404  # Bob is not even a member of A
    assert make_client().post("/auth/login", json={"email": "bob@example.com", "password": PASSWORD}).status_code == 200


def test_adding_an_existing_account_never_changes_its_password(world, make_client):
    alice, wid = world["alice"], world["a"]
    r = alice.post(f"/workspaces/{wid}/members", json={
        "email": "bob@example.com", "name": "Bob", "role": "crew", "password": "attacker chosen password"})
    assert r.status_code == 201
    assert make_client().post("/auth/login", json={"email": "bob@example.com", "password": "attacker chosen password"}).status_code == 401
    assert make_client().post("/auth/login", json={"email": "bob@example.com", "password": PASSWORD}).status_code == 200
