# Modules and extension points

Each feature below is a small module with **one registration point**. The core never imports a module's internals,
so a module can be changed or removed without touching the rest.

| Module | Server | Client | Registers itself via |
|---|---|---|---|
| Formula columns | `server/src/modules/formula/` | `client/src/modules/formula/` | `services/hooks.ts` (guard, after-write, after-copy) |
| Export archive | `server/src/modules/exportArchive/` | `client/src/modules/exportArchive/` | one router in `server/src/index.ts` |
| PDF variables | – | `client/src/lib/pdf/variables.ts` | `registerVariable()` |
| PDF block types | – | `client/src/lib/pdf/blocks/*` + `components/pdf/blocks/*` | `registerBlockModule()` + `registerBlockForm()` |

## Core hooks (`server/src/services/hooks.ts`)

| Hook | Called | Used by |
|---|---|---|
| `registerColumnGuard(fn)` | before a user writes a cell / creates / imports a row | formula: refuse writes to computed columns |
| `registerAfterCellsWritten(fn)` | inside the same transaction after cells were written (edit, create, import) | formula: recompute dependent cells (returned cells are reported to the editor like normal edits) |
| `registerAfterSheetCopied(fn)` | after a sheet's columns were copied (duplicate file, union sheet) | formula: re-point `[#column-id]` references |

## Formula columns

* A formula column is a **normal typed column** (text / number / date / yes-no) with `validation.formula.expr`.
  The result is stored in `Cells`, so sort, filter, dashboards, Excel and PDF export all work unchanged.
* The expression is edited with column **names** (`[น้ำหนัก]`) and stored with column **ids** (`[#<guid>]`), so renaming a column never breaks it.
* Recomputed when a cell of the row changes, when a row is created / imported, and for the whole sheet when the formula changes
  (in the background above 20,000 rows). Circular references are rejected when saving. A column used by a formula cannot be deleted.
* Add a function: `registerFunction({ name, minArgs, maxArgs, fn, doc })` in `modules/formula/functions.ts` — the parser, the editor's
  function list (`GET /api/formula/functions`) and the checks pick it up automatically.
* Tests: `cd server && npm test` (parser, evaluator, and `pfcmParity.test.ts` which compares DBS 1–4 with the old PFCM report on 400 random rows).

## Export archive

* `POST /api/files/:id/exports` (multipart: `pdf`, `meta`) needs **write** on the file (checked before anything is written to disk);
  `GET /api/files/:id/exports` and `GET /api/exports/:id/download|verify` need **read**; `DELETE` needs **manage**.
* PDFs live in `ARCHIVE_DIR` (default `server/archive`, **not** served publicly). The database keeps title, template, answers, signer names,
  user, time and a SHA-256 (`/verify` recomputes it). Downloads are written to the audit log.
* Migration: `database/06_export_archive.sql` (applied automatically at start, idempotent).

## PDF templates

* `PdfTemplate.prompts` — questions asked in the export dialog; each answer is `{{key}}` in any text. Defaults may be `@today`, `@shift`, `@user`.
* `{{shift}}` follows `PdfTemplate.settings.shift` (default 06:00–18:00 = DS, otherwise NS).
* Blocks: built-ins plus `signature` (names asked in the dialog) and `infoRow` (Date / Shift / Line / Plant …).
  Add a block type = `registerBlockModule({ type, label, scopes, create, build })` (builder) and `registerBlockForm(type, Form)` (designer).
* Ready-made example for the old "Report" page: `docs/presets/rm-pack-report.md` (+ importable `rm-pack-report.template.json`).

## Known limits

* Server code that talks to SQL Server was **type-checked but not run** against a database in development; run through the scenarios in the
  pull request description on a test database first.
* Cell values are stored one row per cell (EAV). Check performance with realistic volumes before relying on formula columns for very large sheets.
* Formula columns on a **union** sheet are compared by column names; a union keeps the formulas of its first source (re-pointed to the union's columns).
