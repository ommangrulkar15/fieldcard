"""Where photo bytes live. The database holds only metadata.

Two backends behind one tiny interface: a folder on disk (development and tests) and any
S3-compatible bucket (production, e.g. Supabase Storage). Keys are built by the caller from
UUIDs only, and every backend still refuses anything that is not a plain relative path.
"""

import re
from pathlib import Path
from typing import Protocol

from app.config import settings

_KEY = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(full|thumb)\.webp$")


def check_key(key: str) -> str:
    if not _KEY.match(key):
        raise ValueError("Invalid storage key")
    return key


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / check_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class S3Storage:
    """Tested against a local S3 server (moto) in tests/test_s3_storage.py."""

    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            # Supabase Storage (and most non-AWS S3 endpoints) only answers path-style URLs.
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
        )

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=check_key(key), Body=data, ContentType="image/webp")

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=check_key(key))["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=check_key(key))


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = S3Storage() if settings.storage_backend == "s3" else LocalStorage(settings.storage_dir)
    return _storage
