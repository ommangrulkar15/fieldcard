"""Core tables: workspaces, fields, jobs

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "workspaces",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("template", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "job_counters",
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("next_no", sa.Integer, nullable=False, server_default="1"),
    )

    op.create_table(
        "field_groups",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_field_groups_workspace", "field_groups", ["workspace_id"])

    op.create_table(
        "form_fields",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("table_label", sa.String(80)),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("options", pg.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("config", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("group_id", pg.UUID(as_uuid=True), sa.ForeignKey("field_groups.id", ondelete="SET NULL")),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("table_position", sa.Integer),
        sa.Column("required", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("on_card", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("on_form", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_core", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_hidden", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.CheckConstraint(
            "type IN ('text','longtext','number','date','dropdown','choice','yesno','photo')",
            name="ck_form_fields_type",
        ),
        sa.CheckConstraint("key ~ '^[a-z][a-z0-9_]{0,39}$'", name="ck_form_fields_key"),
        sa.UniqueConstraint("workspace_id", "key", name="uq_form_fields_workspace_key"),
    )

    op.create_table(
        "jobs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_no", sa.Integer, nullable=False),
        sa.Column("job_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("closed_at", sa.Date),
        sa.Column("data", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("search_text", sa.Text, nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('open','closed')", name="ck_jobs_status"),
        sa.CheckConstraint("job_no > 0", name="ck_jobs_job_no"),
    )
    # One live job per number per workspace; a deleted job's number may be reused manually.
    op.create_index(
        "uq_jobs_workspace_job_no", "jobs", ["workspace_id", "job_no"], unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # Default list order: newest date first, within one workspace.
    op.create_index(
        "ix_jobs_workspace_date", "jobs", ["workspace_id", sa.text("job_date DESC"), sa.text("id DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # Filters on custom fields, e.g. data @> '{"division":"North"}'.
    op.create_index("ix_jobs_data_gin", "jobs", ["data"], postgresql_using="gin", postgresql_ops={"data": "jsonb_path_ops"})
    # Substring search.
    op.create_index(
        "ix_jobs_search_trgm", "jobs", ["search_text"], postgresql_using="gin",
        postgresql_ops={"search_text": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("form_fields")
    op.drop_table("field_groups")
    op.drop_table("job_counters")
    op.drop_table("workspaces")
