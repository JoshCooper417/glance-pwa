// Unit tests for evaluateHistory() using Node's built-in test runner.
// Run: node --test cloudflare-worker/history.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { evaluateHistory } from './history.js';

const TOWN = 'גבעות עדן';
const __dir = dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a minimal record for our town
let nextRid = 1;
function rec(category) {
  return { data: TOWN, category, rid: nextRid++ };
}

// ── Fixtures: today's real events (2026-03-28) ───────────────────────────────

const fixture = JSON.parse(
  readFileSync(join(__dir, 'fixtures/2026-03-28.json'), 'utf8')
);

test('2026-03-28: snapshot at cat14 only → yellow', () => {
  const records = fixture.records.filter(r => r.rid <= 608444); // only cat 14
  const result = evaluateHistory(records, TOWN);
  assert.deepEqual(result, { state: 'yellow', cat: 14 });
});

test('2026-03-28: snapshot after siren, before cat13 → red', () => {
  const records = fixture.records.filter(r => r.rid <= 608979); // cat14 + cat1
  const result = evaluateHistory(records, TOWN);
  assert.deepEqual(result, { state: 'red', cat: 1 });
});

test('2026-03-28: full snapshot after cat13 → green', () => {
  const result = evaluateHistory(fixture.records, TOWN);
  assert.equal(result, null);
});

// ── Synthetic edge cases ──────────────────────────────────────────────────────

test('empty records → green', () => {
  assert.equal(evaluateHistory([], TOWN), null);
});

test('no records for our town → green', () => {
  const records = [{ data: 'תל אביב', category: 1, rid: 1 }];
  assert.equal(evaluateHistory(records, TOWN), null);
});

test('cat14 alone → yellow', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14)], TOWN);
  assert.deepEqual(result, { state: 'yellow', cat: 14 });
});

test('cat14 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(13)], TOWN);
  assert.equal(result, null);
});

test('cat14 then cat1 (siren) → red (preliminary consumed, post-siren)', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(1)], TOWN);
  assert.deepEqual(result, { state: 'red', cat: 1 });
});

test('cat14 then cat1 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(1), rec(13)], TOWN);
  assert.equal(result, null);
});

test('cat1 alone (no cat13 yet) → red', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(1)], TOWN);
  assert.deepEqual(result, { state: 'red', cat: 1 });
});

test('cat1 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(1), rec(13)], TOWN);
  assert.equal(result, null);
});

test('cat6 (infiltration) alone → red', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(6)], TOWN);
  assert.deepEqual(result, { state: 'red', cat: 6 });
});

test('alert in other town does not affect our town → green', () => {
  nextRid = 100;
  const records = [
    { data: 'תל אביב', category: 1, rid: nextRid++ },
    { data: TOWN,      category: 13, rid: nextRid++ },
  ];
  assert.equal(evaluateHistory(records, TOWN), null);
});

test('new cat14 issued after cat13 (new event cycle) → yellow', () => {
  nextRid = 100;
  // first event: cat14 → cat1 → cat13
  // second event: new cat14
  const result = evaluateHistory([rec(14), rec(1), rec(13), rec(14)], TOWN);
  assert.deepEqual(result, { state: 'yellow', cat: 14 });
});
