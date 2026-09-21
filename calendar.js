// ---- Headcount calendar ----
// Draws one day as a calendar: time runs down the left, one column per age group.
// In each column the blue band is the CHILDREN (darker = fuller, number = headcount)
// and the rounded cards are the STAFF placed with them.
//
// renderCalendar(container, day, options)
//   day.units[]  { name, ratio, rooms, kids[], need[], merged[], shifts[], gaps[] }   (arrays are per 15-minute block)
//   options      { open, blockMinutes, onPick(shift, unit), picked }
(function () {
  const ROW = 15;                                   // pixels per 15-minute block

  function clock(open, step, block) {
    const m = open + block * step; let h = Math.floor(m / 60); const mi = m % 60;
    const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
    return mi ? `${h}:${String(mi).padStart(2, '0')}${ap}` : `${h}${ap}`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Put overlapping shifts side by side, the way a calendar does.
  function lanes(shifts) {
    const ends = [];
    const placed = shifts.slice().sort((a, b) => a.s - b.s || b.e - a.e).map(sh => {
      let lane = ends.findIndex(e => e <= sh.s);
      if (lane < 0) lane = ends.length;
      ends[lane] = sh.e;
      return { sh, lane };
    });
    return { placed, count: Math.max(1, ends.length) };
  }

  function renderCalendar(el, day, opts) {
    const open = opts.open ?? 390, step = opts.blockMinutes ?? 15;
    const nb = day.units[0] ? day.units[0].kids.length : 46;
    const peak = Math.max(1, ...day.units.map(u => Math.max(...u.kids)));
    const T = b => clock(open, step, b);

    let gutter = '';
    for (let b = 0; b <= nb; b++) if ((open + b * step) % 60 === 0) gutter += `<div class="cal-hour" style="top:${b * ROW}px">${T(b)}</div>`;

    // Busy groups need more side-by-side room for staff cards, so columns are sized by how many overlap.
    const laid = day.units.map(u => lanes(u.shifts));
    const template = '58px ' + laid.map(l => `minmax(200px, ${Math.max(3, l.count)}fr)`).join(' ');

    const cols = day.units.map((u, ui) => {
      let band = '';
      for (let b = 0; b < nb; b += 2) {                       // children band, in half-hour pieces
        const k = Math.max(u.kids[b], u.kids[b + 1] ?? 0);
        if (!k) continue;
        const a = 0.14 + 0.72 * (k / peak);
        band += `<div class="cal-kids ${a > 0.5 ? 'dark' : ''}" style="top:${b * ROW}px;height:${2 * ROW}px;background:rgba(58,112,190,${a.toFixed(2)})" title="${k} children, ${T(b)}">${(open + b * step) % 60 === 0 || b === 0 ? k : ''}</div>`;
      }
      let merged = '', t = 0;
      while (t < nb) { if (u.merged[t]) { let e = t; while (e < nb && u.merged[e]) e++; merged += `<div class="cal-merged" style="top:${t * ROW}px;height:${(e - t) * ROW}px" title="Rooms combined, ${T(t)} to ${T(e)}"></div>`; t = e; } else t++; }

      const { placed, count } = laid[ui];
      const w = 100 / count;
      const cards = placed.map(({ sh, lane }) => {
        const cls = ['cal-card', sh.borrowed ? 'moved' : 'home', sh.changed ? 'changed' : '', count > 3 ? 'narrow' : '', opts.picked === sh.who ? 'picked' : ''].join(' ');
        return `<button type="button" class="${cls}" data-unit="${ui}" data-who="${esc(sh.who)}" data-s="${sh.s}" style="top:${sh.s * ROW}px;height:${(sh.e - sh.s) * ROW - 2}px;left:${lane * w}%;width:calc(${w}% - 3px)" title="${esc(sh.who)}, ${T(sh.s)} to ${T(sh.e)}"><span class="nm">${esc(sh.who)}</span><span class="tm">${T(sh.s)}–${T(sh.e)}</span></button>`;
      }).join('');
      const gaps = (u.gaps || []).map(g => `<div class="cal-gap" style="top:${g.s * ROW}px;height:${Math.max(2, g.e - g.s) * ROW - 2}px" title="Short by ${g.short}, ${T(g.s)} to ${T(g.e)}">Need ${g.short} more<br>${T(g.s)}–${T(g.e)}</div>`).join('');

      return `<div class="cal-col">
        <div class="cal-head"><strong>${esc(u.name)}</strong><span>1 teacher per ${u.ratio} children${u.rooms ? ` · ${u.rooms} room${u.rooms > 1 ? 's' : ''}` : ''}</span></div>
        <div class="cal-body" style="height:${nb * ROW}px">
          <div class="cal-lines" style="background-size:100% ${4 * ROW}px;background-position:0 ${((60 - open % 60) % 60) / step * ROW}px"></div>
          <div class="cal-band">${band}${merged}</div>
          <div class="cal-staff">${cards}${gaps}</div>
        </div></div>`;
    }).join('');

    el.innerHTML = `<div class="cal" style="grid-template-columns:${template};min-width:${58 + day.units.length * 200}px">
      <div class="cal-gutter"><div class="cal-head"></div><div class="cal-body" style="height:${nb * ROW}px">${gutter}</div></div>${cols}</div>`;

    if (opts.onPick) el.querySelectorAll('.cal-card').forEach(b => b.addEventListener('click', () => {
      const unit = day.units[+b.dataset.unit];
      opts.onPick(unit.shifts.find(s => s.who === b.dataset.who && s.s === +b.dataset.s), unit);
    }));
  }

  window.renderCalendar = renderCalendar;
})();
