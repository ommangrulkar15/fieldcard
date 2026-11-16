"""Starting field sets for new workspaces.

The "electrical" template reproduces the fixed layout of the reference client:
the form fields and their order, and the 16 data-table columns (plus the UI-only
Actions column) with their exact header text and order. `table_label` is the header
shown in the Data table and exports; `label` is what the form shows.
"""

from dataclasses import dataclass, field

JOB = "Job"
LOCATION = "Location"
MONEY = "Money and references"
PHOTOS = "Photos"
CARD = "Job Card Details (for printable)"

STATUS_OPTIONS = [{"value": "open", "archived": False}, {"value": "closed", "archived": False}]


def _opts(*values: str) -> list[dict]:
    return [{"value": v, "archived": False} for v in values]


@dataclass
class FieldSpec:
    key: str
    label: str
    type: str
    group: str
    table_label: str | None = None
    table_position: int | None = None
    required: bool = False
    on_card: bool = False
    on_form: bool = True
    is_core: bool = False
    options: list = field(default_factory=list)
    config: dict = field(default_factory=dict)


CORE = [
    FieldSpec("date", "Date", "date", JOB, table_position=1, required=True, on_card=True, is_core=True),
    FieldSpec("job_no", "Job Card No.", "number", JOB, table_label="Job Card No", table_position=2, on_card=True, is_core=True),
    FieldSpec("description", "Description of Work", "longtext", JOB, table_label="Description", table_position=3, required=True, on_card=True, is_core=True),
    FieldSpec("status", "Status", "choice", JOB, table_position=9, required=True, is_core=True, options=STATUS_OPTIONS),
    FieldSpec("closed_at", "Close Date", "date", JOB, table_position=10, on_form=False, is_core=True),
]

ELECTRICAL = [
    FieldSpec("section", "Section", "dropdown", JOB, table_position=4, on_card=True,
              options=_opts("Westgate", "Pine Hill", "Orchard Road", "Maple Court", "Harbor Lane", "Lake View"),
              config={"allow_custom": True}),
    FieldSpec("division", "Division", "choice", JOB, table_position=5, options=_opts("North", "South")),
    FieldSpec("dtc", "DTC", "text", LOCATION, table_position=7),
    FieldSpec("feeder_no", "Feeder No.", "text", LOCATION, table_label="Feeder No", table_position=8),
    FieldSpec("mo_no", "MO No.", "text", MONEY, table_label="MO No", table_position=11),
    FieldSpec("mo_amount", "MO Amount", "number", MONEY, table_position=12),
    FieldSpec("mo_id", "MO Id", "text", MONEY, table_label="MO ID", table_position=13),
    FieldSpec("wo_no", "W.O. No.", "text", MONEY, table_label="WO No", table_position=14),
    FieldSpec("wo_amount", "W.O Amount", "number", MONEY, table_position=15),
    FieldSpec("job_expenses", "Job Expenses", "longtext", MONEY, table_label="Expenses", table_position=16),
    FieldSpec("photos", "Photos", "photo", PHOTOS),
    FieldSpec("period", "Period", "text", CARD, on_card=True),
    FieldSpec("agency_name", "Name of Agency", "text", CARD, on_card=True),
    FieldSpec("subdivision", "Sub-Division Name", "text", CARD, table_label="Subdivision", table_position=6, on_card=True),
    FieldSpec("fault_location", "Fault Location", "text", CARD, on_card=True),
    FieldSpec("remarks", "Remarks", "longtext", CARD, on_card=True),
    FieldSpec("agency_rep", "Agency's Representative Name", "text", CARD, on_card=True),
    FieldSpec("line_staff", "Line Staff Name", "text", CARD, on_card=True),
    FieldSpec("section_officer", "Section Officer Name", "text", CARD, on_card=True),
    FieldSpec("subdivision_officer", "Sub Division Officer Name", "text", CARD, on_card=True),
]

# General site work: the same structure with trade-neutral wording, for crews in any trade.
_RELABEL = {
    "section": ("Site", None), "division": ("Zone", None), "dtc": ("Asset tag", None),
    "feeder_no": ("Unit or line", "Unit or line"), "mo_no": ("Quote no.", "Quote no"),
    "mo_amount": ("Quote amount", None), "mo_id": ("Quote ref", "Quote ref"),
    "wo_no": ("Work order no.", "Work order no"), "wo_amount": ("Work order amount", None),
    "agency_name": ("Contractor or team", None), "subdivision": ("Area", "Area"),
    "fault_location": ("Work location", None), "agency_rep": ("Team lead", None),
    "line_staff": ("Crew member", None), "section_officer": ("Site supervisor", None),
    "subdivision_officer": ("Project manager", None),
}
_GROUPS = {LOCATION: "Location", MONEY: "Quotes and orders", CARD: "Printable card details"}


def _general() -> list[FieldSpec]:
    out = []
    for spec in ELECTRICAL:
        label, table = _RELABEL.get(spec.key, (spec.label, spec.table_label))
        out.append(FieldSpec(**{**spec.__dict__, "label": label, "table_label": table or spec.table_label,
                                "group": _GROUPS.get(spec.group, spec.group)}))
    return out


TEMPLATES: dict[str, list[FieldSpec]] = {
    "general": CORE + _general(),
    "blank": CORE,
    "electrical": CORE + ELECTRICAL,
}
