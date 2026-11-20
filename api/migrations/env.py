
from alembic import context
from sqlalchemy import create_engine

from app.config import settings
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    # An explicit URL on the Alembic config (used by tests) wins over the environment.
    # settings.database_url already reads DATABASE_URL and names the psycopg driver for plain postgresql:// URLs.
    return config.get_main_option("sqlalchemy.url") or settings.database_url


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
