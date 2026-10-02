import { Router } from 'express';
import { z } from 'zod';
import { ah, badRequest, ok, parse, pid } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { loadColumns } from '../../services/cellWriter';
import { compileFormula, listFunctions } from './index';
import { FormulaSyntaxError } from './types';
import { countRows, FORMULA_TYPES, recomputeSheet, SYNC_LIMIT_ROWS } from './service';
import { logger } from '../../shared/logger';

const router = Router();

/** Functions the formula language offers (for the editor's helper list) */
router.get('/formula/functions', ah(async (_req, res) => ok(res, { functions: listFunctions() })));

/** Live check while the manager types a formula */
router.post(
  '/sheets/:id/formula/validate',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.manage);
    const body = parse(z.object({ expr: z.string().max(2000), dataType: z.string().max(30), columnId: z.string().max(60).nullish() }), req.body);
    if (!FORMULA_TYPES.has(body.dataType)) throw badRequest('ชนิดข้อมูลนี้ใช้สูตรไม่ได้');
    const cols = await loadColumns(sheetId);
    try {
      const c = compileFormula(body.expr, cols.filter((x) => x.column_id !== body.columnId).map((x) => ({ id: x.column_id, name: x.column_name, dataType: x.data_type })), { selfId: body.columnId ?? undefined });
      ok(res, { valid: true, display: c.display, dependsOn: c.deps });
    } catch (e) {
      if (e instanceof FormulaSyntaxError) return ok(res, { valid: false, message: e.message, pos: e.pos });
      throw e;
    }
  }),
);

/** Recalculate every formula column of the sheet (e.g. after importing data by another route) */
router.post(
  '/sheets/:id/formula/recompute',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.manage);
    if ((await countRows(sheetId)) > SYNC_LIMIT_ROWS) {
      void recomputeSheet(req.user!, sheetId).catch((e) => logger.error(`formula recompute failed: ${e?.message}`));
      return ok(res, { queued: true });
    }
    ok(res, { queued: false, ...(await recomputeSheet(req.user!, sheetId)) });
  }),
);

export default router;
