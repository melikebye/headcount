// Headcount UI: imports files, runs the engine, draws the chart and schedule.
(function(){
const E = Engine, $ = id => document.getElementById(id);
const state = { att:null, stf:null, bandOf:{}, weekday:1, unit:null, view:'plan', repair:null, model:null };
const FIELD_LABEL = { child:'Child', staff:'Staff member', room:'Room', date:'Date', tin:'Time in', tout:'Time out' };

function load(kind, text, name){
  const parsed = E.parseCSV(text), map = E.autoMap(parsed.headers, kind);
  const slot = { parsed, map, name, kind };
  state[kind === 'attendance' ? 'att' : 'stf'] = slot;
  renderMap(slot); apply(slot);
}
function apply(slot){
  const need = Object.keys(E.SYNONYMS[slot.kind]).filter(f => f !== 'child' && f !== 'staff');
  const missing = need.filter(f => slot.map[f] < 0);
  const status = $(slot.kind === 'attendance' ? 'statusAtt' : 'statusStf');
  if (missing.length){ slot.records = []; status.className = 'status err'; status.textContent = 'Match these columns to continue: ' + missing.map(f => FIELD_LABEL[f]).join(', ') + '.'; return; }
  const n = E.normalize(slot.parsed, slot.map, slot.kind);
  slot.records = n.records;
  const dates = [...new Set(n.records.map(r => r.date))].sort();
  status.className = n.records.length ? 'status' : 'status err';
  status.textContent = n.records.length
    ? `${slot.name}: ${n.records.length.toLocaleString()} rows read, ${dates[0]} to ${dates[dates.length-1]}.` + (n.skipped ? ` ${n.skipped} rows skipped because a date or time could not be read.` : '')
    : 'No rows could be read. Check that the date and time columns are matched correctly.';
}
function renderMap(slot){
  const box = $(slot.kind === 'attendance' ? 'mapAtt' : 'mapStf'); box.innerHTML = '';
  for (const f of Object.keys(E.SYNONYMS[slot.kind])){
    const lab = document.createElement('label'); lab.className = 'field'; lab.textContent = FIELD_LABEL[f];
    const sel = document.createElement('select'); sel.id = `map-${slot.kind}-${f}`;
    sel.innerHTML = '<option value="-1">Not in file</option>' + slot.parsed.headers.map((h,i) => `<option value="${i}">${esc(h)}</option>`).join('');
    sel.value = slot.map[f];
    sel.onchange = () => { slot.map[f] = +sel.value; apply(slot); rebuild(true); };
    lab.appendChild(sel); box.appendChild(lab);
  }
}
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function rebuild(resetRooms){
  const att = state.att.records || [], stf = state.stf.records || [];
  if (!att.length){ $('kpis').innerHTML = ''; $('kpiNote').textContent = 'Load a check-in file to see a plan.'; return; }
  const rooms = [...new Set(att.map(r => r.room))].sort();
  if (resetRooms) for (const r of rooms) if (!(r in state.bandOf)) state.bandOf[r] = E.guessBand(r);
  const counts = E.countByBlock(att), dates = Object.keys(counts).sort();
  const holdout = dates.length >= 10 ? dates.slice(-5) : [];
  const history = {}; (holdout.length ? dates.slice(0, -5) : dates).forEach(d => history[d] = counts[d]);
  const units = E.buildUnits(rooms, state.bandOf);
  const roster = {}; units.forEach(u => roster[u.id] = [...new Set(stf.filter(r => u.rooms.includes(r.room)).map(r => r.who))]);
  const buffer = +$('buffer').value;
  const weekdays = [...new Set(dates.map(E.weekdayOf))].sort();
  const plans = {}, currents = {};
  const stfDates = [...new Set(stf.map(r => r.date))].sort();
  for (const wd of weekdays){
    plans[wd] = E.planDay(units, E.forecastCounts(history, wd, rooms, buffer), roster);
    const last = stfDates.filter(d => E.weekdayOf(d) === wd).pop();
    currents[wd] = last ? E.currentDay(units, stf.filter(r => r.date === last)) : null;
  }
  let pOOR = 0, cOOR = 0;
  for (const d of holdout){
    const wd = E.weekdayOf(d);
    for (const pu of plans[wd].units) pOOR += E.outOfRatioMinutes(pu.unit, pu.shifts, counts[d], true, false);
    const cur = E.currentDay(units, stf.filter(r => r.date === d));
    for (const cu of cur.units) cOOR += E.outOfRatioMinutes(cu.unit, cu.shifts, counts[d], false, true);
  }
  state.model = { rooms, counts, dates, holdout, history, units, plans, currents, weekdays, pOOR, cOOR, enrolled: enrolledByRoom(att) };
  if (!weekdays.includes(state.weekday)) state.weekday = weekdays[0];
  if (!units.find(u => u.id === state.unit)) state.unit = units[0].id;
  state.repair = null;
  renderRooms(); renderKpis(); renderDaySeg(); renderUnitSel(); renderDay();
}
function enrolledByRoom(att){ const m = {}; for (const r of att) (m[r.room] || (m[r.room] = new Set())).add(r.who); const o = {}; for (const k in m) o[k] = m[k].size; return o; }

function renderRooms(){
  const m = state.model;
  $('roomTable').innerHTML = '<thead><tr><th>Room</th><th>Age band</th><th class="n">Ratio</th><th class="n">Max group</th><th class="n">Children seen</th></tr></thead><tbody>' +
    m.rooms.map((r,i) => { const b = E.NC_BANDS[state.bandOf[r]];
      return `<tr><td>${esc(r)}</td><td><select id="band-${i}" data-room="${esc(r)}">${E.NC_BANDS.map((x,j) => `<option value="${j}" ${j===state.bandOf[r]?'selected':''}>${x.key}</option>`).join('')}</select></td><td class="n">1:${b.ratio}</td><td class="n">${b.max}</td><td class="n">${m.enrolled[r]||0}</td></tr>`; }).join('') + '</tbody>';
  $('roomTable').querySelectorAll('select').forEach(s => s.onchange = () => { state.bandOf[s.dataset.room] = +s.value; rebuild(false); });
}

function renderKpis(){
  const m = state.model, wage = +$('wage').value || 0;
  let ph = 0, ch = 0, have = true;
  for (const wd of m.weekdays){ ph += m.plans[wd].hours; if (m.currents[wd]) ch += m.currents[wd].hours; else have = false; }
  const fmt = n => Math.round(n).toLocaleString();
  const tiles = [];
  if (have && ch > 0){
    const saved = ch - ph, pct = saved / ch * 100;
    tiles.push(`<div class="kpi hero"><span class="l">Staff hours saved per week</span><span class="v">${fmt(saved)} hrs</span><span class="s">${pct.toFixed(0)}% fewer than the current schedule</span></div>`);
    tiles.push(`<div class="kpi"><span class="l">Worth per year</span><span class="v">$${fmt(saved * wage * 50)}</span><span class="s">at $${wage}/hr over 50 weeks</span></div>`);
    tiles.push(`<div class="kpi"><span class="l">Scheduled hours per week</span><span class="v">${fmt(ph)}</span><span class="s">current schedule: ${fmt(ch)}</span></div>`);
  } else {
    tiles.push(`<div class="kpi hero"><span class="l">Scheduled hours per week</span><span class="v">${fmt(ph)}</span><span class="s">load staff timecards to compare</span></div>`);
  }
  if (m.holdout.length){
    const ok = m.pOOR === 0;
    tiles.push(`<div class="kpi"><span class="l">Minutes below ratio, test week</span><span class="v">${m.pOOR}</span><span class="s">current schedule: ${m.cOOR} min</span><span class="pill ${ok?'good':'bad'}">${ok?'&#10003; In ratio all week':'&#9888; Raise the safety buffer'}</span></div>`);
  }
  $('kpis').innerHTML = tiles.join('');
  $('kpiNote').textContent = m.holdout.length
    ? `How this is tested: the forecast uses every day except the most recent week (${m.holdout[0]} to ${m.holdout[m.holdout.length-1]}). Both schedules are then replayed against the children who actually attended that week.`
    : 'Load at least two weeks of check-ins to test the schedule against a week it has not seen.';
}

function renderDaySeg(){
  const m = state.model;
  $('daySeg').innerHTML = m.weekdays.map(wd => `<button type="button" data-wd="${wd}" aria-pressed="${wd===state.weekday}">${E.WEEKDAYS[wd].slice(0,3)}</button>`).join('');
  $('daySeg').querySelectorAll('button').forEach(b => b.onclick = () => { state.weekday = +b.dataset.wd; state.repair = null; renderDaySeg(); renderDay(); });
}
function renderUnitSel(){
  const m = state.model;
  $('unitSel').innerHTML = m.units.map(u => `<option value="${u.id}">${esc(u.name)} · 1:${u.band.ratio}</option>`).join('');
  $('unitSel').value = state.unit;
}
function activePlan(){ return state.repair ? state.repair.plan : state.model.plans[state.weekday]; }
function renderDay(){ renderChart(); renderGantt(); renderRepair(); }

function renderChart(){
  const m = state.model, plan = activePlan(), pu = plan.units.find(u => u.unit.id === state.unit);
  const cur = m.currents[state.weekday], cu = cur && cur.units.find(u => u.unit.id === state.unit);
  const pc = E.coverage(pu.shifts), cc = cu ? E.coverage(cu.shifts) : null;
  const day = E.WEEKDAYS[state.weekday];
  $('chartTitle').textContent = `${pu.unit.name}, ${day}s`;
  const mergedBlocks = pu.merged.filter(Boolean).length;
  $('chartSub').textContent = `Ages ${pu.unit.band.key}: one staff member per ${pu.unit.band.ratio} children, groups of up to ${pu.unit.band.max}.` + (mergedBlocks ? ` Rooms combined for ${(mergedBlocks*15/60).toFixed(2).replace(/\.?0+$/,'')} hours at the edges of the day.` : '');
  const W = 960, H = 300, L = 44, R = 16, T = 16, B = 34, pw = W-L-R, ph = H-T-B, NB = E.NB;
  const top = Math.max(2, ...pu.need, ...pc, ...(cc||[0])) + 1;
  const x = t => L + t/NB*pw, y = v => T + ph - v/top*ph;
  let s = '';
  for (let v = 0; v <= top; v++){ s += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v===0?1.5:1}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`; }
  for (let t = 0; t <= NB; t++){ const min = E.OPEN + t*15; if (min % 60 === 30 && t !== 0 && t !== NB) continue; if (min % 60 !== 0 && t !== 0) continue;
    s += `<text x="${x(t)}" y="${H-12}" text-anchor="middle">${E.clock(t)}</text>`; }
  // merged windows
  let t = 0; while (t < NB){ if (pu.merged[t]){ let e = t; while (e < NB && pu.merged[e]) e++; s += `<rect x="${x(t)}" y="${T}" width="${x(e)-x(t)}" height="${ph}" fill="var(--merge)"/>`; t = e; } else t++; }
  const step = arr => { let d = `M${x(0)},${y(arr[0])}`; for (let i = 0; i < NB; i++){ d += `H${x(i+1)}`; if (i+1 < NB) d += `V${y(arr[i+1])}`; } return d; };
  s += `<path d="${step(pu.need)}V${y(0)}H${x(0)}Z" fill="var(--need-fill)"/>`;
  if (cc){ // below-ratio marks for the current schedule, judged room by room against the forecast
    const fcNeed = E.unitNeed(pu.unit, forecastFor(state.weekday), false).need;
    for (let i = 0; i < NB; i++) if (cc[i] < fcNeed[i]) s += `<rect x="${x(i)+1}" y="${y(0)+3}" width="${pw/NB-2}" height="6" rx="2" fill="var(--bad)"/>`;
    s += `<path d="${step(cc)}" fill="none" stroke="var(--current)" stroke-width="2" stroke-linejoin="round"/>`;
  }
  s += `<path d="${step(pc)}" fill="none" stroke="var(--planned)" stroke-width="2.5" stroke-linejoin="round"/>`;
  s += `<text x="${L}" y="11" text-anchor="start">staff on the floor</text>`;
  s += `<line id="xh" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="var(--ink2)" stroke-width="1" visibility="hidden"/>`;
  s += `<rect id="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
  $('chart').innerHTML = s;
  const tip = $('tip'), box = $('chartbox'), xh = $('xh');
  const show = ev => {
    const r = $('chart').getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(NB-1, Math.floor((px - L) / pw * NB)));
    xh.setAttribute('x1', x(i+.5)); xh.setAttribute('x2', x(i+.5)); xh.setAttribute('visibility','visible');
    tip.innerHTML = `<div><b>${E.clock(i)} to ${E.clock(i+1)}</b></div><div class="row"><span>Children forecast</span><b>${pu.kids[i]}</b></div><div class="row"><span>Staff required</span><b>${pu.need[i]}</b></div><div class="row"><span>Headcount</span><b>${pc[i]}</b></div>` + (cc ? `<div class="row"><span>Current</span><b>${cc[i]}</b></div>` : '') + (pu.merged[i] ? '<div>Rooms combined</div>' : '');
    tip.hidden = false;
    const bx = box.getBoundingClientRect(); let left = ev.clientX - bx.left + 14; if (left + 190 > bx.width) left = ev.clientX - bx.left - 190;
    tip.style.left = Math.max(0,left) + 'px'; tip.style.top = '20px';
  };
  $('hit').addEventListener('pointermove', show); $('hit').addEventListener('pointerdown', show);
  $('hit').addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('visibility','hidden'); });
  // table view, hourly
  let rows = '';
  for (let i = 0; i < NB; i += 2) rows += `<tr><td>${E.clock(i)}</td><td class="n">${Math.max(pu.kids[i],pu.kids[i+1]||0)}</td><td class="n">${Math.max(pu.need[i],pu.need[i+1]||0)}</td><td class="n">${Math.min(pc[i],pc[i+1]??pc[i])}</td><td class="n">${cc?Math.min(cc[i],cc[i+1]??cc[i]):'-'}</td></tr>`;
  $('chartTable').innerHTML = '<thead><tr><th>Half hour from</th><th class="n">Children forecast</th><th class="n">Staff required</th><th class="n">Headcount</th><th class="n">Current</th></tr></thead><tbody>' + rows + '</tbody>';
}
function forecastFor(wd){ const m = state.model; return E.forecastCounts(m.history, wd, m.rooms, +$('buffer').value); }

function renderGantt(){
  const m = state.model, g = $('gantt'), NB = E.NB; let h = '';
  h += `<div class="axis"><div></div><div class="t">${[7,9,11,13,15,17].map(hr=>`<span style="left:${(hr*60-E.OPEN)/(E.CLOSE-E.OPEN)*100}%">${hr<12?hr+'am':(hr===12?12:hr-12)+'pm'}</span>`).join('')}</div><div></div></div>`;
  const pos = sh => `left:${sh.s/NB*100}%;width:${(sh.e-sh.s)/NB*100}%`;
  $('schedTitle').textContent = `${E.WEEKDAYS[state.weekday]} schedule`;
  if (state.view === 'plan'){
    const plan = activePlan();
    for (const pu of plan.units){
      h += `<div class="gunit">${esc(pu.unit.name)}</div>`;
      const rows = {}; pu.shifts.forEach((sh,i) => { (rows[sh.staff] || (rows[sh.staff] = [])).push({sh,i}); });
      for (const [name, list] of Object.entries(rows)){
        const own = list.find(x => !x.sh.borrowed);
        h += `<div class="grow"><div class="gname" title="${esc(name)}">${esc(name)}</div><div class="track">` +
          list.map(({sh}) => `<div class="bar ${sh.borrowed?'borrowed':''} ${(sh.extEarly||sh.extLate)?'changed':''}" style="${pos(sh)}">${sh.e-sh.s>=6?E.clock(sh.s)+'–'+E.clock(sh.e):''}</div>`).join('') +
          `</div><div>${own && !state.repair ? `<button type="button" class="small" data-unit="${pu.unit.id}" data-i="${own.i}">Called out</button>` : ''}</div></div>`;
      }
    }
    if (plan.floaters.length){ h += `<div class="gunit">Break relief</div>`; for (const f of plan.floaters) h += `<div class="grow"><div class="gname">${esc(f.staff)}</div><div class="track"><div class="bar float" style="${pos(f)}">${E.clock(f.s)}–${E.clock(f.e)}</div></div><div></div></div>`; }
  } else {
    const cur = m.currents[state.weekday];
    if (!cur) h += '<p class="muted">Load staff timecards to see the current schedule.</p>';
    else for (const cu of cur.units){ h += `<div class="gunit">${esc(cu.unit.name)}</div>`; for (const sh of cu.shifts) h += `<div class="grow"><div class="gname" title="${esc(sh.staff)}">${esc(sh.staff)}</div><div class="track"><div class="bar cur" style="${pos(sh)}">${E.clock(sh.s)}–${E.clock(sh.e)}</div></div><div class="muted">${esc(sh.room)}</div></div>`; }
  }
  g.innerHTML = h;
  g.querySelectorAll('button[data-unit]').forEach(b => b.onclick = () => {
    state.repair = E.repair(state.model.plans[state.weekday], b.dataset.unit, +b.dataset.i);
    state.unit = b.dataset.unit; $('unitSel').value = state.unit; renderDay();
    $('repairBox').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  });
}
function renderRepair(){
  const box = $('repairBox'), r = state.repair;
  if (!r){ box.hidden = true; box.innerHTML = ''; return; }
  const covered = r.lostHours - r.subHours;
  box.hidden = false;
  box.innerHTML = `<div class="result"><strong>${esc(r.gone.staff)} called out (${E.clock(r.gone.s)} to ${E.clock(r.gone.e)}).</strong>
    <span>Left alone, the group would spend <strong>${r.minutesAtRisk} minutes below ratio</strong>. Repaired plan:</span>
    <ul>${r.actions.map(a => `<li>${esc(a.text)}</li>`).join('') || '<li>Other shifts already cover the gap.</li>'}</ul>
    <span>${r.subHours ? `A substitute is needed for ${r.subHours} of the ${r.lostHours} lost hours.` : `All ${r.lostHours} lost hours are covered by people already in the building.`}</span>
    <div><button type="button" id="undo">Undo call-out</button></div></div>`;
  $('undo').onclick = () => { state.repair = null; renderDay(); };
}

$('fileAtt').onchange = e => readFile(e, 'attendance');
$('fileStf').onchange = e => readFile(e, 'staff');
function readFile(e, kind){ const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { state.bandOf = kind==='attendance' ? {} : state.bandOf; load(kind, fr.result, f.name); $('sampleNote').hidden = kind==='attendance' ? true : $('sampleNote').hidden; rebuild(true); }; fr.readAsText(f); }
$('buffer').onchange = () => rebuild(false);
$('wage').oninput = () => state.model && renderKpis();
$('unitSel').onchange = () => { state.unit = $('unitSel').value; renderChart(); };
$('viewSeg').querySelectorAll('button').forEach(b => b.onclick = () => { state.view = b.dataset.view; $('viewSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderGantt(); });

// Load the bundled sample files so the page opens in a working state.
Promise.all([
  fetch('sample_checkin_report.csv').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
  fetch('sample_staff_timecards.csv').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
]).then(([att, stf]) => {
  load('attendance', att.trim(), 'Sample check-in report');
  load('staff', stf.trim(), 'Sample timecards');
  rebuild(true);
}).catch(() => {
  $('sampleNote').innerHTML = '<strong>Sample data could not be loaded.</strong> Browsers block file loading when a page is opened by double-click. Run <code>python3 -m http.server</code> in this folder and open http://localhost:8000, or upload your own files below.';
  $('dataPanel').open = true;
});
})();
