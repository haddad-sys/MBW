#!/usr/bin/env python3
"""Build QMS-Document-Register.xlsx — the workbook the HTML app uses as its database.

The app talks to the worksheet table named DocumentRegister through the Microsoft
Graph Excel API, so two things in here are contractual and must not drift:

  * the table is called DocumentRegister
  * the header row spells the field names the app looks for

Everything else (column widths, validation, conditional formatting, the dashboard)
is for the humans who open the file in Excel.

Dates are stored as ISO text (YYYY-MM-DD) in text-formatted columns on purpose.
Excel would otherwise coerce them to serial numbers, which the Graph API hands back
as raw numbers and the app would have to convert on every read and write. ISO text
round-trips exactly, still sorts correctly, and still drives the date-based
conditional formatting below via string comparison.
"""

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

OUT = "QMS-Document-Register.xlsx"
MAX_ROW = 2000  # how far validation, formatting and dashboard formulas reach

# (header, column width). The header text is the contract with the HTML app.
COLUMNS = [
    ("Doc No", 18),
    ("Title", 46),
    ("Type", 10),
    ("Function", 22),
    ("Process", 26),
    ("Owner", 30),
    ("Rev", 7),
    ("Status", 20),
    ("Issue Date", 13),
    ("Next Review", 13),
    ("Location", 34),
    ("Language", 11),
    ("Parent Doc", 16),
    ("ISO 9001 Clauses", 20),
    ("Notes", 40),
]

TYPES = ["PO", "MN", "PR", "WI", "FM", "GL", "ST", "TR"]
STATUSES = [
    "Approved", "In Review", "In Development", "Planned",
    "Under Revision", "Superseded", "Withdrawn", "Uncontrolled (legacy)",
]
LANGUAGES = ["EN", "AR", "Bilingual"]
FUNCTIONS = [
    "Quality Assurance", "Operations", "HSSE", "Engineering", "Maintenance",
    "Human Resources", "Finance", "Procurement", "Information Technology",
]

# Realistic starting rows so the app has something to show and the expected
# format of every column is visible. Safe to delete once real data goes in.
SEED = [
    ["QMS-PO-001", "Quality Policy", "PO", "Quality Assurance",
     "Management System Governance", "Chief Executive Officer", "3", "Approved",
     "2025-01-15", "2028-01-15", "/sites/QMS/Controlled/Policies", "Bilingual",
     "", "5.2", "Example row — delete once real records are entered"],
    ["QMS-PR-004", "Control of Documented Information", "PR", "Quality Assurance",
     "Document Control", "Quality Assurance Manager", "2", "Approved",
     "2025-03-02", "2027-03-02", "/sites/QMS/Controlled/Procedures", "EN",
     "QMS-MN-001", "7.5.2, 7.5.3", "Example row — delete once real records are entered"],
    ["QMS-PR-011", "Management of Change", "PR", "Operations",
     "Operational Planning and Control", "Operations Manager", "—", "Planned",
     "", "", "", "EN", "QMS-MN-001", "8.1, 8.5.6",
     "Example row — gap identified during the documentation review"],
]

HEADER_FILL = PatternFill("solid", fgColor="1F3864")
TITLE_FONT = Font(name="Arial", size=14, bold=True, color="1F3864")
HEADER_FONT = Font(name="Arial", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="Arial", size=10)
LABEL_FONT = Font(name="Arial", size=10, bold=True)
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def build_register(ws):
    for idx, (header, width) in enumerate(COLUMNS, start=1):
        letter = get_column_letter(idx)
        cell = ws.cell(row=1, column=idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", horizontal="left")
        ws.column_dimensions[letter].width = width
    ws.row_dimensions[1].height = 22

    for r, record in enumerate(SEED, start=2):
        for c, value in enumerate(record, start=1):
            cell = ws.cell(row=r, column=c, value=value)
            cell.font = BODY_FONT
            cell.alignment = Alignment(vertical="top", wrap_text=(c in (2, 15)))

    # Text format on the two date columns and on Rev, which accepts "—" for
    # planned documents and must not be read as a number.
    for column in ("G", "I", "J"):
        for r in range(2, MAX_ROW + 1):
            ws[f"{column}{r}"].number_format = "@"

    last = get_column_letter(len(COLUMNS))
    table = Table(displayName="DocumentRegister", ref=f"A1:{last}{len(SEED) + 1}")
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showRowStripes=True, showColumnStripes=False,
        showFirstColumn=False, showLastColumn=False,
    )
    ws.add_table(table)
    ws.freeze_panes = "A2"

    validations = [
        ("C", "TypeList"), ("D", "FunctionList"),
        ("H", "StatusList"), ("L", "LanguageList"),
    ]
    for column, name in validations:
        dv = DataValidation(type="list", formula1=f"={name}", allow_blank=True,
                            showDropDown=False, errorStyle="warning")
        dv.error = "Value is not on the controlled list for this column."
        dv.errorTitle = "Not a controlled value"
        ws.add_data_validation(dv)
        dv.add(f"{column}2:{column}{MAX_ROW}")

    overdue = FormulaRule(
        formula=[f'AND($J2<>"",$J2<TEXT(TODAY(),"yyyy-mm-dd"),'
                 f'$H2<>"Withdrawn",$H2<>"Superseded")'],
        fill=PatternFill("solid", fgColor="FFC7CE"),
        font=Font(name="Arial", size=10, color="9C0006"),
    )
    ws.conditional_formatting.add(f"J2:J{MAX_ROW}", overdue)

    planned = FormulaRule(
        formula=['OR($H2="Planned",$H2="In Development")'],
        fill=PatternFill("solid", fgColor="FFF2CC"),
        font=Font(name="Arial", size=10, color="7F6000"),
    )
    ws.conditional_formatting.add(f"H2:H{MAX_ROW}", planned)


def build_lists(ws):
    columns = [("Type", TYPES), ("Status", STATUSES),
               ("Language", LANGUAGES), ("Function", FUNCTIONS)]
    for idx, (header, values) in enumerate(columns, start=1):
        letter = get_column_letter(idx)
        cell = ws.cell(row=1, column=idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        ws.column_dimensions[letter].width = max(len(header), *(len(v) for v in values)) + 4
        for r, value in enumerate(values, start=2):
            ws.cell(row=r, column=idx, value=value).font = BODY_FONT
    ws.sheet_state = "visible"


def build_dashboard(ws):
    ws["A1"] = "QMS Document Register — Status Summary"
    ws["A1"].font = TITLE_FONT
    ws["A3"] = ("Figures recalculate from the Register sheet. The HTML register app "
                "writes to that sheet, so this stays current as records are added.")
    ws["A3"].font = Font(name="Arial", size=9, italic=True, color="595959")

    rows = [
        ("Total documents on the register",
         f'=COUNTA(Register!$A$2:$A${MAX_ROW})'),
        ("Approved", f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"Approved")'),
        ("In review", f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"In Review")'),
        ("In development", f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"In Development")'),
        ("Planned (documentation gaps)",
         f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"Planned")'),
        ("Under revision", f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"Under Revision")'),
        ("Uncontrolled (legacy)",
         f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"Uncontrolled (legacy)")'),
        ("Superseded or withdrawn",
         f'=COUNTIF(Register!$H$2:$H${MAX_ROW},"Superseded")'
         f'+COUNTIF(Register!$H$2:$H${MAX_ROW},"Withdrawn")'),
        ("Overdue for review",
         f'=SUMPRODUCT((Register!$J$2:$J${MAX_ROW}<>"")'
         f'*(Register!$J$2:$J${MAX_ROW}<TEXT(TODAY(),"yyyy-mm-dd"))'
         f'*(Register!$H$2:$H${MAX_ROW}<>"Withdrawn")'
         f'*(Register!$H$2:$H${MAX_ROW}<>"Superseded"))'),
        ("Approved with no location recorded",
         f'=SUMPRODUCT((Register!$H$2:$H${MAX_ROW}="Approved")'
         f'*(Register!$K$2:$K${MAX_ROW}=""))'),
    ]
    for offset, (label, formula) in enumerate(rows):
        r = 5 + offset
        ws.cell(row=r, column=1, value=label).font = LABEL_FONT
        value_cell = ws.cell(row=r, column=2, value=formula)
        value_cell.font = BODY_FONT
        value_cell.alignment = Alignment(horizontal="center")
        for column in (1, 2):
            ws.cell(row=r, column=column).border = BOX

    ws.column_dimensions["A"].width = 42
    ws.column_dimensions["B"].width = 12


def build_instructions(ws):
    ws["A1"] = "How this workbook is used"
    ws["A1"].font = TITLE_FONT
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 96

    notes = [
        ("This workbook",
         "It is the database behind the QMS register web page. The page reads and "
         "writes the Register sheet directly through the Microsoft Graph Excel API, "
         "so records added on the page appear here and vice versa."),
        ("Register sheet",
         "One row per document, including documents that are only planned. The table "
         "is named DocumentRegister — do not rename it and do not rename the header "
         "row, or the web page will stop finding its columns."),
        ("Adding columns",
         "Adding a column at the right-hand end of the table is safe; the page maps "
         "columns by header name and ignores ones it does not know. Add the matching "
         "field to the page's FIELDS list to make it editable there."),
        ("Dates",
         "Issue Date and Next Review are stored as text in YYYY-MM-DD form. This keeps "
         "values identical whether they are written from Excel or from the web page. "
         "Next Review turns red once it is in the past."),
        ("Rev",
         "Stored as text so a planned document can carry an em dash rather than a number."),
        ("Controlled lists",
         "Type, Function, Status and Language are restricted to the values on the Lists "
         "sheet. Extend a list there and both Excel and the web page pick it up on the "
         "next reload."),
        ("Editing in Excel",
         "Safe to do, including at the same time as someone uses the web page, provided "
         "the file is opened in Excel for the web. Editing the same row in both places "
         "at once is still last-write-wins — the page checks the Doc No before it saves "
         "and refuses the write if the row moved underneath it."),
        ("Example rows",
         "The three seeded rows are there to show the expected format. Delete them once "
         "real records are entered."),
        ("Register as a controlled document",
         "The register is itself controlled information: give it a document number, an "
         "owner and a revision, and record it as a row in itself."),
    ]
    for offset, (label, text) in enumerate(notes):
        r = 3 + offset * 2
        ws.cell(row=r, column=1, value=label).font = LABEL_FONT
        ws.cell(row=r, column=1).alignment = Alignment(vertical="top")
        cell = ws.cell(row=r, column=2, value=text)
        cell.font = BODY_FONT
        cell.alignment = Alignment(vertical="top", wrap_text=True)
        ws.row_dimensions[r].height = 30


def main():
    wb = Workbook()

    register = wb.active
    register.title = "Register"
    lists = wb.create_sheet("Lists")
    dashboard = wb.create_sheet("Dashboard")
    instructions = wb.create_sheet("Instructions")

    build_lists(lists)
    for name, column, values in [("TypeList", "A", TYPES),
                                 ("StatusList", "B", STATUSES),
                                 ("LanguageList", "C", LANGUAGES),
                                 ("FunctionList", "D", FUNCTIONS)]:
        ref = f"Lists!${column}$2:${column}${len(values) + 1}"
        wb.defined_names.add(DefinedName(name, attr_text=ref))

    build_register(register)
    build_dashboard(dashboard)
    build_instructions(instructions)

    wb.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
