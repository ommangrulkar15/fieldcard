"""Demo workspace for the public portfolio deployment.

Everything here is invented: place names, descriptions and amounts. Visitors sign in as one of
three demo roles with one click and never see a password. Demo accounts cannot have their
password, role or membership changed, so one visitor cannot lock the next one out; the whole
workspace can be reset to its seed state with `python -m app.seed --reset`.
"""

import random
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.demo_guard import DEMO_DOMAIN
from app.errors import NotFound
from app.models import Job, JobPhoto, Membership, User, Workspace
from app.services import auth
from app.services import jobs as job_service
from app.services.workspaces import create_workspace
from app.storage import Storage

DEMO_ROLES = {"admin": "Asha Demo", "supervisor": "Sam Demo", "crew": "Chris Demo"}
WORKSPACE_NAME = "Demo Electricals"
# Visitors change the shared demo. The first demo sign-in after this long rebuilds it from the
# seed, so nobody needs a scheduled job (or database credentials outside the API) to tidy it.
RESET_AFTER = timedelta(hours=24)
RESET_LOCK = 724_601  # arbitrary constant for pg_advisory_xact_lock


def _is_stale(workspace: Workspace) -> bool:
    return datetime.now(timezone.utc) - workspace.created_at > RESET_AFTER

WORK = [
    "Replace damaged 11kV insulator on pole {n}", "Re-conductor LT line between poles {n} and {m}",
    "Transformer oil top-up and silica gel change", "Tree trimming along the feeder route",
    "Fault repair on underground cable joint", "Install new meter box and service wire",
    "Replace blown DO fuse set", "Earthing resistance test and repair", "Straighten leaning pole {n}",
    "Replace faulty ABC cable segment", "Commission new distribution box", "Streetlight circuit fault repair",
]


def _demo_workspace(db: Session) -> Workspace | None:
    return db.scalar(
        select(Workspace).join(Membership, Membership.workspace_id == Workspace.id)
        .join(User, User.id == Membership.user_id)
        .where(User.email == f"admin@{DEMO_DOMAIN}", Workspace.name == WORKSPACE_NAME)
    )


def reset(db: Session, storage: Storage) -> None:
    """Remove the demo workspace and its demo users, including any photos visitors uploaded."""
    workspace = _demo_workspace(db)
    if workspace is not None:
        from app.services.photos import key_for

        for photo in db.scalars(select(JobPhoto).where(JobPhoto.workspace_id == workspace.id)):
            for size in ("full", "thumb"):
                storage.delete(key_for(photo, size))
        db.delete(workspace)
    for user in db.scalars(select(User).where(User.email.like(f"%@{DEMO_DOMAIN}"))):
        db.delete(user)
    db.commit()


def seed(db: Session, job_count: int = 45) -> Workspace:
    rng = random.Random(7)  # the same demo every time
    workspace = create_workspace(db, WORKSPACE_NAME, "electrical", commit=False)
    for role, name in DEMO_ROLES.items():
        user = auth.create_user(db, f"{role}@{DEMO_DOMAIN}", secrets.token_urlsafe(24), name,
                                managed_by=workspace.id, allow_demo=True)
        db.add(Membership(user_id=user.id, workspace_id=workspace.id, role=role))
    db.commit()

    sections = ["Westgate", "Pine Hill", "Orchard Road", "Maple Court", "Harbor Lane", "Lake View"]
    today = date.today()
    # Oldest first, so job numbers rise with the date like a real register.
    days_ago = sorted((rng.randint(1, 90) for _ in range(job_count)), reverse=True)
    for index in range(job_count):
        when = today - timedelta(days=days_ago[index])
        closed = rng.random() < 0.6 or days_ago[index] > 45
        values = {
            "date": when.isoformat(),
            "description": rng.choice(WORK).format(n=rng.randint(10, 400), m=rng.randint(10, 400)),
            "status": "closed" if closed else "open",
            "section": rng.choice(sections),
            "division": rng.choice(["North", "South"]),
            "subdivision": rng.choice(["Subdivision A", "Subdivision B", "Subdivision C"]),
            "dtc": f"DTC-{rng.randint(1, 90):02d}",
            "feeder_no": f"F{rng.randint(1, 20)}",
            "agency_name": rng.choice(["Brightline Works", "Ember Contractors", "Kestrel Electrical"]),
        }
        if rng.random() < 0.7:
            values.update({"mo_no": f"MO-{rng.randint(1000, 9999)}", "mo_amount": str(rng.randint(8, 240) * 500),
                           "wo_no": f"WO-{rng.randint(100, 999)}", "wo_amount": str(rng.randint(8, 240) * 450)})
        created = job_service.create_job(db, workspace.id, values)
        if closed:  # the app stamps today when a job is closed; the seed backdates it to look lived-in
            job = db.get(Job, created["id"])
            job.closed_at = min(today, when + timedelta(days=rng.randint(1, 12)))
    db.commit()
    return workspace


def demo_login(db: Session, storage: Storage, role: str) -> User:
    if role not in DEMO_ROLES:
        raise NotFound("Unknown demo role")
    workspace = _demo_workspace(db)
    if workspace is None or _is_stale(workspace):
        # Many visitors can arrive at once: only one rebuilds, the others wait, then reuse it.
        # The lock lives on its own connection because reset and seed commit as they go.
        with db.get_bind().connect() as lock:
            lock.execute(text("SELECT pg_advisory_lock(:key)"), {"key": RESET_LOCK})
            try:
                db.expire_all()
                workspace = _demo_workspace(db)
                if workspace is None or _is_stale(workspace):
                    reset(db, storage)
                    seed(db)
            finally:
                lock.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": RESET_LOCK})
                lock.commit()
    user = db.scalar(select(User).where(User.email == f"{role}@{DEMO_DOMAIN}"))
    if user is None:
        raise NotFound("Demo is not available")
    return user
