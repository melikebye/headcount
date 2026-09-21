HEADCOUNT
Staff smart. Stay compliant.

Headcount reads two files a childcare center already has (children's check-ins, and staff
with their hours), works out how many teachers North Carolina law requires in each room
every 15 minutes, and places the center's own staff where the children are. When someone
calls out, it repairs the day.

All data included here is fictional. No real children, staff or centers appear anywhere.


============================================================
HOW TO RUN THE APP
============================================================

Option A: open the live site (nothing to install)

    https://melikebye.github.io/headcount/

Option B: run it from this folder (nothing to install)

    1. Unzip the folder.
    2. Double-click index.html. It opens in your web browser.
       Chrome, Edge, Firefox and Safari all work.

    That is all. There is no server, database, account or package to set up. An internet
    connection is optional: it is only used to load the display font.

Option C: run it from a local web server (optional)

    1. Open a terminal in this folder.
    2. Run:   python3 -m http.server 8000
    3. Open:  http://localhost:8000


============================================================
HOW TO USE IT
============================================================

1. Home page (index.html)
   Scroll down to see what Headcount does and a sample day in the calendar.
   Click "Get started!" or "File Upload" in the header.

2. File Upload page (app.html)
   Quickest: click "Try it with sample data".
   Or upload the two sample files included in this folder:
       Box 1, Children's check-ins:   sample_checkin_report.csv
       Box 2, Staff and their hours:  sample_staff_timecards.csv
   then click "Make my schedule".

   What you will see:
     - A summary line and three tiles (staff hours freed up, worth per year, hours scheduled).
     - The week's calendar. Pick a day with the Monday-to-Friday buttons.
       Blue band = children in the group. Green card = a teacher in their own room.
       Yellow card = a teacher helping another room. Red dashed box = short-staffed.
     - Call-out test: click any teacher's card, then "Mark as called out".
       Headcount repairs the day and lists exactly what changed.
     - "Teachers required vs scheduled" chart for each age group.
     - "Rooms and the rules applied to them" shows each room's category and ratio.

   Your own files work too: any CSV with a room, a date, a time in and a time out.
   Columns are matched automatically and can be corrected by hand.
   Files never leave the browser. Nothing is uploaded to a server.

3. Pricing page (pricing.html)
   The three proposed price tiers.


============================================================
HOW TO RUN THE TESTS (optional, needs Node.js)
============================================================

    node engine.test.js

Nine tests cover CSV reading, column matching, the ratio rules, room combining, and the
scheduler's guarantees (nobody outside their hours, nobody double-booked, nobody over nine
hours, every short-staffed block flagged). Expected last line: "9 tests passed".


============================================================
WHAT IS IN THIS FOLDER
============================================================

The app
    index.html       Home page
    app.html         File Upload page (the working tool)
    pricing.html     Pricing page
    styles.css       Colors, type and layout for all three pages
    engine.js        ALL the logic, with no page code: CSV import, ratio rules, forecast,
                     staff placement, call-out repair. Start here to review the code.
    app.js           File Upload page: uploads, summary, calendar, chart
    calendar.js      Draws the calendar
    landing.js       Day picker for the sample calendar on the home page
    demo_data.js     Sample week shown on the home page (built by build_demo_data.js)
    sample_data.js   Sample files behind "Try it with sample data" (built the same way)
    logo.png, favicon.png, brightwheel.png, procare.png     Images

Supporting files
    sample_checkin_report.csv     Fictional check-ins, in the layout of a Brightwheel report
    sample_staff_timecards.csv    Fictional staff hours
    generate_sample_data.py       Rebuilds the two sample CSVs (fixed random seed)
    build_demo_data.js            Rebuilds demo_data.js and sample_data.js from the CSVs
    engine.test.js                Tests for the logic
    ratios_by_state.csv           Staff-to-child ratios for 50 states and DC, partly verified
    ASSUMPTIONS.md                Every assumption and known limitation
    README.md                     The same information as this file, formatted for GitHub


============================================================
GOOD TO KNOW
============================================================

- Rules used: North Carolina. Infants 1:5, Toddlers 1:6, Preschool (ages 2 to 5) 1:10.
- The forecast is deliberately simple and cautious: for each weekday it plans to the busiest
  day seen in the history, plus a safety cushion of children per room. The most recent week
  is held back and used to test the schedule.
- Savings shown on the sample data illustrate how the tool works. They are not evidence
  about a real center. Prices on the pricing page are proposed, not tested with customers.
- Brightwheel and Procare are trademarks of their owners. Headcount reads the CSV reports
  those products export and is not affiliated with either company.
- Source code: https://github.com/melikebye/headcount
