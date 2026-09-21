// Run with: node build_demo_data.js
// Bakes the fictional sample files into two small scripts so both pages work with no network:
//   demo_data.js    the finished sample week shown on the landing page
//   sample_data.js  the two sample CSVs, for the "Try it with sample data" button
const fs = require('fs'), path = require('path');
const E = require('./engine.js');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const attText = read('sample_checkin_report.csv'), stfText = read('sample_staff_timecards.csv');

const a = E.parseCSV(attText), s = E.parseCSV(stfText);
const att = E.normalize(a, E.autoMap(a.headers, 'attendance'), 'attendance').records;
const stf = E.normalize(s, E.autoMap(s.headers, 'staff'), 'staff').records;
const counts = E.countByBlock(att), dates = Object.keys(counts).sort();
const history = {}; dates.slice(0, -5).forEach(d => history[d] = counts[d]);
const rooms = [...new Set(att.map(r => r.room))].sort(), bandOf = {};
rooms.forEach(r => bandOf[r] = E.guessBand(r));
const units = E.buildUnits(rooms, bandOf);

const days = {};
for (const d of dates.slice(-5)) {
  const wd = E.weekdayOf(d);
  const plan = E.assignDay(units, E.forecastCounts(history, wd, rooms, 1), E.rosterFor(stf.filter(r => r.date === d), units));
  days[wd] = { units: plan.units.map(pu => ({ name: pu.unit.name, ratio: pu.unit.band.ratio, rooms: pu.unit.rooms.length, kids: pu.kids, need: pu.need, merged: pu.merged,
    shifts: pu.shifts.map(x => ({ who: x.who, s: x.s, e: x.e, borrowed: x.borrowed })), gaps: pu.gaps })) };
}
const demo = { open: E.OPEN, blockMinutes: E.BLOCK, dayNames: E.WEEKDAYS, days };
fs.writeFileSync(path.join(__dirname, 'demo_data.js'), '// Built by build_demo_data.js from the fictional sample files. Do not edit by hand.\nwindow.HEADCOUNT_DEMO = ' + JSON.stringify(demo) + ';\n');
fs.writeFileSync(path.join(__dirname, 'sample_data.js'), '// Built by build_demo_data.js. The two fictional sample CSVs as text.\nwindow.HEADCOUNT_SAMPLE = ' + JSON.stringify({ attendance: attText, staff: stfText }) + ';\n');
console.log('wrote demo_data.js and sample_data.js');
