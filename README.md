# csv-reader-speed-01-run-20261121

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/luthiiiialvaro/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/luthiiiialvaro/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: `solve.js` reads broken CSV files with
exactly the reference reader's answers — same records, same broken-row
errors — in a single left-to-right scan. Unquoted fields are sliced straight
out of the input instead of built one character at a time, and quoted fields
jump to their closing quote with `indexOf`, so it runs several times faster
than the house baseline on the same cases.

`main.ts` reads every case from `/input/cases.json`, answers each with `run`,
and writes `/output/answers.json`.
