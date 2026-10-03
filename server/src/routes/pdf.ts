import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../config/db';
import { audit } from '../shared/audit';
import { ah, badRequest, ok, parse, pid, zId } from '../shared/http';
import { LV, requireFile } from '../shared/permissions';
import { parseTemplates, remapTemplates, sheetsOfFile } from '../services/pdfTemplates';

const router = Router();
const MAX_BYTES = 3_000_000;

const templateSchema = z.object({ id: z.string().min(1).max(60), name: z.string().trim().min(1).max(200) }).passthrough();

/** Anyone who can read the file can export with its layouts */
router.get(
  '/files/:id/pdf-templates',
  ah(async (req, res) => {
    const id = pid(req);
    const { file, level } = await requireFile(req.user!, id, LV.read);
    ok(res, { templates: parseTemplates(file.pdf_templates), canEdit: level >= LV.manage });
  }),
);

/** Owner / managers / admin design the layouts */
router.put(
  '/files/:id/pdf-templates',
  ah(async (req, res) => {
    const id = pid(req);
    const { file } = await requireFile(req.user!, id, LV.manage);
    const body = parse(z.object({ templates: z.array(templateSchema).max(30) }), req.body);
    const json = JSON.stringify(body.templates);
    if (json.length > MAX_BYTES) throw badRequest('รูปแบบ PDF มีขนาดใหญ่เกินไป');
    await q(`UPDATE Files SET pdf_templates = @t, updated_at = SYSUTCDATETIME() WHERE file_id = @id`, { t: T.text(json), id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'pdf_template_save', entityType: 'file', entityId: id, fileId: id, newValue: { templates: body.templates.map((t) => t.name), name: file.file_name } }, req);
    ok(res, { saved: true });
  }),
);

/** Copy the layouts of another file into this one (sheets are matched by name) */
router.post(
  '/files/:id/pdf-templates/copy-from',
  ah(async (req, res) => {
    const id = pid(req);
    const { file } = await requireFile(req.user!, id, LV.manage);
    const body = parse(z.object({ sourceFileId: zId, templateIds: z.array(z.string()).max(30).optional() }), req.body);
    const { file: src } = await requireFile(req.user!, body.sourceFileId, LV.read);
    let tpls = parseTemplates(src.pdf_templates);
    if (body.templateIds?.length) tpls = tpls.filter((t) => body.templateIds!.includes(t.id));
    if (!tpls.length) throw badRequest('ไฟล์ต้นทางยังไม่มีรูปแบบ PDF');
    const copied = remapTemplates(tpls, await sheetsOfFile(src.file_id), await sheetsOfFile(id));
    const merged = [...parseTemplates(file.pdf_templates), ...copied.map((t) => ({ ...t, name: `${t.name} (คัดลอกจาก ${src.file_name})`.slice(0, 200) }))].slice(0, 30);
    await q(`UPDATE Files SET pdf_templates = @t, updated_at = SYSUTCDATETIME() WHERE file_id = @id`, { t: T.text(JSON.stringify(merged)), id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'pdf_template_save', entityType: 'file', entityId: id, fileId: id, newValue: { copiedFrom: src.file_name, count: copied.length } }, req);
    ok(res, { templates: merged });
  }),
);

export default router;
