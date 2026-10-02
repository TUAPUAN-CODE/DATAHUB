import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, levelToNotify, ratioPct } from './logic';

const levels = [{ atPct: 100, color: '#f00', label: 'เกินเวลา' }, { atPct: 50, color: '#ff0', label: 'ใกล้เกิน' }];

test('ratioPct: elapsed over the limit; unknown without a positive limit', () => {
  assert.equal(ratioPct(0, null, 30 * 60000, 60), 50);
  assert.equal(ratioPct(0, null, 90 * 60000, 60), 150);
  assert.equal(ratioPct(0, null, 1000, 0), null);
});
test('levelToNotify: highest reached level of the sorted list; honours the chosen levels', () => {
  assert.equal(levelToNotify(levels, 40), -1);
  assert.equal(levelToNotify(levels, 60), 0);   // sorted: 50 → index 0
  assert.equal(levelToNotify(levels, 120), 1);  // 100 → index 1
  assert.equal(levelToNotify(levels, 120, [0]), 0); // only the 50 % level wanted
  assert.equal(levelToNotify(levels, 60, [1]), -1);
});
test('buildMessage: lists rows and the link', () => {
  const t = buildMessage('ไฟล์ › ชีต: Delay', [{ rowNo: 3, pct: 130.4, levelLabel: 'เกินเวลา', elapsedMin: 78, limitMin: 60, startedAt: '01/10 08:00', labels: ['RM-01'] }], 'http://x/files/1');
  assert.match(t, /แถว 3 \| RM-01/);
  assert.match(t, /130%/);
  assert.match(t, /1 ชม\. 18 น\./);
  assert.match(t, /http:\/\/x\/files\/1/);
});
