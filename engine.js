// ---- Headcount engine: import, forecast, ratio rules, scheduling, call-out repair ----
const OPEN = 390, CLOSE = 1080, BLOCK = 15, NB = (CLOSE - OPEN) / BLOCK;
const MIN_SHIFT = 12, MAX_SHIFT = 34, MAX_EXTENDED = 38, MAX_STRETCH = 8, BREAK_OVER = 24;
const MERGE_BEFORE = (8 * 60 + 30 - OPEN) / BLOCK, MERGE_AFTER = (16 * 60 - OPEN) / BLOCK;
const NC_BANDS = [
  { key: '0-12 months', ratio: 5, max: 10 },
  { key: '12-24 months', ratio: 6, max: 12 },
  { key: '2-3 years', ratio: 10, max: 20 },
  { key: '3-4 years', ratio: 15, max: 25 },
  { key: '4-5 years', ratio: 20, max: 25 },
  { key: '5 years and older', ratio: 25, max: 25 },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
  const headers = (rows.shift() || []).map(h => h.trim());
  return { headers, rows };
}

const SYNONYMS = {
  attendance: {
    child: ['student', 'child', 'student name', 'child name', 'name', 'student id', 'child id'],
    room: ['room', 'classroom', 'class', 'room name', 'group'],
    date: ['date', 'day', 'attendance date', 'check-in date'],
    tin: ['check-in time', 'check in time', 'check-in', 'check in', 'time in', 'sign in', 'sign-in', 'signed in', 'in', 'arrival'],
    tout: ['check-out time', 'check out time', 'check-out', 'check out', 'time out', 'sign out', 'sign-out', 'signed out', 'out', 'departure'],
  },
  staff: {
    staff: ['staff member', 'staff', 'employee', 'teacher', 'staff name', 'employee name', 'name'],
    room: ['room', 'classroom', 'class', 'room name'],
    date: ['date', 'day', 'shift date'],
    tin: ['time in', 'clock in', 'clock-in', 'check-in time', 'check in', 'start', 'start time', 'in'],
    tout: ['time out', 'clock out', 'clock-out', 'check-out time', 'check out', 'end', 'end time', 'out'],
  },
};
function autoMap(headers, kind) {
  const lower = headers.map(h => h.toLowerCase().trim());
  const map = {}, used = new Set();
  for (const [field, names] of Object.entries(SYNONYMS[kind])) {
    let idx = -1;
    for (const n of names) { idx = lower.findIndex((h, i) => h === n && !used.has(i)); if (idx >= 0) break; }
    if (idx < 0) for (const n of names) { idx = lower.findIndex((h, i) => h.includes(n) && n.length > 3 && !used.has(i)); if (idx >= 0) break; }
    map[field] = idx; if (idx >= 0) used.add(idx);
  }
  return map;
}

function parseTime(s) {
  if (!s) return null;
  s = String(s).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?\s*$/);
  if (!m) return null;
  let h = +m[1]; const mi = +m[2];
  if (m[3]) { const pm = m[3].toLowerCase() === 'p'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  const d = new Date(s);
  return isNaN(d) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function iso(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function weekdayOf(isoDate) { const [y, m, d] = isoDate.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }

function normalize(parsed, map, kind) {
  const who = kind === 'attendance' ? 'child' : 'staff';
  const out = []; let skipped = 0;
  for (const r of parsed.rows) {
    const date = parseDate(r[map.date]), tin = parseTime(r[map.tin]), tout = parseTime(r[map.tout]);
    const room = (r[map.room] || '').trim();
    if (!date || tin == null || tout == null || !room || tout <= tin) { skipped++; continue; }
    out.push({ who: (r[map[who]] || '').trim(), room, date, tin, tout });
  }
  return { records: out, skipped };
}

function guessBand(room) {
  const r = room.toLowerCase();
  if (/infant|bab(y|ies)|nursery/.test(r)) return 0;
  if (/\bones?\b|toddler|wobbler/.test(r)) return 1;
  if (/\btwos?\b/.test(r)) return 2;
  if (/\bthrees?\b/.test(r)) return 3;
  if (/\bfours?\b|pre-?k|prek/.test(r)) return 4;
  if (/school|after|kinder/.test(r)) return 5;
  return 3;
}

function blocksOf(tin, tout) {
  const a = Math.max(0, Math.floor((tin - OPEN) / BLOCK));
  const b = Math.min(NB, Math.ceil((tout - OPEN) / BLOCK));
  return [a, b];
}
// date -> room -> per-block count
function countByBlock(records) {
  const out = {};
  for (const v of records) {
    const day = out[v.date] || (out[v.date] = {});
    const arr = day[v.room] || (day[v.room] = new Array(NB).fill(0));
    const [a, b] = blocksOf(v.tin, v.tout);
    for (let t = a; t < b; t++) arr[t]++;
  }
  return out;
}

// Staff the law requires for one unit (rooms sharing an age band) in each block.
function unitNeed(unit, counts, allowMerge) {
  const need = new Array(NB).fill(0), merged = new Array(NB).fill(false), kids = new Array(NB).fill(0);
  const { ratio, max } = unit.band;
  for (let t = 0; t < NB; t++) {
    let sep = 0, total = 0;
    for (const room of unit.rooms) { const c = (counts[room] || [])[t] || 0; total += c; sep += Math.ceil(c / ratio); }
    kids[t] = total; need[t] = sep;
    const window = t < MERGE_BEFORE || t >= MERGE_AFTER;
    if (allowMerge && window && unit.rooms.length > 1 && total > 0 && total <= max) {
      const m = Math.ceil(total / ratio);
      if (m < sep) { need[t] = m; merged[t] = true; }
    }
  }
  return { need, merged, kids };
}

function buildUnits(rooms, bandOf) {
  const byBand = {};
  for (const room of rooms) (byBand[bandOf[room]] || (byBand[bandOf[room]] = [])).push(room);
  return Object.keys(byBand).map(Number).sort((a, b) => a - b).map(b => ({
    id: 'u' + b, band: NC_BANDS[b], rooms: byBand[b].sort(),
    name: byBand[b].length > 1 ? commonName(byBand[b]) : byBand[b][0],
  }));
}
function commonName(rooms) {
  const first = rooms[0].split(' ')[0];
  return rooms.every(r => r.split(' ')[0] === first) ? `${first} (${rooms.length} rooms)` : rooms.join(' + ');
}

// Highest headcount seen on this weekday in the history, plus a safety buffer of children.
function forecastCounts(history, weekday, rooms, buffer) {
  const out = {};
  for (const room of rooms) out[room] = new Array(NB).fill(0);
  for (const [date, day] of Object.entries(history)) {
    if (weekdayOf(date) !== weekday) continue;
    for (const room of rooms) { const arr = day[room]; if (!arr) continue; for (let t = 0; t < NB; t++) if (arr[t] > out[room][t]) out[room][t] = arr[t]; }
  }
  for (const room of rooms) for (let t = 0; t < NB; t++) if (out[room][t] > 0) out[room][t] += buffer;
  return out;
}

// Slice the required-staff curve into shifts, one layer of demand at a time.
function sliceShifts(need) {
  const shifts = [], top = Math.max(0, ...need);
  for (let k = 1; k <= top; k++) {
    let t = 0;
    while (t < NB) {
      if (need[t] < k) { t++; continue; }
      let e = t; while (e < NB && need[e] >= k) e++;
      let s = t, len = e - s;
      if (len < MIN_SHIFT) { const extra = MIN_SHIFT - len; e = Math.min(NB, e + extra); s = Math.max(0, e - MIN_SHIFT); }
      len = e - s;
      if (len > MAX_SHIFT) { // one full-length shift plus a part-time one; alternate which end is long so handovers stagger
        const short = Math.max(MIN_SHIFT, len - MAX_SHIFT);
        const cut = k % 2 ? e - short : s + short;
        shifts.push({ s, e: cut }); shifts.push({ s: cut, e });
      } else shifts.push({ s, e });
      t = Math.max(e, t + 1);
    }
  }
  return shifts.sort((a, b) => a.s - b.s || a.e - b.e);
}

function coverage(shifts) {
  const c = new Array(NB).fill(0);
  for (const sh of shifts) for (let t = sh.s; t < sh.e; t++) c[t]++;
  return c;
}

function planDay(units, fc, rosterByUnit) {
  const plan = { units: [], floaters: [], hours: 0 };
  let longShifts = 0;
  for (const unit of units) {
    const { need, merged, kids } = unitNeed(unit, fc, true);
    const shifts = sliceShifts(need);
    const roster = rosterByUnit[unit.id] || [];
    shifts.forEach((sh, i) => { sh.unit = unit.id; sh.staff = roster[i] || `Open shift ${i - roster.length + 1}`; if (sh.e - sh.s > BREAK_OVER) longShifts++; });
    plan.units.push({ unit, need, merged, kids, shifts });
  }
  const s = (11 * 60 - OPEN) / BLOCK, e = (14 * 60 - OPEN) / BLOCK;
  const n = Math.ceil(longShifts * 2 / (e - s));
  for (let i = 0; i < n; i++) plan.floaters.push({ s, e, unit: 'float', staff: `Break relief ${i + 1}` });
  plan.hours = hoursOf(plan);
  return plan;
}
function hoursOf(plan) {
  let b = 0;
  for (const u of plan.units) for (const sh of u.shifts) b += sh.e - sh.s;
  for (const f of plan.floaters) b += f.e - f.s;
  return b * BLOCK / 60;
}

function currentDay(units, staffRecords) {
  const out = { units: [], hours: 0 };
  for (const unit of units) {
    const shifts = staffRecords.filter(r => unit.rooms.includes(r.room)).map(r => {
      const [s, e] = blocksOf(r.tin, r.tout); return { s, e, staff: r.who, unit: unit.id, room: r.room };
    }).sort((a, b) => a.s - b.s);
    out.units.push({ unit, shifts });
  }
  out.hours = staffRecords.reduce((h, r) => h + (r.tout - r.tin) / 60, 0);
  return out;
}

// Minutes a unit spends with fewer staff than the law requires, against real headcounts.
function outOfRatioMinutes(unit, shifts, actualCounts, allowMerge, byRoom) {
  let blocks = 0;
  if (byRoom) { // current schedule: each room staffed separately
    for (const room of unit.rooms) {
      const cov = coverage(shifts.filter(s => s.room === room));
      const arr = actualCounts[room] || [];
      for (let t = 0; t < NB; t++) if (Math.ceil((arr[t] || 0) / unit.band.ratio) > cov[t]) blocks++;
    }
  } else {
    const { need } = unitNeed(unit, actualCounts, allowMerge), cov = coverage(shifts);
    for (let t = 0; t < NB; t++) if (need[t] > cov[t]) blocks++;
  }
  return blocks * BLOCK;
}

// A staff member calls out: cover the gap from inside the building first.
function repair(plan, unitId, shiftIndex) {
  const next = JSON.parse(JSON.stringify(plan));
  const pu = next.units.find(u => u.unit.id === unitId);
  const gone = pu.shifts.splice(shiftIndex, 1)[0];
  const actions = [];
  const deficit = () => { const cov = coverage(pu.shifts); return pu.need.map((n, t) => Math.max(0, n - cov[t])); };
  const before = deficit().reduce((a, b) => a + (b > 0 ? 1 : 0), 0) * BLOCK;

  // 1. stretch a colleague's shift in the same unit
  let changed = true;
  while (changed) {
    changed = false; const def = deficit();
    for (const sh of pu.shifts) {
      while (sh.e < NB && def[sh.e] > 0 && sh.e - sh.s < MAX_EXTENDED && (sh.extLate || 0) + (sh.extEarly || 0) < MAX_STRETCH) { def[sh.e]--; sh.e++; sh.extLate = (sh.extLate || 0) + 1; changed = true; }
      while (sh.s > 0 && def[sh.s - 1] > 0 && sh.e - sh.s < MAX_EXTENDED && (sh.extLate || 0) + (sh.extEarly || 0) < MAX_STRETCH) { def[sh.s - 1]--; sh.s--; sh.extEarly = (sh.extEarly || 0) + 1; changed = true; }
    }
  }
  for (const sh of pu.shifts) {
    if (sh.extEarly) actions.push({ kind: 'extend', text: `${sh.staff} starts ${span(sh.extEarly)} earlier, at ${clock(sh.s)}` });
    if (sh.extLate) actions.push({ kind: 'extend', text: `${sh.staff} stays ${span(sh.extLate)} later, until ${clock(sh.e)}` });
  }
  // 2. borrow someone from a unit that has spare cover in those blocks
  const def = deficit(); const moves = [];
  for (let t = 0; t < NB; t++) {
    while (def[t] > 0) {
      let found = null;
      const last = moves[moves.length - 1];
      const candidates = [];
      for (const ou of next.units) {
        if (ou === pu) continue;
        const cov = coverage(ou.shifts.filter(x => !x.lent || !x.lent.includes(t)));
        const lentHere = ou.shifts.filter(x => x.lent && x.lent.includes(t)).length;
        if (cov[t] - ou.need[t] < 1) continue;
        for (const sh of ou.shifts) if (sh.s <= t && sh.e > t && !(sh.lent && sh.lent.includes(t))) candidates.push({ ou, sh });
      }
      if (last && last.e === t) found = candidates.find(c => c.sh === last.sh);
      if (!found) found = candidates[0];
      if (!found) break;
      (found.sh.lent || (found.sh.lent = [])).push(t);
      if (last && last.sh === found.sh && last.e === t) last.e = t + 1; else moves.push({ sh: found.sh, from: found.ou.unit.name, s: t, e: t + 1 });
      pu.shifts.push({ s: t, e: t + 1, staff: found.sh.staff, unit: unitId, borrowed: true });
      def[t]--;
    }
  }
  for (const m of moves) actions.push({ kind: 'move', text: `${m.sh.staff} moves from ${m.from} to ${pu.unit.name}, ${clock(m.s)} to ${clock(m.e)}` });
  // 3. whatever is left needs a substitute
  const left = deficit(); const subs = []; let t = 0;
  while (t < NB) { if (left[t] > 0) { let e = t; while (e < NB && left[e] > 0) e++; subs.push({ s: t, e }); t = e; } else t++; }
  for (const s of subs) actions.push({ kind: 'sub', text: `Substitute needed in ${pu.unit.name}, ${clock(s.s)} to ${clock(s.e)}` });
  const subHours = subs.reduce((h, s) => h + (s.e - s.s), 0) * BLOCK / 60;
  return { plan: next, gone, actions, minutesAtRisk: before, subHours, lostHours: (gone.e - gone.s) * BLOCK / 60 };
}

function span(blocks) { const m = blocks * BLOCK; return m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`; }
function clock(block) {
  const m = OPEN + block * BLOCK; let h = Math.floor(m / 60); const mi = m % 60;
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return mi ? `${h}:${String(mi).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

const Engine = { OPEN, CLOSE, BLOCK, NB, NC_BANDS, WEEKDAYS, MERGE_BEFORE, MERGE_AFTER, parseCSV, autoMap, normalize, guessBand, countByBlock, unitNeed, buildUnits, forecastCounts, sliceShifts, coverage, planDay, currentDay, outOfRatioMinutes, repair, clock, weekdayOf, SYNONYMS };
if (typeof module !== 'undefined') module.exports = Engine;
