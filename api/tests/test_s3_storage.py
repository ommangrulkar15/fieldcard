"""The S3 backend against a real S3 protocol server (moto), the way Supabase Storage is reached."""

import uuid

import boto3
import pytest

moto_server = pytest.importorskip("moto.server")

from app.config import settings  # noqa: E402
from app.storage import S3Storage  # noqa: E402


@pytest.fixture()
def s3(monkeypatch):
    server = moto_server.ThreadedMotoServer(port=0)
    server.start()
    host, port = server.get_host_and_port()
    endpoint = f"http://{host}:{port}"
    for key, value in {"s3_endpoint": endpoint, "s3_bucket": "job-photos", "s3_region": "us-east-1",
                       "s3_access_key": "test", "s3_secret_key": "test"}.items():
        monkeypatch.setattr(settings, key, value)
    boto3.client("s3", endpoint_url=endpoint, region_name="us-east-1", aws_access_key_id="test",
                 aws_secret_access_key="test").create_bucket(Bucket="job-photos")
    yield S3Storage()
    server.stop()


def test_put_get_delete_round_trip(s3):
    key = f"{uuid.uuid4()}/{uuid.uuid4()}/{uuid.uuid4()}.full.webp"
    s3.put(key, b"RIFF....WEBP")
    assert s3.get(key) == b"RIFF....WEBP"
    s3.delete(key)
    with pytest.raises(Exception):
        s3.get(key)


def test_uses_path_style_urls_like_supabase_needs(s3):
    assert s3.client.meta.config.s3["addressing_style"] == "path"


def test_refuses_keys_that_are_not_plain_ids(s3):
    with pytest.raises(ValueError):
        s3.put("../../etc/passwd", b"x")
