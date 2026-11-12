"""Load or reset the demo workspace:  python -m app.seed [--reset]"""

import sys

from app.db import SessionLocal
from app.services import demo
from app.storage import get_storage


def main() -> None:
    with SessionLocal() as db:
        if "--reset" in sys.argv:
            demo.reset(db, get_storage())
        if demo._demo_workspace(db) is None:
            workspace = demo.seed(db)
            print(f"Seeded '{workspace.name}' with demo accounts admin/supervisor/crew@{demo.DEMO_DOMAIN}")
        else:
            print("Demo workspace already exists (use --reset to rebuild it)")


if __name__ == "__main__":
    main()
