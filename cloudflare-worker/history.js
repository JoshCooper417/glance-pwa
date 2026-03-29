// Pure logic for evaluating Oref history records and formatting display text.
// Separated from worker.js so it can be unit-tested without fetch.

export const OREF_RED = new Set([1, 3, 5, 6]);

// ── evaluateHistory ───────────────────────────────────────────────────────────
//
// Given raw Oref history records (all towns), returns:
//   { state: 'green'|'yellow'|'red', cat, ts }
//
// ts fields (all ISO strings or null):
//   ts.warning  — alertDate of cat 14 (preliminary warning)
//   ts.siren    — alertDate of the actual siren (cat 1/3/5/6)
//   ts.allClear — alertDate of cat 13 (event ended)

export function evaluateHistory(records, town) {
  const townRecords = records
    .filter(r => r.data === town)
    .sort((a, b) => b.rid - a.rid);

  const ts = { warning: null, siren: null, allClear: null };

  if (townRecords.length === 0) return { state: 'green', cat: null, ts };

  const latest13    = townRecords.find(r => r.category === 13);
  const latest14    = townRecords.find(r => r.category === 14);
  const latestSiren = townRecords.find(r => OREF_RED.has(r.category));

  if (latest13)    ts.allClear = latest13.alertDate;
  if (latest14)    ts.warning  = latest14.alertDate;
  if (latestSiren) ts.siren    = latestSiren.alertDate;

  // Post-siren RED: siren fired and not yet closed by cat 13
  if (latestSiren && (!latest13 || latestSiren.rid > latest13.rid)) {
    return { state: 'red', cat: latestSiren.category, ts };
  }

  // Preliminary YELLOW: cat 14 active, siren hasn't fired yet
  if (latest14 &&
      (!latest13    || latest14.rid > latest13.rid) &&
      (!latestSiren || latest14.rid > latestSiren.rid)) {
    return { state: 'yellow', cat: 14, ts };
  }

  return { state: 'green', cat: null, ts };
}

// ── formatLastUpdate ──────────────────────────────────────────────────────────
//
// Returns a human-readable "last update" string based on the history result.
// Same-day events show only HH:MM; cross-day events show DD/MM HH:MM.
//
// Green:  "All clear since HH:MM"  (or "No recent alerts" if no cat 13)
// Yellow: "Warning since HH:MM"
// Red:    "Warning at HH:MM · Siren at HH:MM"  (or subset if timestamps missing)

function fmtTime(isoString, now) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const hm = d.toTimeString().slice(0, 5); // HH:MM
  if (d.toDateString() === now.toDateString()) return hm;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} ${hm}`;
}

export function formatLastUpdate(result, now = new Date()) {
  if (!result || result.state === 'green') {
    const t = fmtTime(result?.ts?.allClear, now);
    return t ? `All clear since ${t}` : 'No recent alerts';
  }

  if (result.state === 'yellow') {
    const t = fmtTime(result.ts?.warning, now);
    return t ? `Warning since ${t}` : 'Warning active';
  }

  if (result.state === 'red') {
    const w = fmtTime(result.ts?.warning, now);
    const s = fmtTime(result.ts?.siren, now);
    if (w && s) return `Warning at ${w} · Siren at ${s}`;
    if (s)      return `Siren at ${s}`;
    return 'Siren active';
  }

  return '';
}
