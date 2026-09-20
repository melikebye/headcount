// Run with: node engine.test.js   (no packages needed)
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('./engine.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }

function sampleWeek() {
  const read = f => E.parseCSV(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  const a = read('sample_checkin_report.csv'), s = read('sample_staff_timecards.csv');
  const att = E.normalize(a, E.autoMap(a.headers, 'attendance'), 'attendance').records;
  const stf = E.normalize(s, E.autoMap(s.headers, 'staff'), 'staff').records;
  const counts = E.countByBlock(att), dates = Object.keys(counts).sort();
  const rooms = [...new Set(att.map(r => r.room))].sort(), bandOf = {};
  rooms.forEach(r => bandOf[r] = E.guessBand(r));
  const units = E.buildUnits(rooms, bandOf), date = dates[dates.length - 5];
  const history = {}; dates.slice(0, -5).forEach(d => history[d] = counts[d]);
  const roster = E.rosterFor(stf.filter(r => r.date === date), units);
  const fc = E.forecastCounts(history, E.weekdayOf(date), rooms, 1);
  return { units, roster, fc, plan: E.assignDay(units, fc, roster) };
}

test('reads a CSV with quoted commas', () => {
  const p = E.parseCSV('Name,Room\n"Smith, A",Ones\n');
  assert.deepStrictEqual(p.headers, ['Name', 'Room']);
  assert.strictEqual(p.rows[0][0], 'Smith, A');
});

test('matches common column names on its own', () => {
  assert.deepStrictEqual(E.autoMap(['Student', 'Room', 'Date', 'Check-in Time', 'Check-out Time'], 'attendance'), { child: 0, room: 1, date: 2, tin: 3, tout: 4 });
  assert.deepStrictEqual(E.autoMap(['Employee', 'Classroom', 'Shift Date', 'Clock In', 'Clock Out'], 'staff'), { staff: 0, room: 1, date: 2, tin: 3, tout: 4 });
});

test('North Carolina ratio: 5 infants need 1 teacher, 6 need 2', () => {
  const unit = { band: E.NC_BANDS[0], rooms: ['Infants'] }, counts = { Infants: new Array(E.NB).fill(0) };
  counts.Infants[0] = 5; counts.Infants[1] = 6;
  const { need } = E.unitNeed(unit, counts, false);
  assert.strictEqual(need[0], 1); assert.strictEqual(need[1], 2);
});

test('two same-age rooms combine only when the group fits the legal maximum', () => {
  const unit = { band: E.NC_BANDS[0], rooms: ['A', 'B'] };            // infants: 1:5, max group 10
  const counts = { A: new Array(E.NB).fill(0), B: new Array(E.NB).fill(0) };
  counts.A[0] = 2; counts.B[0] = 3;                                      // 5 together: 1 teacher instead of 2
  counts.A[1] = 6; counts.B[1] = 6;                                      // 12 together: over the maximum, stay apart
  const { need, merged } = E.unitNeed(unit, counts, true);
  assert.strictEqual(need[0], 1); assert.strictEqual(merged[0], true);
  assert.strictEqual(need[1], 4); assert.strictEqual(merged[1], false);
});

test('nobody is scheduled outside the hours in the staff file, or twice at once', () => {
  const { plan, roster } = sampleWeek();
  const busy = {};
  for (const pu of plan.units) for (const s of pu.shifts) {
    const p = roster.find(r => r.who === s.who);
    assert.ok(s.s >= p.s && s.e <= p.e, `${s.who} is outside their hours`);
    for (let t = s.s; t < s.e; t++) { const k = s.who + t; assert.ok(!busy[k], `${s.who} is double-booked`); busy[k] = true; }
  }
});

test('nobody works longer than nine hours', () => {
  const { plan } = sampleWeek(), total = {};
  for (const pu of plan.units) for (const s of pu.shifts) total[s.who] = (total[s.who] || 0) + (s.e - s.s);
  for (const [who, blocks] of Object.entries(total)) assert.ok(blocks <= 36, `${who} works ${blocks / 4} hours`);
});

test('every block is either covered or flagged as a gap, never silently short', () => {
  const { plan } = sampleWeek();
  for (const pu of plan.units) {
    const cover = E.coverage(pu.shifts);
    pu.need.forEach((n, t) => { if (cover[t] < n) assert.ok(pu.gaps.some(g => g.s <= t && t < g.e), `${pu.unit.name} block ${t} is short and unflagged`); });
  }
});

test('sample week: the schedule covers every forecast block with the staff on file', () => {
  const { plan } = sampleWeek();
  assert.strictEqual(plan.gapHours, 0);
});

test('a call-out leaves other groups at or above ratio and reports what is left', () => {
  const { plan, roster } = sampleWeek();
  const who = plan.units[0].shifts[0].who, r = E.callOut(plan, roster, who);
  assert.ok(r.minutesAtRisk > 0);
  assert.ok(r.subHours <= r.lostHours + 1e-9);
  assert.ok(!r.plan.units.some(pu => pu.shifts.some(s => s.who === who)), 'the person who called out is still scheduled');
});

console.log(`\n${passed} tests passed`);
