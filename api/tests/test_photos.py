import io

from PIL import Image

from tests.conftest import PASSWORD, signup

JOB = {"values": {"date": "2026-10-30", "description": "Pole repair", "status": "open"}}


def picture(fmt="JPEG", size=(2400, 1800), exif=False):
    image = Image.new("RGB", size, (200, 120, 40))
    out = io.BytesIO()
    kwargs = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = "SecretPhoneMaker"  # camera make
        data[0x8825] = {1: "N", 2: (12.0, 0.0, 0.0)}  # a GPS block
        kwargs["exif"] = data
    image.save(out, fmt, **kwargs)
    return out.getvalue()


def upload(client, wid, job_id, data, name="p.jpg", mime="image/jpeg"):
    return client.post(f"/workspaces/{wid}/jobs/{job_id}/photos", files={"file": (name, data, mime)})


def new_job(client, wid):
    return client.post(f"/workspaces/{wid}/jobs", json=JOB).json()["id"]


def test_upload_is_resized_reencoded_and_stripped_of_metadata(client, electrical):
    job = new_job(client, electrical)
    raw = picture(exif=True)
    assert b"SecretPhoneMaker" in raw
    r = upload(client, electrical, job, raw)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert max(r.json()["width"], r.json()["height"]) == 1280

    full = client.get(f"/workspaces/{electrical}/jobs/{job}/photos/{pid}/image")
    assert full.status_code == 200 and full.headers["content-type"] == "image/webp"
    assert full.headers["x-content-type-options"] == "nosniff"
    assert b"SecretPhoneMaker" not in full.content
    image = Image.open(io.BytesIO(full.content))
    assert image.format == "WEBP" and not image.getexif()
    thumb = client.get(f"/workspaces/{electrical}/jobs/{job}/photos/{pid}/image", params={"size": "thumb"})
    assert max(Image.open(io.BytesIO(thumb.content)).size) == 320
    assert len(thumb.content) < len(full.content)


def test_files_that_are_not_photos_are_rejected(client, electrical):
    job = new_job(client, electrical)
    for name, body in [("a.jpg", b""), ("b.jpg", b"not an image at all"), ("c.svg", b"<svg onload='x()'></svg>"),
                       ("d.jpg", b"GIF89a" + b"\0" * 40), ("e.php", b"<?php system($_GET[1]); ?>")]:
        assert upload(client, electrical, job, body, name).status_code == 422, name
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, "GIF")
    assert upload(client, electrical, job, gif.getvalue(), "g.jpg", "image/jpeg").status_code == 422
    assert client.get(f"/workspaces/{electrical}/jobs/{job}/photos").json() == []


def test_oversize_upload_and_decompression_bombs_are_refused(client, electrical):
    job = new_job(client, electrical)
    assert upload(client, electrical, job, b"\0" * (8 * 1024 * 1024 + 1)).status_code == 422
    bomb = io.BytesIO()
    Image.new("1", (30000, 30000)).save(bomb, "PNG")  # tiny file, 900 megapixels
    assert len(bomb.getvalue()) < 8 * 1024 * 1024
    assert upload(client, electrical, job, bomb.getvalue(), "b.png", "image/png").status_code == 422


def test_a_job_holds_at_most_five_photos(client, electrical):
    job = new_job(client, electrical)
    small = picture(size=(200, 200))
    for _ in range(5):
        assert upload(client, electrical, job, small).status_code == 201
    assert upload(client, electrical, job, small).status_code == 409
    assert len(client.get(f"/workspaces/{electrical}/jobs/{job}/photos").json()) == 5


def test_delete_removes_row_and_files(client, electrical, tmp_path):
    job = new_job(client, electrical)
    pid = upload(client, electrical, job, picture(size=(300, 300))).json()["id"]
    stored = list((tmp_path / "photos").rglob("*.webp"))
    assert len(stored) == 2
    assert client.delete(f"/workspaces/{electrical}/jobs/{job}/photos/{pid}").status_code == 204
    assert not list((tmp_path / "photos").rglob("*.webp"))
    assert client.get(f"/workspaces/{electrical}/jobs/{job}/photos/{pid}/image").status_code == 404


def test_photos_never_cross_tenants_or_jobs(make_client):
    alice, bob = make_client(), make_client()
    wa = signup(alice, email="a@example.com", workspace="A Co", name="Alice")
    wb = signup(bob, email="b@example.com", workspace="B Co", name="Bob")
    ja, jb = new_job(alice, wa), new_job(bob, wb)
    pid = upload(alice, wa, ja, picture(size=(300, 300))).json()["id"]
    # Bob cannot touch Alice's job or photo, whichever path he tries
    assert bob.get(f"/workspaces/{wa}/jobs/{ja}/photos/{pid}/image").status_code == 404
    assert bob.delete(f"/workspaces/{wa}/jobs/{ja}/photos/{pid}").status_code == 404
    assert upload(bob, wa, ja, picture(size=(50, 50))).status_code == 404
    # Bob's own workspace and job id do not unlock her photo either
    assert bob.get(f"/workspaces/{wb}/jobs/{jb}/photos/{pid}/image").status_code == 404
    assert bob.get(f"/workspaces/{wb}/jobs/{ja}/photos/{pid}/image").status_code == 404
    assert alice.get(f"/workspaces/{wa}/jobs/{ja}/photos/{pid}/image").status_code == 200
    anon = make_client()
    assert anon.get(f"/workspaces/{wa}/jobs/{ja}/photos/{pid}/image").status_code == 401


def test_a_deleted_job_hides_its_photos(client, electrical):
    job = new_job(client, electrical)
    pid = upload(client, electrical, job, picture(size=(200, 200))).json()["id"]
    assert client.delete(f"/workspaces/{electrical}/jobs/{job}").status_code == 204
    assert client.get(f"/workspaces/{electrical}/jobs/{job}/photos").status_code == 404
    assert client.get(f"/workspaces/{electrical}/jobs/{job}/photos/{pid}/image").status_code == 404


def test_storage_refuses_path_tricks(tmp_path):
    import pytest

    from app.storage import LocalStorage

    storage = LocalStorage(str(tmp_path))
    for bad in ["../evil.full.webp", "/etc/passwd", "a/b/c.full.webp", "x" * 36 + "/" + "y" * 36 + "/" + "z" * 36 + ".full.webp"]:
        with pytest.raises(ValueError):
            storage.put(bad, b"x")
