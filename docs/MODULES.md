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

## อ่านข้อมูลข้ามไฟล์ + แจ้งเตือนสีตามสัดส่วนเวลา (branch claude/pfcm-lookup-alerts)

**ตัวอย่างการใช้งาน (คุม Delay วัตถุดิบ)**
1. ไฟล์ "เกณฑ์เวลา" 1 แถวต่อประเภท: `ประเภท | เตรียม→เย็น | เย็น→ออก | ออก→บรรจุ` ค่าเขียนได้ `5`, `5:30`, `4.23` (= 4 ชม. 23 นาที)
2. ในตารางวัตถุดิบ เพิ่มคอลัมน์ตัวเลข "เวลามาตรฐาน (นาที)" เปิดสูตร → "เพิ่มแหล่งข้อมูล" → เลือก โฟลเดอร์ → โฟลเดอร์ย่อย → ไฟล์ → ชีต ตั้งชื่อเรียก `เกณฑ์` แล้วใช้
   `HM(LOOKUP(@เกณฑ์[เตรียม→เย็น], @เกณฑ์[ประเภท], [ประเภทวัตถุดิบ]))`
3. คอลัมน์ Delay เปิด "แจ้งเตือนด้วยสี": เริ่ม = เตรียมเสร็จ, สิ้นสุด = เข้าห้องเย็น (ว่าง = นับถึงตอนนี้), มาตรฐาน = คอลัมน์ข้อ 2, ระดับ 50% เหลือง / 100% แดง / ปกติ เขียว

**หลักการ**
- `@ชื่อเรียก[คอลัมน์]` ใช้ได้เฉพาะใน `LOOKUP(...)`; เก็บในฐานข้อมูลเป็น id (`@{sheetId}[#columnId]`) เปลี่ยนชื่อคอลัมน์/ไฟล์ไม่พัง
- ต้องมีสิทธิ์อ่านไฟล์ต้นทางตอน *ตั้งค่า* เท่านั้น — ผู้ใช้ทั่วไปเห็นผลลัพธ์ในตารางนี้แม้เปิดไฟล์ต้นทางไม่ได้
- แก้ไฟล์ต้นทาง → ชีตที่อ่านถูกคำนวณใหม่อัตโนมัติ (หน่วง 3 วินาที, ตาราง `FormulaSources` เก็บว่าใครอ่านใคร, ห้ามอ่านกันเป็นวงกลม, ลบคอลัมน์ต้นทางที่ถูกใช้อยู่ไม่ได้)
- สีคำนวณในเบราว์เซอร์ทุก 1 นาที (เฉพาะเมื่อมีคอลัมน์ที่เปิดแจ้งเตือนและแท็บเปิดอยู่) ไม่มีโหลดฝั่งเซิร์ฟเวอร์; Excel/PDF ใช้สี ณ เวลาที่ส่งออก
- ต้องรัน `database/07_formula_sources.sql` (ระบบรัน migration ให้อัตโนมัติ)

**ยังไม่ทำ:** แจ้งเตือนผ่านระบบ (LINE/อีเมล) ตอนข้ามระดับ — ต้องมี worker ฝั่งเซิร์ฟเวอร์ แยกเป็นโมดูลถัดไป
