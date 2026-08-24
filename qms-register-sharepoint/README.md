# QMS Document Register — an HTML page backed by an Excel file on SharePoint

A single-page register for controlled documents. The page runs in the browser and
reads and writes an `.xlsx` file stored in SharePoint through the Microsoft Graph
Excel API. There is no server and no separate database — the workbook *is* the
database. Anyone can open the same file in Excel and see exactly what the page
wrote, and anything they type in Excel shows up in the page.

```
  browser                    Microsoft Graph                SharePoint
 ┌──────────────┐           ┌────────────────┐            ┌──────────────────┐
 │ index.html   │  HTTPS    │ /workbook/     │            │ QMS-Document-    │
 │  · sign-in   │ ────────► │   tables/…     │ ─────────► │ Register.xlsx    │
 │  · add/edit  │  token    │   range(…)     │            │  Register sheet  │
 └──────────────┘           └────────────────┘            └──────────────────┘
```

## What's here

| File | What it is |
|---|---|
| `index.html` | The whole application — markup, styles and script in one file, no dependencies and no build step |
| `QMS-Document-Register.xlsx` | The workbook the page talks to, with the `DocumentRegister` table, controlled lists, a status dashboard and instructions |
| `tools/build-workbook.py` | Regenerates the workbook from scratch |
| `test/browser-pass.mjs` | End-to-end pass over the page in a real browser against a stubbed Graph API |
| `SETUP.md` | Entra ID app registration, hosting, and connecting the two |

## What the page does

- Lists the register with search and filters on status, type and owning function; sortable columns.
- Adds, edits and deletes rows, writing straight into the Excel table.
- Suggests the next document number in the series when you pick a type.
- Refuses duplicate document numbers and a review date that falls before the issue date.
- Flags documents overdue for review, and counts documentation gaps.
- Runs integrity checks over the register: duplicate numbers, parent documents that
  aren't on the register, approved documents with no location, rows with no owner.

## How the page and the workbook agree with each other

The contract is deliberately small:

- The worksheet is called **Register** and the table on it is called **DocumentRegister**.
- Columns are matched **by header text**, not by position. Reordering columns in Excel is safe.
- A column the page doesn't know about is left untouched when it saves a row, so you can add
  your own columns without losing their contents.
- To make a new column editable in the page, add an entry to the `FIELDS` list near the top of
  the script in `index.html`.
- `Type`, `Function`, `Status` and `Language` are read from the **Lists** sheet at load, so
  extending a controlled list in Excel extends the dropdowns in the page.

Dates are stored as text in `YYYY-MM-DD` form. Excel would otherwise convert them to serial
numbers, which Graph hands back as raw numbers — storing them as text means a value written in
Excel and a value written in the page are identical, and sorting still works.

## Things to know before relying on this

These are properties of using a spreadsheet as a database, not defects in the code:

- **No row locking.** Two people editing the *same row* at the same time is last-write-wins.
  The page reduces the damage: before saving it re-reads the row and refuses to write if the
  document number no longer matches, which catches the case where someone else's insert or
  delete shifted the row. It cannot catch two simultaneous edits of the same row.
- **No transactions.** Each save is one API call. There is no rollback.
- **It loads the whole table.** Fine into the low thousands of rows; past that, expect the
  initial load to slow noticeably.
- **The file can be locked.** Editing the workbook in Excel *for the web* alongside the page is
  fine. Having it open in the desktop Excel app can block writes.
- **Deleting is real.** On a controlled register the right move is almost always to set the
  status to `Withdrawn` or `Superseded`, which keeps the history. The delete button says so
  before it acts.

If the register grows past a few thousand rows, or several people need to edit it at once all
day, move the data to a SharePoint list and keep Excel as a scheduled export. The page's data
layer is confined to the `workbook` object, so the swap is contained.

## Running the tests

Playwright is not a dependency of this folder. The test serves the page from localhost and
replaces `window.fetch` with an in-memory model of the workbook, then drives the real UI:

```bash
npm install --no-save playwright
node test/browser-pass.mjs
```

Set `PLAYWRIGHT_CHROMIUM` to an existing Chromium binary if you don't want Playwright to
download one.

## Rebuilding the workbook

```bash
pip install openpyxl
python3 tools/build-workbook.py
```

The workbook contains formulas on the Dashboard sheet. openpyxl writes formulas without
cached results, so the dashboard reads as blank until the file is opened once in Excel, which
computes and stores them.
