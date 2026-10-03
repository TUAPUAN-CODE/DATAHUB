import test from 'node:test';
import assert from 'node:assert/strict';
import { isRead, isTransient } from './db';

test('failover errors are recognised; ordinary SQL errors are not retried', () => {
  assert.equal(isTransient({ code: 'ECONNCLOSED' }), true);
  assert.equal(isTransient({ code: 'ELOGIN' }), true);
  assert.equal(isTransient({ number: 983 }), true);        // availability replica not accessible
  assert.equal(isTransient({ originalError: { info: { number: 40613 } } }), true);
  assert.equal(isTransient({ number: 2627 }), false);      // duplicate key: a real error
  assert.equal(isTransient({ code: 'EREQUEST', number: 547 }), false);
});
test('only reads are retried blindly', () => {
  assert.equal(isRead('  SELECT 1'), true);
  assert.equal(isRead('WITH t AS (SELECT 1) SELECT * FROM t'), true);
  assert.equal(isRead('UPDATE x SET a = 1'), false);
});
