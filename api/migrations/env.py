import os

from alembic import context
from sqlalchemy import create_engine

from app.config import settings
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    # An explicit URL on the Alembic config (used by tests) wins over the environment.
    return config.get_main_option("sqlalchemy.url") or os.environ.get("DATABASE_URL") or settings.database_url


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
