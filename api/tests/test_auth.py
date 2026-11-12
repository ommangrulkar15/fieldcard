"""Phase 2: sign-in, sessions, tokens."""

import jwt
import pytest

from app import security
from app.config import check_production_settings, settings
from app.permissions import ROLE_PERMISSIONS
from app.services import auth as auth_service
from tests.conftest import PASSWORD, login, signup

CSRF = {"X-Fieldcard": "1"}


def test_signup_creates_an_admin_with_the_permissions_the_ui_will_use(client):
    wid = signup(client, template="electrical")
    me = client.get("/auth/me").json()
    assert me["user"]["email"] == "admin@example.com"
    workspace = me["workspaces"][0]
    assert workspace["id"] == wid and workspace["role"] == "admin"
    assert set(workspace["permissions"]) == ROLE_PERMISSIONS["admin"]  # one source of truth


def test_refresh_cookie_is_httponly_and_scoped_to_auth(client):
    response = client.post("/auth/signup", json={
        "email": "a@example.com", "password": PASSWORD, "name": "A", "workspace_name": "W", "template": "blank"})
    cookie = response.headers["set-cookie"]
    assert "fc_refresh=" in cookie and "HttpOnly" in cookie and "Path=/auth" in cookie
    assert "SameSite=lax" in cookie


@pytest.mark.parametrize("email,password,field", [
    ("not-an-email", PASSWORD, "email"), ("a@example.com", "short", "password"), ("a@example.com", "x" * 129, "password"),
])
def test_signup_validation(client, email, password, field):
    r = client.post("/auth/signup", json={"email": email, "password": password, "name": "A", "workspace_name": "W"})
    assert r.status_code == 422 and field in r.json()["errors"]


def test_duplicate_email_conflicts_case_insensitively(client, make_client):
    signup(client, email="dup@example.com")
    r = make_client().post("/auth/signup", json={
        "email": "DUP@Example.com", "password": PASSWORD, "name": "B", "workspace_name": "W2"})
    assert r.status_code == 409


def test_failed_signup_does_not_leave_a_half_created_account(client, db):
    r = client.post("/auth/signup", json={
        "email": "x@example.com", "password": PASSWORD, "name": "X", "workspace_name": "W", "template": "nope"})
    assert r.status_code == 422
    assert client.post("/auth/login", json={"email": "x@example.com", "password": PASSWORD}).status_code == 401


def test_wrong_password_and_unknown_email_look_identical(client):
    signup(client, email="real@example.com")
    wrong = client.post("/auth/login", json={"email": "real@example.com", "password": "not the password"})
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "not the password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Wrong email or password"}


def test_unknown_email_costs_one_password_check_like_a_real_one(client, monkeypatch):
    signup(client, email="real@example.com")
    calls = {"real": 0, "dummy": 0}
    monkeypatch.setattr(auth_service, "verify_password", lambda h, p: calls.__setitem__("real", calls["real"] + 1) or False)
    monkeypatch.setattr(auth_service, "verify_against_dummy", lambda p: calls.__setitem__("dummy", calls["dummy"] + 1))
    client.post("/auth/login", json={"email": "real@example.com", "password": "x"})
    client.post("/auth/login", json={"email": "ghost@example.com", "password": "x"})
    assert calls == {"real": 1, "dummy": 1}  # a miss does the same amount of hashing work as a hit


def test_access_token_carries_no_role(client):
    signup(client)
    claims = jwt.decode(client.headers["Authorization"].split()[1], settings.secret_key, algorithms=["HS256"])
    assert set(claims) == {"sub", "iat", "exp", "typ"}  # roles are read fresh from the database


def test_missing_expired_and_forged_tokens_are_rejected(client, make_client, monkeypatch):
    anonymous = make_client()
    assert anonymous.get("/auth/me").status_code == 401
    assert anonymous.get("/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401

    signup(client)
    user_id = jwt.decode(client.headers["Authorization"].split()[1], settings.secret_key, algorithms=["HS256"])["sub"]
    forged = jwt.encode({"sub": user_id, "exp": 4102444800, "typ": "access"}, "some other secret key 0123456789abcdef", algorithm="HS256")
    assert anonymous.get("/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    unsigned = jwt.encode({"sub": user_id, "exp": 4102444800, "typ": "access"}, None, algorithm="none")
    assert anonymous.get("/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401

    monkeypatch.setattr(settings, "access_token_minutes", -1)
    expired = security.create_access_token(user_id)
    assert anonymous.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_refresh_rotates_and_a_reused_token_kills_the_whole_session(make_client, client, monkeypatch):
    monkeypatch.setattr(settings, "refresh_reuse_grace_seconds", -1)  # no grace: replay is theft
    signup(client, email="r@example.com")
    first = login(client, "r@example.com").cookies.get("fc_refresh")

    web = make_client()
    web.cookies.set("fc_refresh", first, path="/auth")
    rotated = web.post("/auth/refresh", headers=CSRF)
    assert rotated.status_code == 200 and rotated.json()["access_token"]
    second = rotated.cookies.get("fc_refresh")
    assert second and second != first

    thief = make_client()
    thief.cookies.set("fc_refresh", first, path="/auth")  # replaying the already-used token
    assert thief.post("/auth/refresh", headers=CSRF).status_code == 401

    again = make_client()
    again.cookies.set("fc_refresh", second, path="/auth")  # the legitimate newer token is now dead too
    assert again.post("/auth/refresh", headers=CSRF).status_code == 401


def test_refresh_and_logout_require_the_csrf_header(client):
    signup(client)
    login(client, "admin@example.com")
    assert client.post("/auth/refresh").status_code == 403
    assert client.post("/auth/logout").status_code == 403


def test_logout_revokes_the_refresh_token(make_client, client):
    signup(client, email="l@example.com")
    token = login(client, "l@example.com").cookies.get("fc_refresh")
    assert client.post("/auth/logout", headers=CSRF).status_code == 204
    other = make_client()
    other.cookies.set("fc_refresh", token, path="/auth")
    assert other.post("/auth/refresh", headers=CSRF).status_code == 401


def test_changing_password_signs_out_other_devices(make_client, client):
    signup(client, email="c@example.com")
    token = login(client, "c@example.com").cookies.get("fc_refresh")
    bad = client.post("/auth/change-password", json={"current_password": "wrong", "new_password": "a brand new passphrase"})
    assert bad.status_code == 401
    ok = client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "a brand new passphrase"})
    assert ok.status_code == 204
    other = make_client()
    other.cookies.set("fc_refresh", token, path="/auth")
    assert other.post("/auth/refresh", headers=CSRF).status_code == 401
    assert client.post("/auth/login", json={"email": "c@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/auth/login", json={"email": "c@example.com", "password": "a brand new passphrase"}).status_code == 200


def test_production_refuses_the_development_secret(monkeypatch):
    monkeypatch.setattr(settings, "env", "prod")
    with pytest.raises(RuntimeError):
        check_production_settings()
    monkeypatch.setattr(settings, "secret_key", "x" * 40)
    with pytest.raises(RuntimeError, match="STORAGE_BACKEND"):  # local disk is wiped on every deploy
        check_production_settings()
    monkeypatch.setattr(settings, "storage_backend", "s3")
    check_production_settings()  # a real secret and durable storage are accepted


def test_a_second_tab_replaying_a_just_rotated_token_is_refused_but_not_logged_out(make_client, client):
    """Two tabs share one cookie jar and may both refresh at page load. The loser gets a plain 401
    and can retry with the new cookie; the session is not destroyed."""
    signup(client, email="t@example.com")
    first = login(client, "t@example.com").cookies.get("fc_refresh")
    tab_one, tab_two = make_client(), make_client()
    for tab in (tab_one, tab_two):
        tab.cookies.set("fc_refresh", first, path="/auth")
    won = tab_one.post("/auth/refresh", headers=CSRF)
    assert won.status_code == 200
    assert tab_two.post("/auth/refresh", headers=CSRF).status_code == 401  # lost the race
    tab_two.cookies.set("fc_refresh", won.cookies.get("fc_refresh"), path="/auth")  # the shared jar now holds the new token
    assert tab_two.post("/auth/refresh", headers=CSRF).status_code == 200  # retry works


def test_repeated_wrong_passwords_are_throttled_per_account_and_a_right_one_is_blocked_too(client):
    signup(client, email="t@example.com")
    for _ in range(5):
        assert client.post("/auth/login", json={"email": "t@example.com", "password": "wrong wrong wrong"}).status_code == 401
    blocked = client.post("/auth/login", json={"email": "t@example.com", "password": PASSWORD})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0
    # another account from the same address is not locked out by it
    signup(client, email="u@example.com")
    assert client.post("/auth/login", json={"email": "u@example.com", "password": PASSWORD}).status_code == 200


def test_one_address_cannot_hammer_the_sign_in_endpoints(client):
    codes = [client.post("/auth/login", json={"email": f"x{i}@example.com", "password": "nope nope nope"}).status_code
             for i in range(32)]
    assert codes[:30] == [401] * 30 and codes[30] == 429


def test_security_headers_are_set_on_every_response(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert client.post("/auth/login", json={"email": "a@b.co", "password": "x"}).headers["cache-control"] == "no-store"


def test_a_forged_forwarded_for_header_does_not_dodge_the_limit(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "trust_proxy_hops", 1)
    statuses = [client.post("/auth/login", json={"email": "a@b.co", "password": "x"},
                            headers={"X-Forwarded-For": f"1.2.3.{i}, 9.9.9.9"}).status_code for i in range(32)]
    assert statuses[30] == 429  # every request carried the same trusted hop, 9.9.9.9


def test_refresh_cookie_is_httponly_scoped_and_follows_the_configured_path(client, monkeypatch):
    from app.config import settings

    first = client.post("/auth/signup", json={"email": "p@example.com", "password": PASSWORD, "name": "P",
                                              "workspace_name": "W", "template": "blank"})
    cookie = first.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Path=/auth" in cookie and "SameSite=lax" in cookie
    monkeypatch.setattr(settings, "cookie_path", "/api/auth")
    second = client.post("/auth/login", json={"email": "p@example.com", "password": PASSWORD})
    assert "Path=/api/auth" in second.headers["set-cookie"]
