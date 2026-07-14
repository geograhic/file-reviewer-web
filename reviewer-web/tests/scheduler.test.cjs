/* Cross-check scheduler.js against the Python reference (expected.json). */
const fs = require("fs");
const path = require("path");

// Freeze Date so new Date() matches the frozen Python clock (2026-01-01T12:00:00).
const FIXED = new Date("2026-01-01T12:00:00");
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) { super(FIXED.getTime()); return; }
    super(...args);
  }
  static now() { return FIXED.getTime(); }
}
global.Date = FrozenDate;

const Scheduler = require("../scheduler.js");
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"));

let pass = 0, fail = 0;
const FIELDS = ["algorithm", "due_at", "interval_days", "stability", "difficulty", "ease_factor", "retrievability", "lapse_inc"];

for (const c of cases) {
  const actual = Scheduler.calculateSchedule(c.row, c.rating, { scheduler: { algorithm: c.algo, desired_retention: 0.9 } });
  const exp = c.expected;
  let ok = true;
  const diffs = [];
  for (const f of FIELDS) {
    const a = actual[f], e = exp[f];
    if (typeof a === "number" && typeof e === "number") {
      if (Math.abs(a - e) > 1e-6) { ok = false; diffs.push(`${f}: ${a} vs ${e}`); }
    } else if (a !== e) { ok = false; diffs.push(`${f}: ${JSON.stringify(a)} vs ${JSON.stringify(e)}`); }
  }
  if (ok) { pass++; }
  else { fail++; console.log(`FAIL ${c.algo}/${c.label}/rating${c.rating}: ${diffs.join("; ")}`); }
}

console.log(`\nScheduler cross-check: ${pass} passed, ${fail} failed (of ${cases.length})`);
process.exit(fail === 0 ? 0 : 1);
