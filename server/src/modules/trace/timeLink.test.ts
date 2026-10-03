import test from 'node:test';
import assert from 'node:assert/strict';
import { interval, overlap } from './timeLink';

const t = (hm: string) => new Date(`2026-10-01T${hm}:00Z`);
const now = t('13:00');

test('material 12:00–12:30 vs packaging 11:50–12:30: linked, 30 min', () => {
  const a = interval(t('12:00'), t('12:30'), now)!;
  const b = interval(t('11:50'), t('12:30'), now)!;
  assert.deepEqual(overlap(a, b), { linked: true, minutes: 30 });
});
test('apart in time: not linked; tolerance can bridge a small gap', () => {
  const a = interval(t('12:00'), t('12:30'), now)!;
  const b = interval(t('12:40'), t('13:10'), now)!;
  assert.equal(overlap(a, b).linked, false);
  assert.equal(overlap(a, b, 10).linked, true);
  assert.equal(overlap(a, b, 10).minutes, 0);
});
test('a row without an end runs until now; no start = no interval', () => {
  const a = interval(t('12:00'), null, now)!;
  assert.equal(a.e, now.getTime());
  assert.equal(interval(null, t('12:00'), now), null);
  assert.equal(overlap(a, interval(t('12:45'), t('12:50'), now)!).minutes, 5);
});
