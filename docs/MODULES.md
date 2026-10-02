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

## แจ้งเตือนผ่าน LINE (ต่อจากสีแจ้งเตือน)

- ใช้ **LINE Messaging API** (LINE Notify ปิดบริการแล้ว) ต้องมี Channel access token + Channel secret ของ LINE Official Account ตั้งเป็น env `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` (ห้าม commit ค่าจริง)
- ตั้ง Webhook URL ของ channel เป็น `https://<โดเมนของระบบ>/api/line/webhook` (LINE ต้องเรียกได้จากอินเทอร์เน็ต และเป็น HTTPS) เชิญบอทเข้ากลุ่ม แล้วพิมพ์ `id` → บอทตอบ ID และกลุ่มจะโผล่ในรายการเลือกผู้รับ
- ในตัวตั้งค่าคอลัมน์ที่เปิดแจ้งเตือนสี: เปิด "ส่งแจ้งเตือนทาง LINE" เลือกผู้รับ ระดับที่ต้องการแจ้ง และคอลัมน์ที่ใส่ในข้อความ (เช่น รหัสวัตถุดิบ) แล้วกด "ส่งทดสอบ"
- เซิร์ฟเวอร์ตรวจทุก 60 วินาที (ไม่ต้องเปิดหน้าเว็บ) เฉพาะแถวที่ยังไม่มีเวลาสิ้นสุดและเริ่มภายใน 7 วัน แจ้งครั้งเดียวต่อแถวต่อระดับ (ตาราง `AlertNotified`); ถ้าส่งไม่สำเร็จจะลองใหม่ และพักผู้รับนั้น 5 นาทีเมื่อล้มเหลว
- ต้องรัน `database/08_line_alerts.sql` (migration อัตโนมัติ)

## สแกน QR ตามรูปแบบที่กำหนด + ผสมวัตถุดิบ (ตัดน้ำหนัก)

**สแกน QR** (ปุ่ม "ตั้งค่าสแกน/ผสม" → แท็บ "รูปแบบ QR", ผู้จัดการชีต)
- กำหนดได้หลายรูปแบบต่อชีต: **ตัวคั่น** (`|`, `,`, `;`, `\t`…), **ชุดที่ N → คอลัมน์ไหน** (วางข้อความตัวอย่างเพื่อดูว่าแต่ละชุดคืออะไร), และ **เมื่อสแกน** = เพิ่มแถวใหม่ หรือ อัปเดตแถวที่มีอยู่ (หาแถวจากคอลัมน์ที่เลือก เช่น mapping_id; ถ้าไม่พบ แจ้งหรือเพิ่มแถวใหม่)
- เลือกรูปแบบอัตโนมัติจากข้อความ: ขึ้นต้นด้วย / จำนวนชุดพอดี / regex — ใช้ข้อกำหนดที่ตรงมากที่สุด
  ตัวอย่าง `14L11DFF | BATCH123 | 12345 | 25 | KG.` ตัวคั่น `|` → ชุด 1 = รหัส, 2 = Batch, 3 = เลขที่, 4 = น้ำหนัก, 5 = หน่วย
- ปุ่ม "สแกน" บนแถบเครื่องมือ: ช่องรับข้อความจากเครื่องสแกนแบบ keyboard (กด Enter ให้เอง) หรือ RFID ที่ส่งเป็นข้อความ สแกนต่อเนื่องได้ มีเสียงสำเร็จ/ไม่สำเร็จ ค่าทุกชุดผ่านการตรวจชนิดข้อมูล/กติกาเดียวกับการพิมพ์ (บังคับที่เซิร์ฟเวอร์: `POST /api/sheets/:id/scan`)
- กล้องมือถือยังไม่ได้ทำ (ยังไม่มีไลบรารีอ่าน QR ในโปรเจกต์)

**ผสม** (แท็บ "การผสม / ตัดน้ำหนัก")
- ผู้จัดการเลือก **คอลัมน์ที่ตัดน้ำหนัก** (ตัวเลข), คอลัมน์ที่ใช้หาแถวตอนสแกน (เช่น mapping_id), คอลัมน์ที่คัดลอกไปล็อตใหม่ (เช่น ชนิดวัตถุดิบ) และคอลัมน์ที่ต้องเท่ากันทุกแถวที่ผสม (ถ้าต้องการ)
- ปุ่ม "ผสม": สแกน/พิมพ์ค่า หรือเพิ่มจากแถวที่ติ๊ก ใส่จำนวนที่ใช้ (ค่าเริ่มต้น = คงเหลือทั้งหมด) → ระบบหักจากแถวต้นทาง สร้างแถวใหม่ (คอลัมน์เลขที่อัตโนมัติ/mapping_id **ออกเลขใหม่**) น้ำหนักรวมใส่ในคอลัมน์เดียวกัน และบันทึกความสัมพันธ์ใน `RowLinks` — สำเร็จทั้งหมดหรือไม่ทำเลย (transaction เดียว, ล็อกแถวกันสองคนตัดพร้อมกัน)
- ใช้เกินคงเหลือไม่ได้ ล็อตหนึ่งแบ่งไปผสมหลายล็อตได้ (ตัดเป็นส่วนๆ) ผลลัพธ์อยู่ในชีตเดียวกับต้นทาง
- ต้องรัน `database/09_row_links.sql` (migration อัตโนมัติ); ดูความสัมพันธ์ระดับเดียวได้ที่ `GET /api/sheets/:id/rows/:rowId/links` (ฐานของหน้า Traceback)

## รายการย่อยในแถว (รถเข็น 1 คันหลายวัตถุดิบ)
- ตั้งที่ "ตั้งค่าสแกน/ผสม" → แท็บ "รายการในแถว": เลือกชีตรายการ (1 แถว = 1 วัตถุดิบ), คอลัมน์ที่แสดง และปุ่มทำพร้อมกันทุกรายการ (เช่น "ออกห้องเย็น" = ลงเวลาปัจจุบันในคอลัมน์ที่เลือกให้ทุกวัตถุดิบบนรถเข็น)
- ใช้งาน: ติ๊กแถวรถเข็น 1 แถว → ปุ่ม "รายการในแถว" → สแกน QR ของวัตถุดิบ (ใช้รูปแบบ QR ของชีตรายการ) เพิ่ม/เอาออก/กดปุ่มทำพร้อมกัน; รายการอยู่ได้ที่รถเข็นเดียว ย้ายไปแถวอื่นระบบย้ายให้และบันทึกประวัติ (`line_move`)
- เก็บใน `RowLinks` (role `contains`) — ตัวเดียวกับที่ Traceback ใช้ ผลคือย้อนรอยจากวัตถุดิบไปหารถเข็น/ล็อตผสมได้

## Traceback (เมนู "ย้อนรอย")
- เลือกไฟล์ → ชีต → คอลัมน์ (ค่าตั้งต้น = คอลัมน์ค้นหาของการผสม) → สแกน/พิมพ์ค่า → กราฟต้นทาง (ซ้าย) ← แถวที่ค้น → ปลายทาง (ขวา) พร้อมปริมาณที่ใช้บนเส้น; "ทำมาจากอะไร / ไปอยู่ที่ไหน / ทั้งสองทิศ"; กดกล่องดูรายละเอียด, ย้อนรอยต่อจากกล่องนั้น, เปิดชีต, ดาวน์โหลด CSV
- แถวในชีตที่ผู้ใช้ไม่มีสิทธิ์อ่านจะแสดงเป็น 🔒 ไม่เปิดเผยข้อมูล (แต่เห็นว่ามีความเชื่อมโยง) — ลึกสูงสุด 12 ชั้น, ไม่เกิน 300 แถว, กันวนซ้ำ
- ยังไม่ได้ทำ: ส่งออก PDF แม่แบบ "รายงานย้อนรอย" (CSV ใช้ได้ก่อน), นำเข้าความสัมพันธ์การผสมเก่าจาก PFCMv2 เข้า `RowLinks`

## อุปกรณ์ RFID / IoT (เมนู "อุปกรณ์", ผู้ดูแล/master)
- เพิ่มอุปกรณ์: **เครื่องอ่าน RFID (TCP)** (IP/พอร์ต, โปรโตคอลเดียวกับ RFIDc1.js: เฟรม `CC FF FF 20…` EPC 12 ไบต์, กรอง EPC ขยะ, ต่อใหม่แบบ back-off, ตัดสายที่เงียบนาน) และ **HTTP/IoT** (`POST /api/devices/ingest` + header `X-Device-Key`, เก็บเฉพาะแฮชของคีย์, แสดงคีย์ครั้งเดียว)
- ในแต่ละชีต (ผู้จัดการ): ปุ่ม "อุปกรณ์" = สวิตช์รับข้อมูลจากอุปกรณ์ + เลือกรูปแบบ QR; ค่าที่อ่านได้เข้า pipeline เดียวกับสแกน (เพิ่ม/อัปเดตแถว) **ฝั่งเซิร์ฟเวอร์ ไม่ต้องเปิดหน้าเว็บ** ในนามและสิทธิ์ของคนที่เปิดสวิตช์ ค่าซ้ำใน 5 วินาทีนับเป็นครั้งเดียว มี log (30 วัน)
- หน้า "อุปกรณ์": สถานะ/อ่านล่าสุด/เปิด-ปิด, การอ่านสด (อัปเดตทุก 4 วินาที), ช่อง **จำลองการอ่าน** (ทดสอบโดยไม่มีเครื่องจริง)
- ⚠️ **เครื่องอ่านรับการเชื่อมต่อได้โปรแกรมเดียว**: ตัวเชื่อมต่อปิดเป็นค่าตั้งต้น เปิดด้วย `GATEWAY_ENABLED=1` ที่ process เดียวเท่านั้น และเฉพาะเมื่อเลิกใช้ RFIDc1.js เดิมกับเครื่องนั้นแล้ว
- กรณี EPC ที่ยังไม่รู้จัก: ใช้รูปแบบ QR แบบ "อัปเดต" (หาแถวจากคอลัมน์ EPC) ถ้าไม่พบแจ้งว่าไม่พบ/เพิ่มแถวใหม่ — ยังไม่มีหน้าผูก EPC→รถเข็นแบบหน้าเดิมของ PFCM (ใช้ตาราง Tag registry ในอนาคต)
- migration: `database/10_devices.sql`

## อุปกรณ์: เงื่อนไขอ่านซ้ำ + ลงเวลาตามลำดับ (เพิ่มเติม)
- **คำสั่งเริ่มอ่าน:** เครื่องอ่านส่งแท็กหลังได้รับ 2 คำสั่งตอนเชื่อมต่อ (เหมือน RFIDc1.js: `7CFFFF823200D2` + checksum, `7CFFFF20000501000200C896`) — ตัวเชื่อมต่อส่งให้อัตโนมัติ ค่าตั้งต้นตรงกับ PFCM เดิม แก้ได้ที่ "แก้ไขอุปกรณ์ → ขั้นสูง" EPC ที่อ่านได้ระบบแยกเป็น hex จากเฟรมเอง ไม่ต้องตั้งค่า
- **ไม่อ่านการ์ดเดิมซ้ำภายใน N นาที:** ตั้งต่อชีตที่ปุ่ม "อุปกรณ์" ของชีต (ทศนิยมได้ 0 = ไม่กัน) — จำเป็น (ชีต, ค่า) ในฐานข้อมูล (`DeviceCooldown`) ใช้ร่วมกันทุกเครื่องอ่านที่เขียนเข้าชีตนั้น และไม่หายเมื่อ restart; อ่านล้มเหลว (เช่น ไม่พบการ์ด) จะไม่เริ่มนับเวลารอ; การอ่านซ้ำถี่ๆ ของเครื่องเดียว (ภายใน 3 วินาที, `DEVICE_DEBOUNCE_MS`) ถูกรวมเป็นครั้งเดียวเสมอ
- **ลงเวลาตามลำดับ (เข้า → ออก):** ในรูปแบบ QR โหมด "อัปเดตแถวที่มีอยู่" เลือก "ลงเวลาตามลำดับ" = คอลัมน์เวลา 1, 2, … สแกนครั้งที่ 1 ลงคอลัมน์ 1, ครั้งที่ 2 ของการ์ดใบเดิมลงคอลัมน์ 2 (ใช้แถวล่าสุดของการ์ด) เมื่อครบ: ไม่ทำอะไร / แจ้งครบแล้ว / เริ่มรอบใหม่ (เพิ่มแถวใหม่ เก็บแถวเดิม) — ใช้ได้ทั้งสแกนมือและจากอุปกรณ์
- migration: `database/11_device_cooldown.sql`

## ตรวจค่าที่สแกนกับตารางอื่น (EPC → ทะเบียนรถเข็น)
- ในรูปแบบ QR/อ่านค่า: เปิด "ตรวจค่าที่สแกนกับตารางอื่นก่อนบันทึก" → เลือกไฟล์ → ชีต → คอลัมน์ที่ต้องตรงกับค่าที่สแกน (เช่น EPC) และข้อมูลของชีตนี้ที่จะนำไปตรวจ
- **ไม่พบ:** ไม่บันทึกอะไร (ไม่สร้างแถว ไม่ลงเวลา, ไม่เริ่มนับเวลารอ) และการอ่านขึ้นเป็นผิดพลาดพร้อมค่า EPC ในหน้า "อุปกรณ์" / หรือเลือก "บันทึกต่อโดยไม่เติมค่า"
- **พบ:** เติมคอลัมน์ที่เลือกจากแถวนั้นมาในชีตนี้ (เช่น `tro_id`, ชื่อวัตถุดิบ) ก่อนเพิ่ม/อัปเดตแถวและลงเวลาเข้า-ออก; ค่าที่สแกนมาเองมีความสำคัญกว่าค่าที่เติม
- ไม่ต้องมีสิทธิ์เปิดไฟล์ทะเบียนตอนใช้งาน (ตรวจสิทธิ์อ่านตอนตั้งค่าเท่านั้น); ใช้ได้ทั้งสแกนมือและอุปกรณ์
- ยังไม่มีหน้า "EPC ที่ไม่รู้จัก → ผูก tro_id" แบบ PFCM เดิม (ตอนนี้ดู EPC ที่ถูกปฏิเสธได้ในรายการอ่านล่าสุดแล้วไปเพิ่มในทะเบียนเอง)
