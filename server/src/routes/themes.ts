import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../config/db';
import { requireRole } from '../middleware/auth';
import { ah, badRequest, ok, parse, safeJson } from '../shared/http';

const router = Router();
const ORG_KEY = 'org_default_theme';
const themeBody = z.object({ theme: z.record(z.any()) });

function check(theme: unknown) {
  const s = JSON.stringify(theme);
  if (s.length > 60_000) throw badRequest('ข้อมูลธีมมีขนาดใหญ่เกินไป');
  return s;
}

router.get(
  '/themes/me',
  ah(async (req, res) => {
    const mine = await q1(`SELECT theme_json FROM UserThemes WHERE user_id = @u`, { u: T.uuid(req.user!.id) });
    const org = await q1(`SELECT setting_value FROM SystemSettings WHERE setting_key = @k`, { k: ORG_KEY });
    ok(res, { theme: safeJson(mine?.theme_json, null), orgDefault: safeJson(org?.setting_value, null) });
  }),
);

router.put(
  '/themes/me',
  ah(async (req, res) => {
    const { theme } = parse(themeBody, req.body);
    const json = check(theme);
    await q(
      `MERGE UserThemes AS t USING (SELECT @u AS user_id) AS s ON t.user_id = s.user_id
       WHEN MATCHED THEN UPDATE SET theme_json = @j, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (user_id, theme_json) VALUES (s.user_id, @j);`,
      { u: T.uuid(req.user!.id), j: T.text(json) },
    );
    ok(res, { saved: true });
  }),
);

router.delete(
  '/themes/me',
  ah(async (req, res) => {
    await q(`DELETE FROM UserThemes WHERE user_id = @u`, { u: T.uuid(req.user!.id) });
    ok(res, { reset: true });
  }),
);

router.put(
  '/themes/org',
  requireRole('admin'),
  ah(async (req, res) => {
    const { theme } = parse(themeBody, req.body);
    const json = check(theme);
    await q(
      `MERGE SystemSettings AS t USING (SELECT @k AS setting_key) AS s ON t.setting_key = s.setting_key
       WHEN MATCHED THEN UPDATE SET setting_value = @v, updated_by = @u, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (setting_key, setting_value, updated_by) VALUES (s.setting_key, @v, @u);`,
      { k: ORG_KEY, v: T.text(json), u: T.uuid(req.user!.id) },
    );
    ok(res, { saved: true });
  }),
);

router.delete(
  '/themes/org',
  requireRole('admin'),
  ah(async (_req, res) => {
    await q(`DELETE FROM SystemSettings WHERE setting_key = @k`, { k: ORG_KEY });
    ok(res, { reset: true });
  }),
);

export default router;
