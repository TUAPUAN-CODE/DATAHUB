import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileFormula, displayFormula, evaluate, FormulaSyntaxError, FValue, topoOrder } from './index';

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const cols = [
  { id: ID(1), name: 'น้ำหนัก', dataType: 'float' },
  { id: ID(2), name: 'จำนวนถาด', dataType: 'int' },
  { id: ID(3), name: 'เข้าห้องเย็น', dataType: 'datetime' },
  { id: ID(4), name: 'ออกห้องเย็น', dataType: 'datetime' },
  { id: ID(5), name: 'ชื่อ', dataType: 'varchar' },
];
const dt = (iso: string): FValue => ({ kind: 'datetime', ms: Date.parse(iso) });

function run(src: string, values: Record<string, FValue> = {}, tz = 420): FValue {
  const c = compileFormula(src, cols);
  return evaluate(c.ast, { get: (id) => (id in values ? values[id] : null), tzOffsetMinutes: tz });
}
const v = (n: number, x: FValue) => ({ [ID(n)]: x });

test('arithmetic, precedence and null propagation', () => {
  assert.equal(run('1 + 2 * 3'), 7);
  assert.equal(run('(1 + 2) * 3'), 9);
  assert.equal(run('10 / 4'), 2.5);
  assert.equal(run('10 / 0'), null);
  assert.equal(run('-[น้ำหนัก] + 1', v(1, 5)), -4);
  assert.equal(run('[น้ำหนัก] + 1', {}), null);
  assert.equal(run('[น้ำหนัก] / [จำนวนถาด]', { ...v(1, 30), ...v(2, 4) }), 7.5);
});

test('references by name become [#id] and display names follow renames', () => {
  const c = compileFormula('[น้ำหนัก] * 2', cols);
  assert.equal(c.canonical, `[#${ID(1)}] * 2`);
  assert.deepEqual(c.deps, [ID(1)]);
  const renamed = cols.map((x) => (x.id === ID(1) ? { ...x, name: 'Weight' } : x));
  assert.equal(displayFormula(c.canonical, renamed), '[Weight] * 2');
  assert.equal(compileFormula(c.canonical, renamed).deps[0], ID(1));
});

test('IF is lazy and AND/OR/NOT work', () => {
  assert.equal(run('IF([น้ำหนัก] > 100, "หนัก", "ปกติ")', v(1, 150)), 'หนัก');
  assert.equal(run('IF([น้ำหนัก] > 100, "หนัก", "ปกติ")', v(1, 50)), 'ปกติ');
  assert.equal(run('IF(1 = 1, 7, 1 / 0)'), 7);
  assert.equal(run('AND(1 < 2, 2 < 3)'), true);
  assert.equal(run('OR(1 > 2, NOT(FALSE))'), true);
  assert.equal(run('COALESCE([ชื่อ], "ไม่มี")'), 'ไม่มี');
});

test('text functions and concatenation', () => {
  assert.equal(run('[ชื่อ] & "-" & UPPER("ab")', v(5, 'x')), 'x-AB');
  assert.equal(run('LEFT("PFCM-01", 4)'), 'PFCM');
  assert.equal(run('RIGHT("PFCM-01", 2)'), '01');
  assert.equal(run('LEN("สวัสดี")'), 6);
  assert.equal(run('CONTAINS("Cold Room 1", "room")'), true);
  assert.equal(run('FORMATNUM(1234.5, 1)'), '1,234.5');
});

test('dates: DATEDIFF, DATEADD, HOUR (time zone aware) and shift', () => {
  const a = dt('2026-10-01T02:00:00Z'); // 09:00 in UTC+7
  const b = dt('2026-10-01T05:30:00Z');
  assert.equal(run('DATEDIFF("minute", [เข้าห้องเย็น], [ออกห้องเย็น])', { ...v(3, a), ...v(4, b) }), 210);
  assert.equal(run('ROUND(DATEDIFF("hour", [เข้าห้องเย็น], [ออกห้องเย็น]), 2)', { ...v(3, a), ...v(4, b) }), 3.5);
  assert.equal(run('HOUR([เข้าห้องเย็น])', v(3, a), 420), 9);
  assert.equal(run('HOUR([เข้าห้องเย็น])', v(3, a), 0), 2);
  const shift = 'IF(AND(HOUR([เข้าห้องเย็น]) >= 6, HOUR([เข้าห้องเย็น]) < 18), "DS", "NS")';
  assert.equal(run(shift, v(3, a)), 'DS');
  assert.equal(run(shift, v(3, dt('2026-10-01T16:00:00Z'))), 'NS'); // 23:00 local
  const added = run('DATEADD("hour", [เข้าห้องเย็น], 4)', v(3, a)) as { ms: number };
  assert.equal(added.ms, (a as { ms: number }).ms + 4 * 3_600_000);
  assert.equal(run('FORMATDATE([เข้าห้องเย็น], "dd/MM/BBBB HH:mm")', v(3, a)), '01/10/2569 09:00');
  assert.equal(run('DATEDIFF("hour", [เข้าห้องเย็น], [ออกห้องเย็น])', v(3, a)), null);
});

test('comparisons treat empty values sensibly', () => {
  assert.equal(run('[ชื่อ] = ""'), true);
  assert.equal(run('ISBLANK([ชื่อ])'), true);
  assert.equal(run('[น้ำหนัก] > 5', {}), false);
  assert.equal(run('"A" = "a"'), true);
});

test('errors are reported at save time', () => {
  const bad = (src: string, re: RegExp) => assert.throws(() => compileFormula(src, cols), (e: unknown) => e instanceof FormulaSyntaxError && re.test(e.message));
  bad('', /กรุณาใส่สูตร/);
  bad('1 +', /ไม่สมบูรณ์/);
  bad('[ไม่มีคอลัมน์] + 1', /ไม่พบคอลัมน์/);
  bad('NOPE(1)', /ไม่มีฟังก์ชัน/);
  bad('ROUND()', /ต้องมี/);
  bad('IF(1)', /ต้องมี/);
  bad('abc + 1', /ไม่ใช่ฟังก์ชัน/);
  bad('"abc', /ไม่ครบ/);
  bad('1 + #', /ที่ใช้ไม่ได้/);
  assert.throws(() => compileFormula(`[#${ID(1)}] + 1`, cols, { selfId: ID(1) }), /ตัวเอง/);
});

test('topological order and cycles', () => {
  assert.deepEqual(topoOrder([{ id: 'b', deps: ['a'] }, { id: 'a', deps: [] }, { id: 'c', deps: ['b', 'a'] }]), ['a', 'b', 'c']);
  assert.throws(() => topoOrder([{ id: 'a', deps: ['b'] }, { id: 'b', deps: ['a'] }]), /วงกลม/);
});
