import { q, q1, T } from '../../config/db';

/**
 * "Do not read the same card again within N minutes", shared by every reader that writes into the same sheet:
 * the memory is (sheet, value) in the database, not per reader, and survives a restart.
 * Returns true when this reading may be used (and starts a new waiting period), false when it is too soon.
 */
export async function claimReading(sheetId: string, value: string, seconds: number): Promise<{ ok: boolean; remainingSec: number }> {
  if (seconds <= 0) return { ok: true, remainingSec: 0 };
  const r = await q1(
    `DECLARE @ok BIT = 0;
     UPDATE DeviceCooldown SET last_at = SYSUTCDATETIME() WHERE sheet_id = @s AND value = @v AND last_at <= DATEADD(SECOND, -@sec, SYSUTCDATETIME());
     IF @@ROWCOUNT > 0 SET @ok = 1;
     ELSE IF NOT EXISTS (SELECT 1 FROM DeviceCooldown WHERE sheet_id = @s AND value = @v) BEGIN
       BEGIN TRY INSERT INTO DeviceCooldown (sheet_id, value, last_at) VALUES (@s, @v, SYSUTCDATETIME()); SET @ok = 1; END TRY BEGIN CATCH SET @ok = 0; END CATCH
     END
     SELECT @ok AS ok, (SELECT DATEDIFF(SECOND, SYSUTCDATETIME(), DATEADD(SECOND, @sec, last_at)) FROM DeviceCooldown WHERE sheet_id = @s AND value = @v) AS remaining`,
    { s: T.uuid(sheetId), v: T.text(value), sec: T.int(Math.round(seconds)) });
  return { ok: !!r?.ok, remainingSec: Math.max(0, Number(r?.remaining ?? 0)) };
}

/** The reading failed (card not found, …): let the next reading try again at once */
export const releaseReading = (sheetId: string, value: string) =>
  q(`DELETE FROM DeviceCooldown WHERE sheet_id = @s AND value = @v`, { s: T.uuid(sheetId), v: T.text(value) }).catch(() => undefined);

/** Old memory is useless: drop what is older than a day (called now and then) */
export const purgeCooldowns = () => q(`DELETE FROM DeviceCooldown WHERE last_at < DATEADD(DAY, -1, SYSUTCDATETIME())`).catch(() => undefined);
