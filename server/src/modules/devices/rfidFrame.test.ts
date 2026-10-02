import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameParser, DEFAULT_INIT_HEX, isHex, isValidEpc, withChecksum } from './rfidFrame';

const frame = (epc: string) => Buffer.concat([Buffer.from('CCFFFF20', 'hex'), Buffer.from('000E', 'hex'), Buffer.from('000000', 'hex'), Buffer.from(epc, 'hex')]);

test('one frame, two frames in one chunk, and a frame cut in two', () => {
  const a = 'E2801160600002054D3C9A01', b = 'E28011606000020A3B2C1D02';
  const p = createFrameParser();
  assert.deepEqual(p.push(frame(a)), [a]);
  assert.deepEqual(p.push(Buffer.concat([frame(a), frame(b)])), [a, b]);
  const f = frame(b);
  assert.deepEqual(p.push(f.subarray(0, 10)), []);
  assert.deepEqual(p.push(f.subarray(10)), [b]);
});
test('noise is filtered', () => {
  assert.equal(isValidEpc('E2801160600002054D3C9A01'), true);
  assert.equal(isValidEpc('000000000000000000000000'), false);
  assert.equal(isValidEpc('E280'), false);
});

test('reader commands: checksum makes the byte sum 0 (mod 256); hex is validated', () => {
  const c = withChecksum(DEFAULT_INIT_HEX);
  assert.equal(c.length, 8);
  assert.equal(c.reduce((a, b) => a + b, 0) & 0xff, 0);
  assert.equal(isHex('7CFFFF20'), true);
  assert.equal(isHex('7CF'), false);
  assert.equal(isHex('zz'), false);
});
