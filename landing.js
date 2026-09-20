// Landing page: shows the pre-built sample week in the calendar. No uploads, no network needed.
(function () {
  const demo = window.HEADCOUNT_DEMO, seg = document.getElementById('daySeg'), cal = document.getElementById('calendar');
  const days = Object.keys(demo.days).map(Number).sort();
  let day = days[0];
  function draw() {
    seg.innerHTML = days.map(d => `<button type="button" data-d="${d}" aria-pressed="${d === day}">${demo.dayNames[d]}</button>`).join('');
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { day = +b.dataset.d; draw(); });
    renderCalendar(cal, demo.days[day], { open: demo.open, blockMinutes: demo.blockMinutes });
  }
  draw();
})();
