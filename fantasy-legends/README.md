# Fantasy Legends data (1950–1999)

Game-by-game stats for NFL stars from 1950 to 1999 (QB, RB, WR, TE and K), plus team-defense (DST) game logs for every team from 1950 to 1999.

- **Legends:** 92 hand-picked stars, mostly Hall of Famers (`legend: true`).
- **Running backs:** every RB with 2,000+ career rushing yards from 1950 to 1999, 319 in all, including the 27 legends.
- **Wide receivers:** every WR with 2,000+ career receiving yards from 1950 to 1999, 351 in all, including the 22 legends. Ends (E) and flankers (FL) from the 1950s–60s count as receivers.
- **Quarterbacks:** every QB with 5,000+ career passing yards, 178 in all.
- **Tight ends:** every TE with 1,500+ career receiving yards. **Kickers:** everyone with 50+ career field goals, whatever their listed position (early kickers were often linemen or receivers).
- A player listed at more than one position goes to the first one listed in the source ("RB-WR" → RB, "WR-TE" → WR).

## Files (`data/`)

| File | What's in it |
| --- | --- |
| `players.json` | All 1,082 players: id, name, fantasy position, Hall of Fame and legend flags, seasons, teams, college, draft info |
| `player_gamelogs.json` / `.csv` | One row per game played (regular season + playoffs) for those players |
| `dst_gamelogs.json` / `.csv` | One row per team per game, 1950–1999 (18k games) |
| `fantasy_legends.xlsx` | Everything above in one workbook, with a Notes sheet explaining the columns |
| `running_backs.xlsx` | Just the 319 running backs and their game logs |
| `wide_receivers.xlsx` | Just the 351 wide receivers and their game logs |
| `sheets/` | Per-position CSVs for Google Sheets: season totals, plus game logs split by decade. Google Sheets loads them with `=IMPORTDATA("https://raw.githubusercontent.com/...")` |
| `featured_defenses.json` | Season totals for iconic defenses (Steel Curtain, '85 Bears, Purple People Eaters…) |

The JSON game logs use a compact `{ "columns": [...], "rows": [[...], ...] }` format:

```js
const { columns, rows } = await (await fetch("data/player_gamelogs.json")).json();
const games = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
```

Join game logs to `players.json` on `player_id`. `week` is the team's game number. `playoff: true` marks postseason games.

## Fantasy points

`fpts_std` and `fpts_ppr` use standard scoring:
- Passing: 0.04 per yard, 4 per TD, −2 per INT
- Rushing and receiving: 0.1 per yard, 6 per TD
- Kick and punt return TDs: 6
- Kickers: 3 per FG, 1 per XP
- PPR adds 1 per reception

DST `fpts`: 1 per sack, 2 per INT, 2 per safety, 6 per INT-return or kick/punt-return TD, plus points allowed (0 → 10, 1–6 → 7, 7–13 → 4, 14–20 → 1, 21–27 → 0, 28–34 → −1, 35+ → −4).

## Repaired scoring fields (WR and TE so far)

WR and TE game logs in `data/sheets/` also carry `pass_yds`, `pass_td`, `pass_int`, `two_pt`, `fum_rec_td`, plus:
- `complete` / `missing_fields`: which fields are unknown for that game (left blank, never zero-filled).
- `source`: `PFR` (Kaggle scrape), `NFLV1999` (nflverse, 1999 two-point conversions and fumble-recovery TDs), `RULE2PT` (two_pt = 0 because the NFL had no two-point conversion before 1994; AFL games are left blank).

`fpts_std`/`fpts_ppr` add 2 per two-point conversion and 6 per fumble-recovery TD where known. Every correction and its source is listed in `data/sheets/corrections_log.csv`.

## Gaps in the source data

- **Missing everywhere:** fumbles, two-point conversions, and FG distances. So there's no fumble-lost deduction and no distance bonus for kickers.
- **Sacks** weren't an official stat before 1982, so they're `null` for those seasons. This applies to both a QB's `sacked` count (often 0) and DST `sacks`.
- **Targets** are `null` before 1992.
- **Kicking stats** are almost entirely missing before 1960, so early kickers like Lou Groza have no 1950s kicking numbers.
- The source swaps pass completions/attempts and extra points made/attempted on every row; the build fixes both.
- **DST:** no fumble recoveries or fumble-return TDs, and no tackles before 2000.
- **Season lengths** vary: 12 games through 1960 (14 for the 1960 AFL), 14 from 1961 to 1977, 16 from 1978 on, with 9 games in 1982 and 15 in 1987 (strike seasons). Compare players on per-game numbers.
- Players whose careers ran past 1999 (Rice, Favre, Faulk, etc.) only have their games through 1999.

## Source and rebuilding

The data comes from Pro-Football-Reference via the [zynicide/nfl-football-player-stats](https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats) Kaggle dataset ([scraper](https://github.com/zackthoutt/nfl-player-stats), scraped Dec 2017). Spot checks match the record books: Campbell 1980 (1,934 rush yds), Dickerson 1984 (2,105), Montana 1989, the 1985 Bears (198 pts allowed, 64 sacks, 34 INT).

To add players or defenses, or pools for other positions, edit `scripts/legends.py` and rebuild:

```sh
pip install ijson
curl -L -o stats.zip https://www.kaggle.com/api/v1/datasets/download/zynicide/nfl-football-player-stats
unzip stats.zip -d raw
cd scripts && python build_data.py ../raw/games_*.json ../raw/profiles_*.json ../data
curl -L -o ps1999.csv https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_1999.csv
curl -L -o pbp1999.csv.gz https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.csv.gz
python nflverse_1999.py ps1999.csv pbp1999.csv.gz ../data/enrich/nflverse_1999.json
python build_workbook.py ../data ../data/fantasy_legends.xlsx
python build_workbook.py ../data ../data/running_backs.xlsx RB
python build_workbook.py ../data ../data/wide_receivers.xlsx WR
python build_sheets_csv.py ../data ../data/sheets
```
