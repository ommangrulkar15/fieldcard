"""Audit log

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("actor", sa.String(254), nullable=False),  # the email at the time; survives account removal
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("target", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_workspace_time", "audit_log", ["workspace_id", sa.text("created_at DESC"), sa.text("id DESC")])


def downgrade() -> None:
    op.drop_index("ix_audit_workspace_time", table_name="audit_log")
    op.drop_table("audit_log")
