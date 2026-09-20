# Assumptions and known limitations

## Data
- The two sample CSV files are fictional. `ratios_by_state.csv` is real but only partly verified.
- The sample check-in column names imitate a childcare check-in report export. They are a guess.
  Brightwheel does not publish its export headers. The column matcher is meant to absorb the difference.
- The "current schedule" in the sample (one opener, one closer and one mid shift per staffing slot)
  is invented. Real savings can only be measured with a real center's timecards.

## Rules
- North Carolina ratios and maximum group sizes come from the state's Summary of the North Carolina
  Child Care Law (the copy read was revised June 2019) and match the state's 2025-2027 CCDF plan:
  0-12 months 1:5 (group 10), 12-24 months 1:6 (12), 2-3 years 1:10 (20), 3-4 years 1:15 (25),
  4-5 years 1:20 (25), 5 and older 1:25 (25).
- When ages are mixed, North Carolina applies the youngest child's ratio. The demo avoids the
  question by only combining rooms in the same age band.
- The combining windows (before 8:30am, after 4pm) are a design choice, not a legal rule.
- Not modeled: nap-time rules, staff qualifications, five-star enhanced ratios, break laws, overtime.
- `ratios_by_state.csv` was compiled from a First Five Years Fund chart of state CCDF plans and
  cross-checked for infants and toddlers only. Rows marked `verify` disagree with a second source
  or look misread. Check any state against its administrative code before use.

## Scheduling
- The forecast is the highest headcount seen on that weekday plus a buffer. It is deliberately
  cautious and is not a statistical model.
- Shifts run 3 to 8.5 hours. The plan can call for more part-time shifts than a center can hire
  for; there is no setting yet for a minimum number of full-time staff.
- Call-out repair assumes any staff member may work in any room.
- Break relief is approximated as floaters between 11am and 2pm.

## Sources
- Summary of the North Carolina Child Care Law: https://www.uncfsu.edu/assets/Documents/Early%20Childhood%20Learning%20Center/Summary%20NC%20Law.pdf
- First Five Years Fund, ratios by state: https://www.ffyf.org/2026/05/29/child-care-ratios/
- Brightwheel report documentation: https://help.mybrightwheel.com/en/articles/942384-reports-data-overview
