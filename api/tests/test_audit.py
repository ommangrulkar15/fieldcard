from tests.conftest import PASSWORD

JOB = {"values": {"date": "2026-10-30", "description": "x", "status": "open"}}


def entries(client, wid):
    r = client.get(f"/workspaces/{wid}/audit")
    assert r.status_code == 200, r.text
    return r.json()


def test_sensitive_actions_are_recorded_with_who_did_them(client, electrical):
    job = client.post(f"/workspaces/{electrical}/jobs", json=JOB).json()
    client.post(f"/workspaces/{electrical}/members", json={"email": "c@example.com", "name": "C", "role": "crew", "password": PASSWORD})
    uid = next(m["user_id"] for m in client.get(f"/workspaces/{electrical}/members").json() if m["email"] == "c@example.com")
    client.patch(f"/workspaces/{electrical}/members/{uid}", json={"role": "supervisor"})
    client.post(f"/workspaces/{electrical}/members/{uid}/password", json={"new_password": "reset by the admin 1"})
    client.delete(f"/workspaces/{electrical}/members/{uid}")
    client.post(f"/workspaces/{electrical}/fields", json={"key": "k", "label": "Kind", "type": "text"})
    client.get(f"/workspaces/{electrical}/jobs/export")
    client.delete(f"/workspaces/{electrical}/jobs/{job['id']}")
    log = entries(client, electrical)
    actions = [e["action"] for e in log]
    assert actions[0] == "job.delete" and log[0]["target"] == "Job card 1" and log[0]["actor"] == "admin@example.com"
    for expected in ("member.add", "member.role", "member.password_reset", "member.remove", "field.create", "job.export"):
        assert expected in actions, expected
    assert next(e for e in log if e["action"] == "member.role")["target"] == "c@example.com to supervisor"
    assert "reset by the admin" not in str(log)  # no secret ever lands in the log


def test_only_admins_read_the_log_and_other_workspaces_never_see_it(make_client, client, electrical, blank):
    client.post(f"/workspaces/{electrical}/fields", json={"key": "k", "label": "Kind", "type": "text"})
    client.post(f"/workspaces/{electrical}/members", json={"email": "s@example.com", "name": "S", "role": "supervisor", "password": PASSWORD})
    boss = make_client()
    boss.headers["Authorization"] = "Bearer " + boss.post("/auth/login", json={"email": "s@example.com", "password": PASSWORD}).json()["access_token"]
    assert boss.get(f"/workspaces/{electrical}/audit").status_code == 403
    assert entries(client, blank) == []  # the second workspace has its own, empty, log
