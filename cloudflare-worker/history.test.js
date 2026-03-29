// Unit tests for evaluateHistory() and formatLastUpdate() using Node's built-in test runner.
// Run: node --test cloudflare-worker/history.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { evaluateHistory, formatLastUpdate } from './history.js';

const TOWN = 'גבעות עדן';
const __dir = dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a minimal record for our town
let nextRid = 1;
function rec(category, alertDate) {
  return { data: TOWN, category, rid: nextRid++, alertDate: alertDate || null };
}

// ── Fixtures: today's real events (2026-03-28) ───────────────────────────────

const fixture = JSON.parse(
  readFileSync(join(__dir, 'fixtures/2026-03-28.json'), 'utf8')
);

test('2026-03-28: snapshot at cat14 only → yellow with warning ts', () => {
  const records = fixture.records.filter(r => r.rid <= 608444); // only cat 14
  const result = evaluateHistory(records, TOWN);
  assert.deepEqual(result, {
    state: 'yellow',
    cat: 14,
    ts: { warning: '2026-03-28T14:17:00', siren: null, allClear: null },
  });
});

test('2026-03-28: snapshot after siren, before cat13 → red with warning+siren ts', () => {
  const records = fixture.records.filter(r => r.rid <= 608979); // cat14 + cat1
  const result = evaluateHistory(records, TOWN);
  assert.deepEqual(result, {
    state: 'red',
    cat: 1,
    ts: { warning: '2026-03-28T14:17:00', siren: '2026-03-28T14:22:00', allClear: null },
  });
});

test('2026-03-28: full snapshot after cat13 → green with all ts populated', () => {
  const result = evaluateHistory(fixture.records, TOWN);
  assert.deepEqual(result, {
    state: 'green',
    cat: null,
    ts: { warning: '2026-03-28T14:17:00', siren: '2026-03-28T14:22:00', allClear: '2026-03-28T14:37:00' },
  });
});

// ── Synthetic edge cases ──────────────────────────────────────────────────────

test('empty records → green', () => {
  const result = evaluateHistory([], TOWN);
  assert.equal(result.state, 'green');
  assert.equal(result.cat, null);
});

test('no records for our town → green', () => {
  const records = [{ data: 'תל אביב', category: 1, rid: 1 }];
  const result = evaluateHistory(records, TOWN);
  assert.equal(result.state, 'green');
});

test('cat14 alone → yellow', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14)], TOWN);
  assert.equal(result.state, 'yellow');
  assert.equal(result.cat, 14);
});

test('cat14 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(13)], TOWN);
  assert.equal(result.state, 'green');
});

test('cat14 then cat1 (siren) → red (preliminary consumed, post-siren)', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(1)], TOWN);
  assert.equal(result.state, 'red');
  assert.equal(result.cat, 1);
});

test('cat14 then cat1 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(14), rec(1), rec(13)], TOWN);
  assert.equal(result.state, 'green');
});

test('cat1 alone (no cat13 yet) → red', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(1)], TOWN);
  assert.equal(result.state, 'red');
  assert.equal(result.cat, 1);
});

test('cat1 then cat13 → green', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(1), rec(13)], TOWN);
  assert.equal(result.state, 'green');
});

test('cat6 (infiltration) alone → red', () => {
  nextRid = 100;
  const result = evaluateHistory([rec(6)], TOWN);
  assert.equal(result.state, 'red');
  assert.equal(result.cat, 6);
});

test('alert in other town does not affect our town → green', () => {
  nextRid = 100;
  const records = [
    { data: 'תל אביב', category: 1, rid: nextRid++ },
    { data: TOWN,      category: 13, rid: nextRid++ },
  ];
  const result = evaluateHistory(records, TOWN);
  assert.equal(result.state, 'green');
});

test('new cat14 issued after cat13 (new event cycle) → yellow', () => {
  nextRid = 100;
  // first event: cat14 → cat1 → cat13
  // second event: new cat14
  const result = evaluateHistory([rec(14), rec(1), rec(13), rec(14)], TOWN);
  assert.equal(result.state, 'yellow');
  assert.equal(result.cat, 14);
});

// ── formatLastUpdate ──────────────────────────────────────────────────────────

// Fixed "now" for predictable output (same day as fixture)
const SAME_DAY = new Date('2026-03-28T15:00:00');
// A "now" that is the next day (cross-day)
const NEXT_DAY = new Date('2026-03-29T08:00:00');

test('formatLastUpdate: green with allClear (same day) → "All clear since HH:MM"', () => {
  const result = { state: 'green', cat: null, ts: { warning: null, siren: null, allClear: '2026-03-28T14:37:00' } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'All clear since 14:37');
});

test('formatLastUpdate: green with allClear (cross-day) → "All clear since DD/MM HH:MM"', () => {
  const result = { state: 'green', cat: null, ts: { warning: null, siren: null, allClear: '2026-03-28T14:37:00' } };
  assert.equal(formatLastUpdate(result, NEXT_DAY), 'All clear since 28/03 14:37');
});

test('formatLastUpdate: green with no allClear → "No recent alerts"', () => {
  const result = { state: 'green', cat: null, ts: { warning: null, siren: null, allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'No recent alerts');
});

test('formatLastUpdate: null result → "No recent alerts"', () => {
  assert.equal(formatLastUpdate(null, SAME_DAY), 'No recent alerts');
});

test('formatLastUpdate: yellow with warning (same day) → "Warning since HH:MM"', () => {
  const result = { state: 'yellow', cat: 14, ts: { warning: '2026-03-28T14:17:00', siren: null, allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'Warning since 14:17');
});

test('formatLastUpdate: yellow with warning (cross-day) → "Warning since DD/MM HH:MM"', () => {
  const result = { state: 'yellow', cat: 14, ts: { warning: '2026-03-28T14:17:00', siren: null, allClear: null } };
  assert.equal(formatLastUpdate(result, NEXT_DAY), 'Warning since 28/03 14:17');
});

test('formatLastUpdate: yellow with no warning → "Warning active"', () => {
  const result = { state: 'yellow', cat: 14, ts: { warning: null, siren: null, allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'Warning active');
});

test('formatLastUpdate: red with both warning and siren (same day)', () => {
  const result = { state: 'red', cat: 1, ts: { warning: '2026-03-28T14:17:00', siren: '2026-03-28T14:22:00', allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'Warning at 14:17 · Siren at 14:22');
});

test('formatLastUpdate: red with both warning and siren (cross-day)', () => {
  const result = { state: 'red', cat: 1, ts: { warning: '2026-03-28T14:17:00', siren: '2026-03-28T14:22:00', allClear: null } };
  assert.equal(formatLastUpdate(result, NEXT_DAY), 'Warning at 28/03 14:17 · Siren at 28/03 14:22');
});

test('formatLastUpdate: red with siren only (no warning)', () => {
  const result = { state: 'red', cat: 1, ts: { warning: null, siren: '2026-03-28T14:22:00', allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'Siren at 14:22');
});

test('formatLastUpdate: red with no timestamps → "Siren active"', () => {
  const result = { state: 'red', cat: 1, ts: { warning: null, siren: null, allClear: null } };
  assert.equal(formatLastUpdate(result, SAME_DAY), 'Siren active');
});
