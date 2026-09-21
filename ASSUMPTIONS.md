# Assumptions and known limitations

## Data
- The two sample CSV files are fictional. `ratios_by_state.csv` is real but only partly verified.
- The sample check-in column names imitate a childcare check-in report export. They are a guess.
  Brightwheel does not publish its export headers. The column matcher is meant to absorb the difference.
- The sample staff file (openers, closers and middle shifts per room, plus six part-time aides;
  33 people in all) is invented. Real savings can only be measured with a real center's files.
- The staff file is read two ways: as the hours each person is available, and as the center's
  current schedule for comparison. A real deployment would ask for availability separately.

## Rules
- North Carolina's own bands, from the state's Summary of the North Carolina Child Care Law (the copy
  read was revised June 2019; they match the state's 2025-2027 CCDF plan): 0-12 months 1:5 (group 10),
  12-24 months 1:6 (12), 2-3 years 1:10 (20), 3-4 years 1:15 (25), 4-5 years 1:20 (25).
- The app groups these into three categories: Infants 1:5, Toddlers 1:6, Preschool (ages 2 to 5) 1:10
  with a maximum group of 20. One preschool category has to use the age-2 ratio, because the state
  applies the youngest child's ratio to a mixed group. This is stricter than the law requires for
  rooms of only 3- or 4-year-olds, so it overstates the staff those rooms need.
- When ages are mixed, North Carolina applies the youngest child's ratio. The demo avoids the
  question by only combining rooms in the same age band.
- The combining windows (before 8:30am, after 4pm) are a design choice, not a legal rule.
- Not modeled: nap-time rules, staff qualifications, five-star enhanced ratios, break laws, overtime.
- `ratios_by_state.csv` was compiled from a First Five Years Fund chart of state CCDF plans and
  cross-checked for infants and toddlers only. Rows marked `verify` disagree with a second source
  or look misread. Check any state against its administrative code before use.

## Scheduling
- The forecast is the highest headcount seen on that weekday plus a cushion. It is deliberately
  cautious and is not a statistical model.
- Staff are placed by a greedy, block-by-block rule set (see the README). It is fast and easy to
  explain, but it is not guaranteed to find the fewest possible hours.
- Shifts are at least 3 hours and at most 9. Breaks are not modeled, so the scheduled hours are
  lower than a real schedule that pays for break cover.
- Anyone may be placed in any room. Staff qualifications and continuity of care are not modeled.
- Call-out repair keeps other people's days fixed where it can; it does not re-plan the whole day.

## Sources
- Summary of the North Carolina Child Care Law: https://www.uncfsu.edu/assets/Documents/Early%20Childhood%20Learning%20Center/Summary%20NC%20Law.pdf
- First Five Years Fund, ratios by state: https://www.ffyf.org/2026/05/29/child-care-ratios/
- Brightwheel report documentation: https://help.mybrightwheel.com/en/articles/942384-reports-data-overview
