"""Turn on row-level security for every app table

Revision ID: 0005
Revises: 0004

The API is the only client and connects as the tables' owner, which RLS does not restrict. Hosts
such as Supabase also publish the public schema through a REST API keyed by a public key; with RLS
on and no policies, that route sees nothing. On plain Postgres this changes nothing for the API.
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

TABLES_SQL = """
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema() AND c.relkind = 'r' AND c.relname <> 'alembic_version'
"""


def _tables() -> list[str]:
    return [row[0] for row in op.get_bind().exec_driver_sql(TABLES_SQL)]


def upgrade() -> None:
    for table in _tables():
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in _tables() + ["alembic_version"]:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
