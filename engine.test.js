// Run with: node engine.test.js   (no packages needed)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }

test('reads a CSV with quoted commas', () => {
  const p = E.parseCSV('Name,Room\n"Smith, A",Ones\n');
  assert.deepStrictEqual(p.headers, ['Name', 'Room']);
  assert.strictEqual(p.rows[0][0], 'Smith, A');
});

test('matches common column names on its own', () => {
  const m = E.autoMap(['Student', 'Room', 'Date', 'Check-in Time', 'Check-out Time'], 'attendance');
  assert.deepStrictEqual(m, { child: 0, room: 1, date: 2, tin: 3, tout: 4 });
});

test('North Carolina ratio: 6 infants need 2 staff, 5 need 1', () => {
  const unit = { band: E.NC_BANDS[0], rooms: ['Infants'] };
  const counts = { Infants: new Array(E.NB).fill(0) };
  counts.Infants[0] = 5; counts.Infants[1] = 6;
  const { need } = E.unitNeed(unit, counts, false);
  assert.strictEqual(need[0], 1);
  assert.strictEqual(need[1], 2);
});

test('two same-age rooms combine only when the group fits the legal maximum', () => {
  const unit = { band: E.NC_BANDS[0], rooms: ['A', 'B'] };            // infants: 1:5, max group 10
  const counts = { A: new Array(E.NB).fill(0), B: new Array(E.NB).fill(0) };
  counts.A[0] = 2; counts.B[0] = 3;                                      // 5 together -> 1 staff instead of 2
  counts.A[1] = 6; counts.B[1] = 6;                                      // 12 together -> over the max, stay separate
  const { need, merged } = E.unitNeed(unit, counts, true);
  assert.strictEqual(need[0], 1); assert.strictEqual(merged[0], true);
  assert.strictEqual(need[1], 4); assert.strictEqual(merged[1], false);
});

test('every shift the scheduler builds covers the requirement in full', () => {
  const need = new Array(E.NB).fill(0).map((_, t) => (t < 4 ? 1 : t < 40 ? 3 : 1));
  const cover = E.coverage(E.sliceShifts(need));
  need.forEach((n, t) => assert.ok(cover[t] >= n, `block ${t} is short`));
});

test('sample data: the plan is in ratio for every forecast block', () => {
  const read = f => E.parseCSV(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  const a = read('sample_checkin_report.csv');
  const att = E.normalize(a, E.autoMap(a.headers, 'attendance'), 'attendance').records;
  const counts = E.countByBlock(att);
  const rooms = [...new Set(att.map(r => r.room))];
  const bandOf = {}; rooms.forEach(r => bandOf[r] = E.guessBand(r));
  const units = E.buildUnits(rooms, bandOf);
  const plan = E.planDay(units, E.forecastCounts(counts, 1, rooms, 2), {});
  for (const pu of plan.units) {
    const cover = E.coverage(pu.shifts);
    pu.need.forEach((n, t) => assert.ok(cover[t] >= n, `${pu.unit.name} block ${t}`));
  }
});

test('a call-out never leaves the repaired plan worse than doing nothing', () => {
  const unit = { id: 'u0', band: E.NC_BANDS[0], rooms: ['Infants'], name: 'Infants' };
  const fc = { Infants: new Array(E.NB).fill(8) };
  const plan = E.planDay([unit], fc, {});
  const r = E.repair(plan, 'u0', 0);
  assert.ok(r.subHours <= r.lostHours);
});

console.log(`\n${passed} tests passed`);
