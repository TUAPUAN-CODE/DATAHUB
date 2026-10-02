import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProfile, parseScan, ScanProfile, splitScan } from './parse';

const A: ScanProfile = { id: 'a', name: 'ถาด', delimiter: '|', fields: [{ index: 1, columnId: 'code' }, { index: 2, columnId: 'batch' }, { index: 3, columnId: 'map' }, { index: 4, columnId: 'qty' }, { index: 5, columnId: 'unit' }], action: 'create' };
const B: ScanProfile = { id: 'b', name: 'สลีป', delimiter: ' | ', match: { prefix: '14M', fieldCount: 7 }, fields: [{ index: 4, columnId: 'map' }], action: 'update', keyColumnId: 'map' };

test('split by a custom delimiter and trim the pieces', () => {
  assert.deepEqual(splitScan('14L11DFF | BATCH123 | 12345 | 25 | KG.\r\n', '|'), ['14L11DFF', 'BATCH123', '12345', '25', 'KG.']);
  assert.deepEqual(splitScan('a;b;c', ';'), ['a', 'b', 'c']);
  assert.deepEqual(splitScan('a\tb', '\\t'), ['a', 'b']);
  assert.deepEqual(splitScan('abc', ''), ['abc']);
});
test('map pieces to columns; skip empty / missing pieces', () => {
  assert.deepEqual(parseScan('14L11DFF | BATCH123 | 12345 | 25 | KG.', A).values, { code: '14L11DFF', batch: 'BATCH123', map: '12345', qty: '25', unit: 'KG.' });
  assert.deepEqual(parseScan('X||7', { ...A, fields: [{ index: 1, columnId: 'code' }, { index: 2, columnId: 'batch' }, { index: 3, columnId: 'map' }] }).values, { code: 'X', map: '7' });
});
test('detect the profile: most criteria wins, a profile needing missing pieces does not fit', () => {
  const slip = '14M230000001 | LCMTP019AP | LCMTP019AP | 695089 | 245 | kg | PFCM';
  assert.equal(detectProfile(slip, [A, B])?.id, 'b');
  assert.equal(detectProfile('14L11DFF | BATCH123 | 12345 | 25 | KG.', [A, B])?.id, 'a');
  assert.equal(detectProfile('only one', [A, B]), null);
  assert.equal(detectProfile('x | y | z | 1 | 2', [{ ...A, match: { regex: '^Q' } }]), null);
});
