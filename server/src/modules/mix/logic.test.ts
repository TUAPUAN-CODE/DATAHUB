import test from 'node:test';
import assert from 'node:assert/strict';
import { cut, firstMismatch, sumQty } from './logic';

test('cut: subtracts, keeps 6 decimals, refuses more than remaining', () => {
  assert.equal(cut(100, 30, 1, false), 70);
  assert.equal(cut(0.3, 0.1, 1, false), 0.2);
  assert.equal(cut(50, 50, 1, false), 0);
  assert.throws(() => cut(10, 10.5, 4, false), /แถว 4: ใช้ 10.5 เกินคงเหลือ 10/);
  assert.throws(() => cut(null, 1, 2, false), /ยังไม่มีค่าคงเหลือ/);
  assert.throws(() => cut(10, 0, 2, false), /มากกว่า 0/);
  assert.throws(() => cut(10, 1.5, 2, true), /จำนวนเต็ม/);
});
test('sumQty avoids float noise', () => { assert.equal(sumQty([0.1, 0.2]), 0.3); });
test('firstMismatch: case/space-insensitive', () => {
  assert.equal(firstMismatch([{ t: 'ไก่' }, { t: ' ไก่ ' }], ['t']), null);
  assert.equal(firstMismatch([{ t: 'ไก่' }, { t: 'ปลา' }], ['t']), 't');
});
