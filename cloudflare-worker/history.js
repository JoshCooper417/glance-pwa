// Pure logic for evaluating Oref history records.
// Separated from worker.js so it can be unit-tested without fetch.

export const OREF_RED = new Set([1, 3, 5, 6]);

// Given an array of raw Oref history records (all towns), returns:
//   { state: 'red'|'yellow', cat } — if an alert is active for the town
//   null                           — if all clear
export function evaluateHistory(records, town) {
  const townRecords = records
    .filter(r => r.data === town)
    .sort((a, b) => b.rid - a.rid);

  if (townRecords.length === 0) return null;

  const latest13    = townRecords.find(r => r.category === 13);
  const latest14    = townRecords.find(r => r.category === 14);
  const latestSiren = townRecords.find(r => OREF_RED.has(r.category));

  // Post-siren RED: siren fired and not yet closed by cat 13
  if (latestSiren && (!latest13 || latestSiren.rid > latest13.rid)) {
    return { state: 'red', cat: latestSiren.category };
  }

  // Preliminary YELLOW: cat 14 active, siren hasn't fired yet
  if (latest14 &&
      (!latest13    || latest14.rid > latest13.rid) &&
      (!latestSiren || latest14.rid > latestSiren.rid)) {
    return { state: 'yellow', cat: 14 };
  }

  return null;
}
