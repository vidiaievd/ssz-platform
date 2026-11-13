// Runs on the built package (`npm test` builds first) with node's own test runner — no extra dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminLevel, ADMIN_LEVELS, adminLevelAtLeast, parseAdminLevel } from '../dist/index.js';

test('levels ascend support < admin < super', () => {
  assert.deepEqual(ADMIN_LEVELS, ['support', 'admin', 'super']);
});

test('every level passes its own requirement and every lower one', () => {
  for (const [i, have] of ADMIN_LEVELS.entries()) {
    for (const [j, need] of ADMIN_LEVELS.entries()) {
      assert.equal(adminLevelAtLeast(have, need), i >= j, `${have} vs ${need}`);
    }
  }
});

test('a missing or unknown level never passes', () => {
  for (const have of [undefined, null, '', 'SUPER', 'root', 3, ['super'], {}]) {
    assert.equal(adminLevelAtLeast(have, AdminLevel.SUPPORT), false, String(have));
  }
});

test('an unknown requirement closes the route even for super', () => {
  assert.equal(adminLevelAtLeast('super', 'owner'), false);
});

test('parseAdminLevel keeps known levels and drops the rest', () => {
  assert.equal(parseAdminLevel('admin'), 'admin');
  assert.equal(parseAdminLevel('Admin'), null);
  assert.equal(parseAdminLevel(undefined), null);
});
