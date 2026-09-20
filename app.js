// ---- Headcount tool page ----
// Reads the two uploaded files, runs the engine, and draws the summary, calendar and chart.
(function () {
const E = Engine, $ = id => document.getElementById(id);
const state = { att: null, stf: null, bandOf: {}, weekday: null, unit: null, picked: null, repair: null, model: null, sample: false };
const LABEL = { child: 'Child', staff: 'Staff member', room: 'Room', date: 'Date', tin: 'Time in', tout: 'Time out' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString();

// ---------- 1. files ----------
function load(kind, text, name) {
  const parsed = E.parseCSV(text), slot = { kind, name, parsed, map: E.autoMap(parsed.headers, kind), records: [] };
  state[kind === 'attendance' ? 'att' : 'stf'] = slot;
  drawMap(slot); check(slot);
}
function check(slot) {
  const isAtt = slot.kind === 'attendance', status = $(isAtt ? 'statusAtt' : 'statusStf'), box = $(isAtt ? 'dropAtt' : 'dropStf'), det = $(isAtt ? 'detAtt' : 'detStf');
  const required = Object.keys(E.SYNONYMS[slot.kind]).filter(f => f !== 'child');
  const missing = required.filter(f => slot.map[f] < 0);
  det.hidden = false;
  if (missing.length) {
    slot.records = []; det.open = true;
    status.className = 'status err'; status.textContent = `Couldn't find a column for: ${missing.map(f => LABEL[f]).join(', ')}. Pick it below.`;
  } else {
    const n = E.normalize(slot.parsed, slot.map, slot.kind); slot.records = n.records;
    const dates = [...new Set(n.records.map(r => r.date))].sort();
    if (n.records.length) { status.className = 'status'; status.textContent = `✓ ${slot.name}: ${n.records.length.toLocaleString()} rows, ${dates[0]} to ${dates[dates.length - 1]}.` + (n.skipped ? ` ${n.skipped} rows skipped (unreadable date or time).` : ''); }
    else { status.className = 'status err'; status.textContent = 'No rows could be read. Check the date and time columns below.'; det.open = true; }
  }
  box.classList.toggle('ready', slot.records.length > 0);
  $('go').disabled = !(state.att && state.att.records.length && state.stf && state.stf.records.length);
}
function drawMap(slot) {
  const box = $(slot.kind === 'attendance' ? 'mapAtt' : 'mapStf'); box.innerHTML = '';
  for (const f of Object.keys(E.SYNONYMS[slot.kind])) {
    const lab = document.createElement('label'); lab.className = 'field'; lab.textContent = LABEL[f];
    const sel = document.createElement('select'); sel.id = `map-${slot.kind}-${f}`;
    sel.innerHTML = '<option value="-1">Not in file</option>' + slot.parsed.headers.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('');
    sel.value = slot.map[f];
    sel.onchange = () => { slot.map[f] = +sel.value; check(slot); };
    lab.appendChild(sel); box.appendChild(lab);
  }
}
function readFile(file, kind) { const fr = new FileReader(); fr.onload = () => { state.sample = false; load(kind, fr.result, file.name); }; fr.readAsText(file); }
for (const [input, drop, kind] of [['fileAtt', 'dropAtt', 'attendance'], ['fileStf', 'dropStf', 'staff']]) {
  $(input).onchange = e => e.target.files[0] && readFile(e.target.files[0], kind);
  const d = $(drop);
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0], kind); };
}
$('useSample').onclick = () => {
  load('attendance', window.HEADCOUNT_SAMPLE.attendance.trim(), 'Sample check-ins');
  load('staff', window.HEADCOUNT_SAMPLE.staff.trim(), 'Sample staff hours');
  state.sample = true; build(true); reveal();
};
$('go').onclick = () => { build(true); reveal(); };
function reveal() { $('results').hidden = false; $('sampleNote').hidden = !state.sample; $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }

// ---------- 2. build the week ----------
function build(resetRooms) {
  const att = state.att.records, stf = state.stf.records;
  const rooms = [...new Set(att.map(r => r.room))].sort();
  if (resetRooms) { state.bandOf = {}; rooms.forEach(r => state.bandOf[r] = E.guessBand(r)); }
  const counts = E.countByBlock(att), dates = Object.keys(counts).sort();
  const holdout = dates.length >= 10 ? dates.slice(-5) : [];
  const history = {}; (holdout.length ? dates.slice(0, -5) : dates).forEach(d => history[d] = counts[d]);
  const units = E.buildUnits(rooms, state.bandOf), buffer = +$('buffer').value;
  const stfDates = [...new Set(stf.map(r => r.date))].sort();
  const weekdays = [...new Set(dates.map(E.weekdayOf))].sort(), days = {};
  for (const wd of weekdays) {
    const last = stfDates.filter(d => E.weekdayOf(d) === wd).pop();
    const roster = E.rosterFor(last ? stf.filter(r => r.date === last) : [], units);
    const fc = E.forecastCounts(history, wd, rooms, buffer);
    days[wd] = { fc, roster, plan: E.assignDay(units, fc, roster), current: E.currentDay(units, roster) };
  }
  let planLow = 0, curLow = 0;                       // replay both schedules against the held-back week
  for (const d of holdout) {
    const day = days[E.weekdayOf(d)];
    for (const pu of day.plan.units) planLow += E.outOfRatioMinutes(pu.unit, pu.shifts, counts[d], true, false);
    for (const cu of day.current.units) curLow += E.outOfRatioMinutes(cu.unit, cu.shifts, counts[d], false, true);
  }
  const enrolled = {}; for (const r of att) (enrolled[r.room] || (enrolled[r.room] = new Set())).add(r.who);
  state.model = { rooms, units, days, weekdays, holdout, planLow, curLow, enrolled };
  if (!weekdays.includes(state.weekday)) state.weekday = weekdays[0];
  if (!units.find(u => u.id === state.unit)) state.unit = units[0].id;
  state.repair = null; state.picked = null;
  drawSummary(); drawDays(); drawUnits(); drawRooms(); drawDay();
}

// ---------- 3. summary ----------
function drawSummary() {
  const m = state.model, wage = +$('wage').value || 0;
  let plan = 0, cur = 0, gap = 0;
  for (const wd of m.weekdays) { plan += m.days[wd].plan.hours; cur += m.days[wd].current.hours; gap += m.days[wd].plan.gapHours; }
  const saved = cur - plan, s = $('summary');
  s.className = 'summary' + (gap > 0 ? ' warn' : '');
  s.innerHTML = `This week: <strong>${fmt(plan)} staff hours</strong> scheduled across ${m.units.length} age groups` +
    (m.holdout.length ? `, <strong>${m.planLow} minutes below ratio</strong> in the test week (your staff file: ${m.curLow}).` : '.') +
    (gap > 0 ? ` <strong>Short-staffed for ${gap.toFixed(1).replace(/\.0$/, '')} hours</strong>: see the red boxes.` : ' Every forecast hour is covered.');
  $('tiles').innerHTML =
    `<div class="tile lead"><span class="l">Staff hours freed up per week</span><span class="v">${fmt(saved)} hrs</span><span class="s">${cur ? (saved / cur * 100).toFixed(0) : 0}% of the hours in your staff file</span></div>` +
    `<div class="tile"><span class="l">Worth per year</span><span class="v">$${fmt(saved * wage * 50)}</span><span class="s">at $${wage}/hr over 50 weeks, to spend on pay or more children</span></div>` +
    `<div class="tile"><span class="l">Scheduled hours per week</span><span class="v">${fmt(plan)}</span><span class="s">your staff file: ${fmt(cur)}</span></div>`;
  $('testNote').textContent = m.holdout.length
    ? `How this is tested: the forecast uses every day except the most recent week (${m.holdout[0]} to ${m.holdout[m.holdout.length - 1]}). Both schedules are then replayed against the children who actually attended that week.`
    : 'Upload at least two weeks of check-ins to test the schedule against a week it has not seen.';
}

// ---------- 4. calendar and call-outs ----------
function drawDays() {
  const m = state.model;
  $('daySeg').innerHTML = m.weekdays.map(wd => `<button type="button" data-wd="${wd}" aria-pressed="${wd === state.weekday}">${E.WEEKDAYS[wd].slice(0, 3)}</button>`).join('');
  $('daySeg').querySelectorAll('button').forEach(b => b.onclick = () => { state.weekday = +b.dataset.wd; state.repair = null; state.picked = null; drawDays(); drawDay(); });
}
function activePlan() { return state.repair ? state.repair.plan : state.model.days[state.weekday].plan; }
function drawDay() { drawCalendar(); drawPick(); drawRepair(); drawChart(); }
function drawCalendar() {
  const plan = activePlan();
  $('calTitle').textContent = `${E.WEEKDAYS[state.weekday]}'s schedule`;
  renderCalendar($('calendar'), { units: plan.units.map(pu => ({ name: pu.unit.name, ratio: pu.unit.band.ratio, kids: pu.kids, need: pu.need, merged: pu.merged, shifts: pu.shifts, gaps: pu.gaps })) },
    { open: E.OPEN, blockMinutes: E.BLOCK, picked: state.picked, onPick: sh => { if (state.repair) return; state.picked = sh.who; drawCalendar(); drawPick(); } });
  $('unusedNote').textContent = plan.unused.length ? `Not needed on this day: ${plan.unused.join(', ')}.` : '';
}
function drawPick() {
  const bar = $('pickbar');
  if (state.repair) { bar.hidden = true; return; }
  bar.hidden = false;
  if (!state.picked) { bar.innerHTML = '<span class="muted">Click any staff card, then mark them as called out to see the day get repaired.</span>'; return; }
  const all = activePlan().units.flatMap(pu => pu.shifts.filter(s => s.who === state.picked).map(s => `${pu.unit.name}, ${E.clock(s.s)} to ${E.clock(s.e)}`));
  bar.innerHTML = `<strong>${esc(state.picked)}</strong><span>${esc(all.join(' · '))}</span><button type="button" class="btn small primary" id="callout">Mark as called out</button><button type="button" class="btn small" id="unpick">Cancel</button>`;
  $('callout').onclick = () => { const d = state.model.days[state.weekday]; state.repair = E.callOut(d.plan, d.roster, state.picked); state.unit = state.repair.plan.units.find(u => u.unit.name === state.repair.unitName).unit.id; $('unitSel').value = state.unit; drawDay(); };
  $('unpick').onclick = () => { state.picked = null; drawCalendar(); drawPick(); };
}
function drawRepair() {
  const box = $('repairBox'), r = state.repair;
  if (!r) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="result"><strong>${esc(r.gone.who)} called out (${esc(r.unitName)}, ${E.clock(r.gone.s)} to ${E.clock(r.gone.e)}).</strong>
    <span>Left alone, that group would spend <strong>${r.minutesAtRisk} minutes below ratio</strong>. Here is the repair:</span>
    <ul>${r.actions.map(a => `<li>${esc(a)}</li>`).join('') || '<li>The rest of the team already covers it.</li>'}${r.subs.map(g => `<li><strong>Substitute needed ${E.clock(g.s)} to ${E.clock(g.e)}</strong></li>`).join('')}</ul>
    <span>${r.subHours ? `${(r.lostHours - r.subHours).toFixed(2).replace(/\.?0+$/, '')} of the ${r.lostHours} lost hours are covered by people already on the schedule.` : `All ${r.lostHours} lost hours are covered by people already on the schedule.`} Changed cards are outlined in navy.</span>
    <div><button type="button" class="btn small" id="undo">Undo call-out</button></div></div>`;
  $('undo').onclick = () => { state.repair = null; state.picked = null; drawDay(); };
}

// ---------- 5. chart ----------
function drawUnits() {
  $('unitSel').innerHTML = state.model.units.map(u => `<option value="${u.id}">${esc(u.name)} · 1:${u.band.ratio}</option>`).join('');
  $('unitSel').value = state.unit;
}
function drawChart() {
  const d = state.model.days[state.weekday], pu = activePlan().units.find(u => u.unit.id === state.unit), cu = d.current.units.find(u => u.unit.id === state.unit);
  const pc = E.coverage(pu.shifts), cc = E.coverage(cu.shifts), NB = E.NB;
  const roomNeed = E.unitNeed(pu.unit, d.fc, false).need;         // your file staffs each room on its own, with no combining
  $('chartSub').textContent = `${pu.unit.name}, ${E.WEEKDAYS[state.weekday]}s. Ages ${pu.unit.band.key}: one teacher per ${pu.unit.band.ratio} children, groups of up to ${pu.unit.band.max}.`;
  const W = 960, H = 300, L = 40, R = 16, T = 22, B = 34, pw = W - L - R, ph = H - T - B;
  const top = Math.max(2, ...pu.need, ...pc, ...cc) + 1, x = t => L + t / NB * pw, y = v => T + ph - v / top * ph;
  const step = a => { let p = `M${x(0)},${y(a[0])}`; for (let i = 0; i < NB; i++) { p += `H${x(i + 1)}`; if (i + 1 < NB) p += `V${y(a[i + 1])}`; } return p; };
  let s = '';
  for (let v = 0; v <= top; v++) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#c9d8ee" stroke-width="${v ? 1 : 1.5}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let t = 0; t <= NB; t++) if ((E.OPEN + t * 15) % 60 === 0) s += `<text x="${x(t)}" y="${H - 12}" text-anchor="middle">${E.clock(t)}</text>`;
  s += `<path d="${step(pu.need)}V${y(0)}H${x(0)}Z" fill="#d3e2f6"/>`;
  for (let i = 0; i < NB; i++) if (cc[i] < roomNeed[i]) s += `<rect x="${x(i) + 1}" y="${y(0) + 3}" width="${pw / NB - 2}" height="6" rx="2" fill="#c8372d"/>`;
  s += `<path d="${step(cc)}" fill="none" stroke="#fab95b" stroke-width="3.5" stroke-linejoin="round"/>`;
  s += `<path d="${step(pc)}" fill="none" stroke="#3a70be" stroke-width="3" stroke-linejoin="round"/>`;
  s += `<text x="${L}" y="12">teachers in the room</text><line id="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#163c73" visibility="hidden"/><rect id="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
  $('chart').innerHTML = s;
  const tip = $('tip'), show = ev => {
    const r = $('chart').getBoundingClientRect(), i = Math.max(0, Math.min(NB - 1, Math.floor(((ev.clientX - r.left) / r.width * W - L) / pw * NB)));
    $('xh').setAttribute('x1', x(i + .5)); $('xh').setAttribute('x2', x(i + .5)); $('xh').setAttribute('visibility', 'visible');
    tip.innerHTML = `<strong>${E.clock(i)} to ${E.clock(i + 1)}</strong><div class="row"><span>Children forecast</span><b>${pu.kids[i]}</b></div><div class="row"><span>Teachers required</span><b>${pu.need[i]}</b></div><div class="row"><span>Headcount schedule</span><b>${pc[i]}</b></div><div class="row"><span>Your staff file</span><b>${cc[i]}</b></div>`;
    tip.hidden = false; const bx = $('chartbox').getBoundingClientRect(); let left = ev.clientX - bx.left + 14; if (left + 200 > bx.width) left -= 228;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '24px';
  };
  $('hit').addEventListener('pointermove', show); $('hit').addEventListener('pointerdown', show);
  $('hit').addEventListener('pointerleave', () => { tip.hidden = true; $('xh').setAttribute('visibility', 'hidden'); });
  let rows = '';
  for (let i = 0; i < NB; i += 2) rows += `<tr><td>${E.clock(i)}</td><td class="n">${Math.max(pu.kids[i], pu.kids[i + 1] || 0)}</td><td class="n">${Math.max(pu.need[i], pu.need[i + 1] || 0)}</td><td class="n">${Math.min(pc[i], pc[i + 1] ?? pc[i])}</td><td class="n">${Math.min(cc[i], cc[i + 1] ?? cc[i])}</td></tr>`;
  $('chartTable').innerHTML = '<thead><tr><th>Half hour from</th><th class="n">Children forecast</th><th class="n">Teachers required</th><th class="n">Headcount</th><th class="n">Your staff file</th></tr></thead><tbody>' + rows + '</tbody>';
}

// ---------- 6. rooms and rules ----------
function drawRooms() {
  const m = state.model;
  $('roomTable').innerHTML = '<thead><tr><th>Room</th><th>Age band</th><th class="n">Ratio</th><th class="n">Max group</th><th class="n">Children seen</th></tr></thead><tbody>' +
    m.rooms.map((r, i) => { const b = E.NC_BANDS[state.bandOf[r]]; return `<tr><td>${esc(r)}</td><td><select id="band-${i}" data-room="${esc(r)}">${E.NC_BANDS.map((x, j) => `<option value="${j}" ${j === state.bandOf[r] ? 'selected' : ''}>${x.key}</option>`).join('')}</select></td><td class="n">1:${b.ratio}</td><td class="n">${b.max}</td><td class="n">${m.enrolled[r] ? m.enrolled[r].size : 0}</td></tr>`; }).join('') + '</tbody>';
  $('roomTable').querySelectorAll('select').forEach(s => s.onchange = () => { state.bandOf[s.dataset.room] = +s.value; build(false); });
}

$('buffer').onchange = () => state.model && build(false);
$('wage').oninput = () => state.model && drawSummary();
$('unitSel').onchange = () => { state.unit = $('unitSel').value; drawChart(); };
})();
