// ---- Headcount engine ----
// Everything the app computes lives here, with no page code, so it can be read and tested on its own.
//   1. Import      parseCSV, autoMap, normalize
//   2. Rules       NC_BANDS, unitNeed (legal staff required per 15-minute block)
//   3. Forecast    countByBlock, forecastCounts
//   4. Schedule    rosterFor, assignDay (place the center's own staff where the children are)
//   5. Check       coverage, outOfRatioMinutes, callOut
const OPEN = 390, CLOSE = 1080, BLOCK = 15, NB = (CLOSE - OPEN) / BLOCK;
const MIN_SHIFT = 12;   // 3 hours: nobody is sent home before this
const MAX_SHIFT = 36;   // 9 hours: nobody is kept longer than this
const LOOKAHEAD = 8;    // 2 hours: don't send someone home if they'd be needed again this soon
const MERGE_BEFORE = (8 * 60 + 30 - OPEN) / BLOCK, MERGE_AFTER = (16 * 60 - OPEN) / BLOCK;
// North Carolina's staff-to-child rules, grouped into the three categories directors use.
// Infants and toddlers are the state's own bands. "Preschool" covers ages 2 to 5, where the
// state sets 1:10 (age 2), 1:15 (age 3) and 1:20 (age 4). When ages are mixed the state applies the
// youngest child's ratio, so one preschool category has to use 1:10 to be legal for every child in it.
const NC_BANDS = [
  { label: 'Infants', key: 'birth to 12 months', ratio: 5, max: 10 },
  { label: 'Toddlers', key: '12 to 24 months', ratio: 6, max: 12 },
  { label: 'Preschool', key: '2 to 5 years', ratio: 10, max: 20 },
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
  return 2;                                   // twos, threes, fours, pre-K and anything unrecognized
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
    id: 'u' + b, band: NC_BANDS[b], rooms: byBand[b].sort(), name: NC_BANDS[b].label,
  }));
}

// Highest headcount seen on this weekday in the history (also checking 15 minutes either side), plus a safety cushion of children.
function forecastCounts(history, weekday, rooms, buffer) {
  const out = {};
  for (const room of rooms) out[room] = new Array(NB).fill(0);
  for (const [date, day] of Object.entries(history)) {
    if (weekdayOf(date) !== weekday) continue;
    for (const room of rooms) { const arr = day[room]; if (!arr) continue; for (let t = 0; t < NB; t++) if (arr[t] > out[room][t]) out[room][t] = arr[t]; }
  }
  // Children arrive and leave a little earlier or later than they ever have before, so each
  // block also looks at the 15 minutes either side of it before the cushion is added.
  for (const room of rooms) {
    const seen = out[room];
    out[room] = seen.map((n, t) => Math.max(n, seen[t - 1] || 0, seen[t + 1] || 0));
    for (let t = 0; t < NB; t++) if (out[room][t] > 0) out[room][t] += buffer;
  }
  return out;
}


function coverage(shifts) {
  const c = new Array(NB).fill(0);
  for (const sh of shifts) for (let t = sh.s; t < sh.e; t++) c[t]++;
  return c;
}

// The staff file lists who is available and when. One window per person per day.
function rosterFor(staffRecords, units) {
  const unitOfRoom = {};
  for (const u of units) for (const r of u.rooms) unitOfRoom[r] = u.id;
  const byName = {};
  for (const r of staffRecords) {
    const [s, e] = blocksOf(r.tin, r.tout);
    const p = byName[r.who] || (byName[r.who] = { who: r.who, room: r.room, home: unitOfRoom[r.room] || null, s, e });
    p.s = Math.min(p.s, s); p.e = Math.max(p.e, e);
  }
  return Object.values(byName).sort((a, b) => a.s - b.s || a.e - b.e || a.who.localeCompare(b.who));
}

// Place the center's own staff into age groups, block by block, so every group meets ratio.
// Rules of thumb, in order: keep whoever is already in the room; bring in the room's own staff
// before borrowing; start the person who has to leave soonest; send people home only once they
// have done a minimum shift and will not be needed again within two hours.
function assignDay(units, fc, roster, exclude) {
  const needs = units.map(u => ({ unit: u, ...unitNeed(u, fc, true) }));
  const people = roster.filter(p => p.who !== exclude).map(p => ({ ...p, state: 'idle', unit: null, start: null, day: null }));
  const shifts = [], gaps = needs.map(() => new Array(NB).fill(0));
  const active = ui => people.filter(p => p.state === 'on' && p.unit === units[ui].id);
  const futureMax = (ui, t, span) => Math.max(0, ...needs[ui].need.slice(t, t + span));
  // A group can lend someone only if its remaining people still cover its own requirement for the rest of that person's day.
  const canSpare = (p, t) => {
    const hi = units.findIndex(x => x.id === p.home);
    if (hi < 0) return true;
    const mates = people.filter(q => q !== p && q.home === p.home && q.state !== 'done');
    for (let f = t; f < Math.min(p.e, NB); f++) {
      const there = mates.filter(q => q.s <= f && f < q.e && (q.state !== 'on' || f - q.day < MAX_SHIFT)).length;
      if (there < needs[hi].need[f]) return false;
    }
    return true;
  };
  const finish = (p, t) => { if (t > p.start) shifts.push({ who: p.who, home: p.home, room: p.room, unit: p.unit, s: p.start, e: t, from: p.s, until: p.e, borrowed: p.home !== p.unit }); p.state = 'done'; };

  const surplus = (ui, t) => active(ui).length - Math.max(needs[ui].need[t], futureMax(ui, t, LOOKAHEAD));
  for (let t = 0; t < NB; t++) {
    for (const p of people) if (p.state === 'on' && (t >= p.e || t - p.day >= MAX_SHIFT)) finish(p, t);
    units.forEach((u, ui) => {                       // bring in staff where the requirement rises
      let short = needs[ui].need[t] - active(ui).length;
      while (short > 0) {
        const idle = people.filter(p => p.state === 'idle' && p.s <= t && p.e - t >= 4);
        let pick = idle.filter(p => p.home === u.id).sort((a, b) => a.e - b.e)[0];
        if (!pick) {                                 // someone already here whose own group can spare them
          const donor = units.findIndex((x, xi) => xi !== ui && surplus(xi, t) > 0);
          if (donor >= 0) {
            const mover = active(donor).sort((a, b) => b.e - a.e)[0], day = mover.day;
            finish(mover, t); mover.state = 'on'; mover.unit = u.id; mover.start = t; mover.day = day;
            short--; continue;
          }
        }
        if (!pick) pick = idle.filter(p => canSpare(p, t)).sort((a, b) => a.e - b.e)[0];
        if (!pick) pick = people.filter(p => p.state === 'idle' && p.s <= t && t < p.e && (p.home === u.id || canSpare(p, t))).sort((a, b) => b.e - a.e)[0];   // last resort: a short stint beats a gap
        if (!pick) { gaps[ui][t] = short; break; }
        pick.state = 'on'; pick.unit = u.id; pick.start = t; pick.day = t; short--;
      }
    });
    units.forEach((u, ui) => {                       // send home anyone no longer needed
      const free = active(ui).filter(p => t - p.day >= MIN_SHIFT).sort((a, b) => a.e - b.e);
      for (const p of free) { if (surplus(ui, t) <= 0) break; finish(p, t); }
    });
  }
  for (const p of people) if (p.state === 'on') finish(p, Math.min(p.e, NB));

  const out = { units: [], unused: people.filter(p => p.state === 'idle').map(p => p.who), hours: 0, gapHours: 0 };
  needs.forEach((n, ui) => {
    const mine = shifts.filter(s => s.unit === n.unit.id).sort((a, b) => a.s - b.s || a.e - b.e);
    const gapRuns = []; let t = 0;
    while (t < NB) { if (gaps[ui][t] > 0) { let e = t; while (e < NB && gaps[ui][e] > 0) e++; gapRuns.push({ s: t, e, short: Math.max(...gaps[ui].slice(t, e)) }); t = e; } else t++; }
    out.units.push({ unit: n.unit, need: n.need, merged: n.merged, kids: n.kids, shifts: mine, gaps: gapRuns });
    out.hours += mine.reduce((h, s) => h + (s.e - s.s), 0) * BLOCK / 60;
    out.gapHours += gaps[ui].reduce((a, b) => a + b, 0) * BLOCK / 60;
  });
  return out;
}

// The schedule as the staff file describes it: everyone works their whole window in their own room.
function currentDay(units, roster) {
  const out = { units: [], hours: 0 };
  for (const unit of units) {
    const shifts = roster.filter(p => p.home === unit.id).map(p => ({ who: p.who, room: p.room, unit: unit.id, s: p.s, e: p.e }));
    out.units.push({ unit, shifts });
    out.hours += shifts.reduce((h, s) => h + (s.e - s.s), 0) * BLOCK / 60;
  }
  return out;
}

// Minutes a group spends with fewer staff than the law requires, judged against real headcounts.
function outOfRatioMinutes(unit, shifts, actualCounts, allowMerge, byRoom) {
  let blocks = 0;
  if (byRoom) {
    for (const room of unit.rooms) {
      const cov = coverage(shifts.filter(s => s.room === room)), arr = actualCounts[room] || [];
      for (let t = 0; t < NB; t++) if (Math.ceil((arr[t] || 0) / unit.band.ratio) > cov[t]) blocks++;
    }
  } else {
    const { need } = unitNeed(unit, actualCounts, allowMerge), cov = coverage(shifts);
    for (let t = 0; t < NB; t++) if (need[t] > cov[t]) blocks++;
  }
  return blocks * BLOCK;
}

// Someone calls out: leave everyone else's day alone as far as possible and fill only the hole.
// Order: stretch colleagues in the same group (inside the hours they said they can work), bring in
// anyone not yet scheduled, borrow from a group with spare cover, then name the hours needing a substitute.
function callOut(plan, roster, who) {
  const next = JSON.parse(JSON.stringify(plan));
  const pu = next.units.find(u => u.shifts.some(s => s.who === who));
  const gone = pu.shifts.splice(pu.shifts.findIndex(s => s.who === who), 1)[0];
  const deficit = () => { const c = coverage(pu.shifts); return pu.need.map((n, t) => Math.max(0, n - c[t])); };
  const minutesAtRisk = deficit().filter(d => d > 0).length * BLOCK;
  const actions = [];

  let def = deficit();
  for (const sh of pu.shifts) {                                   // 1. stretch colleagues
    const s0 = sh.s, e0 = sh.e;
    while (sh.e < Math.min(sh.until, NB) && def[sh.e] > 0 && sh.e - sh.s < MAX_SHIFT) { def[sh.e]--; sh.e++; }
    while (sh.s > Math.max(sh.from, 0) && def[sh.s - 1] > 0 && sh.e - sh.s < MAX_SHIFT) { def[sh.s - 1]--; sh.s--; }
    const bits = [];
    if (sh.s < s0) bits.push(`starts ${span(s0 - sh.s)} earlier, at ${clock(sh.s)}`);
    if (sh.e > e0) bits.push(`stays ${span(sh.e - e0)} later, until ${clock(sh.e)}`);
    if (bits.length) { sh.changed = true; actions.push(`${sh.who} ${bits.join(' and ')}`); }
  }
  for (const name of [...next.unused]) {                          // 2. bring in anyone not yet scheduled
    const p = roster.find(r => r.who === name); def = deficit();
    let s = -1, e = -1;
    for (let t = Math.max(p.s, 0); t < Math.min(p.e, NB); t++) if (def[t] > 0) { if (s < 0) s = t; e = t + 1; }
    if (s < 0) continue;
    e = Math.min(e, s + MAX_SHIFT);
    pu.shifts.push({ who: p.who, home: p.home, room: p.room, unit: pu.unit.id, s, e, from: p.s, until: p.e, borrowed: p.home !== pu.unit.id, changed: true });
    next.unused = next.unused.filter(n => n !== name);
    actions.push(`${p.who} comes in, ${clock(s)} to ${clock(e)}`);
  }
  def = deficit(); const moves = [];                              // 3. borrow from a group with spare cover
  for (let t = 0; t < NB; t++) while (def[t] > 0) {
    const last = moves[moves.length - 1]; let found = null;
    for (const ou of next.units) {
      if (ou === pu) continue;
      const free = ou.shifts.filter(x => x.s <= t && t < x.e && !(x.lent || []).includes(t));
      if (free.length - ou.need[t] < 1) continue;
      found = (last && last.e === t && free.find(x => x === last.sh)) || free[0];
      if (found) { found = { sh: found, from: ou.unit.name }; break; }
    }
    if (!found) break;
    (found.sh.lent || (found.sh.lent = [])).push(t);
    if (last && last.sh === found.sh && last.e === t) last.e = t + 1; else moves.push({ sh: found.sh, from: found.from, s: t, e: t + 1 });
    def[t]--;
  }
  for (const m of moves) {
    pu.shifts.push({ who: m.sh.who, home: m.sh.home, room: m.sh.room, unit: pu.unit.id, s: m.s, e: m.e, from: m.sh.from, until: m.sh.until, borrowed: true, changed: true });
    actions.push(`${m.sh.who} moves over from ${m.from}, ${clock(m.s)} to ${clock(m.e)}`);
  }
  const left = deficit(), subs = []; let t = 0;                   // 4. whatever is left needs a substitute
  while (t < NB) { if (left[t] > 0) { let e = t; while (e < NB && left[e] > 0) e++; subs.push({ s: t, e, short: Math.max(...left.slice(t, e)) }); t = e; } else t++; }
  pu.gaps = subs;
  pu.shifts.sort((a, b) => a.s - b.s || a.e - b.e);
  return { plan: next, gone, unitName: pu.unit.name, actions, subs, minutesAtRisk, lostHours: (gone.e - gone.s) * BLOCK / 60, subHours: left.reduce((a, b) => a + b, 0) * BLOCK / 60 };
}

function span(blocks) { const m = blocks * BLOCK; return m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`; }
function clock(block) {
  const m = OPEN + block * BLOCK; let h = Math.floor(m / 60); const mi = m % 60;
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return mi ? `${h}:${String(mi).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

const Engine = { OPEN, CLOSE, BLOCK, NB, NC_BANDS, WEEKDAYS, SYNONYMS, parseCSV, autoMap, normalize, guessBand, weekdayOf, countByBlock, unitNeed, buildUnits, forecastCounts, coverage, rosterFor, assignDay, currentDay, outOfRatioMinutes, callOut, clock };
if (typeof module !== 'undefined') module.exports = Engine;
