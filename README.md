# Headcount

The right number of teachers in every room, every hour.

Headcount reads two files a childcare center already has (children's check-ins, and staff with
their hours), works out how many teachers North Carolina law requires in each room every
15 minutes, and places the center's own staff where the children are. When someone calls out,
it repairs the day.

**Live demo:** https://melikebye.github.io/headcount/

> All data in this repository is fictional. The sample center, children and staff were generated
> by `generate_sample_data.py`. The savings the tool shows on sample data illustrate the mechanism
> and are not evidence about a real center.

## The three pages

| Page | What it is |
|---|---|
| `index.html` | Landing page: logo, the problem, how it works, and a sample week in the calendar |
| `app.html` | File Upload: upload two CSVs, get the week's schedule, test a call-out |
| `pricing.html` | Pricing: three flat tiers by classroom count |

## Run it

Open `index.html`. Everything the sample needs is built into the pages, so it works by
double-click, from a local server (`python3 -m http.server 8000`), or from GitHub Pages.

## Run the tests

```
node engine.test.js
```

No packages to install. Nine tests cover CSV reading, column matching, the ratio rules, room
combining, and the scheduler's guarantees (nobody outside their hours, nobody double-booked,
nobody over nine hours, every short block flagged).

## Files

| File | What it holds |
|---|---|
| `engine.js` | All the logic, with no page code: import, ratio rules, forecast, staff placement, call-out repair |
| `calendar.js` | The calendar view used by both pages |
| `app.js` | The tool page: uploads, summary, calendar, chart |
| `landing.js` | The landing page's day picker |
| `styles.css` | Brand colors, type and layout for both pages |
| `demo_data.js`, `sample_data.js` | Built by `build_demo_data.js` from the sample CSVs so the pages need no network |
| `build_demo_data.js` | Rebuilds those two files |
| `generate_sample_data.py` | Rebuilds the fictional sample CSVs (fixed random seed) |
| `sample_checkin_report.csv`, `sample_staff_timecards.csv` | The fictional sample files |
| `ratios_by_state.csv` | Staff-to-child ratios for 50 states and DC, partly verified |
| `engine.test.js` | Tests for the logic |
| `ASSUMPTIONS.md` | Every assumption and known limitation, with sources |

## How the schedule is built

1. **Import.** Any CSV with a room, a date, a time in and a time out. Columns are matched by
   name; anything unmatched can be set by hand.
2. **Forecast.** For each weekday, plan to the busiest day seen in the history (also checking
   15 minutes either side of each block), plus a cushion of children per room.
3. **Requirement.** Children in the room divided by the legal ratio, rounded up. Three categories:
   infants 1:5, toddlers 1:6, preschoolers 1:10. Rooms in the same category may combine before 8:30am and after 4pm when the group fits the legal maximum size.
4. **Place the staff.** Block by block: keep whoever is already in the room, bring in the room's
   own staff before borrowing, start the person who has to leave soonest, and send people home
   only after a three-hour minimum and when they will not be needed again within two hours.
   Nobody is scheduled outside the hours in the staff file or for more than nine hours. Any block
   that cannot be covered is flagged in red rather than hidden.
5. **Test.** The most recent week is held back. The Headcount schedule and the hours in the staff
   file are both replayed against the children who actually attended, and minutes below ratio
   are counted.
6. **Call-out repair.** Everyone else's day is left alone as far as possible: stretch colleagues
   in the same group, bring in anyone unscheduled, borrow from a group with spare cover, then
   name the exact hours that need a substitute.

See `ASSUMPTIONS.md` before relying on any number this produces.
