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

## Repaired scoring fields (`data/sheets/`)

Unknown values are left blank, never zero-filled, and a 0 is kept only with evidence. Every game row has `complete`, `missing_fields` (which fields are unknown) and `source`. Source codes:

| Code | Meaning |
| --- | --- |
| `PFR` | Pro-Football-Reference, via the Kaggle scrape |
| `NFLV1999` | nflverse play-by-play / player stats (1999), used only where the play-by-play accounts for the team's whole final score |
| `RULE2PT` | two_pt = 0: the NFL had no two-point conversion before 1994 |
| `SCORE0` | the team's recorded TDs, XPs, FGs and safeties add up to its final score, so no unrecorded scoring play happened (proves makes, not misses) |
| `SCORE2` | they add up to 2 less, in an NFL game 1960–93 with a recorded PAT try for every TD: the 2 is a safety |
| `NOFGM` | no field goal made, so 0 in every distance tier |
| `UNRECORDED` | the source shows 0 for a field it doesn't record in that era; blanked (nonzero values are kept) |
| `INCOMPLETE` | the source's own totals show the field is incomplete for that game; blanked |
| `QUARANTINE` | sources disagree, or the value can't be checked; blanked, originals kept in the log |
| `SWAP` / `DEDUPE` | fields swapped back / duplicate or wrong-roster row dropped |

- **QB, RB, WR, TE:** `two_pt` and `fum_rec_td` (offensive fumble-recovery TD). 1999 values come from nflverse, matched to each player by nflverse ID (linked by birth date and name, since names differ: "Raghib Ismail" is Rocket Ismail). Fantasy points add 2 per two-point conversion and 6 per fumble-recovery TD where known.
- **K:** `fg_missed` (attempts − makes, blocks included), `xp_missed` (blank unless every TD, recorded or implied by the final score, has a recorded PAT try), `fgm_0_39` / `fgm_40_49` / `fgm_50p` (1999 only, or 0 when no FG was made). Where the team's final score shows a kick missing from the source (an odd gap, or a 6-point gap with no PAT try to match it, which could be two field goals), the whole kicking line is blank (`INCOMPLETE`, originals in the log). Before 1960 a recorded make stands, a 0 make needs SCORE0, and attempts and misses stay blank. In 1999 every kicker's makes and attempts are checked against nflverse; five kicker-games where nflverse credits some kicks to another kicker (Toby Gowin, David Akers) are quarantined.
- **DEF:** `def_int` is kept only where the defenders' interceptions equal the opposing passers' interceptions thrown; otherwise it's blank (`int_check` = disputed, or unverified when the source has fewer than 10 pass attempts for the opponent), with `def_int_defenders`, `opp_pass_int` and `opp_pass_att` kept. `fum_rec` (opponent fumbles recovered on any play, kick returns included; a lost fumble nobody recovered, out of the end zone, is quarantined), `blk_punt`/`blk_fg`/`blk_xp` and `def_fum_td` are 1999 only. Defensive TDs (`def_td` = `def_int_td` + `def_fum_td`), kick and punt return TDs (`ret_td`) and other special-teams TDs (`st_other_td`: blocked punt/FG returns, the kicking team scoring on the returner's fumble) are separate columns. `pts_allowed` is the opponent's final score.
- **Duplicates:** the source sometimes lists a player for two teams in one week (same date, or the same game number a day or two apart) or, with no stats, for a team he never played for. The row with stats is kept (punts count), else the team of his games either side, else the team he played for most that season; when nothing decides and no row has stats, every row is dropped. Each drop is logged with any stats it carried.
- Regular season and playoffs: `playoff` flags postseason games; season totals are regular season only.

Every decision is logged with its old value, new value, source URL and evidence: rules and dropped rows in `data/sheets/corrections_log.csv`, one row per changed or evidence-checked field in `corrections_log_{qb,rb,wr,te,k,def}.csv`. `conflicts.csv` lists source disagreements, and `unresolved_players.csv` / `unresolved_defense.csv` list every regular-season game still missing a scoring field. `verified_replacements_{pos}.csv` has the evidence fills in the research workbook's merge format.

Also on every game row: `game_id` (`YYYYMMDD-AWAY-HOME`, shared by both teams' rows and every player in the game); `scoring_complete` / `scoring_missing`, which check every field that earns points for the position under the deck v4 contract (targets and times sacked don't score); and two eligibility options kept side by side for the owner's decision: `strict_eligible` (every scoring field known) and `era_scored_eligible` (unknowns limited to fields the source records for no game in that era, listed in `era_excluded_fields`; anything else is in `era_blocking_fields`). Both options check every scoring field for the position. QB rows include `rec`, `rec_yds`, `rec_td` and `ret_td`. Kicker rows add `fpts_k_contract` (XP +1, missed XP −1, FG <40 +3, 40–49 +4, 50+ +5, missed FG −1), blank unless every input is known.

See `VALIDATION_REPORT.md` for the source manifest, completeness by era, eligible depth and unresolved fields.

## Gaps in the source data

- **Missing everywhere in the base files:** fumbles, two-point conversions, and FG distances (`data/sheets/` fills them for 1999 and where the final score proves them).
- **Sacks** weren't an official stat before 1982, so DST `sacks` are `null` for those seasons (the source's partial counts are in `sacks_recorded`). A QB's `sacked` count is blank there when it's 0; recorded nonzero values are kept.
- **Targets** are blank before 1992 except nonzero values from Super Bowl box scores.
- **Kicking stats** are almost entirely missing before 1960, so early kickers like Lou Groza have no 1950s kicking numbers.
- The source swaps pass completions/attempts and extra points made/attempted on every row; the build fixes both.
- **DST:** no fumble recoveries, blocked kicks, or interception/fumble-return TDs before 1999, and safeties only rarely (the source shows 0 for safeties and INT-return TDs without recording them; in `data/sheets/` those zeros are blank unless the final score proves them), and no tackles before 2000.
- **Return TDs** aren't recorded before 1960; they're blank for the 1950s in `data/sheets/`.
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
curl -L -o players.csv https://github.com/nflverse/nflverse-data/releases/download/players/players.csv
python nflverse_1999.py ps1999.csv pbp1999.csv.gz players.csv ../data/enrich/nflverse_1999.json
python build_workbook.py ../data ../data/fantasy_legends.xlsx
python build_workbook.py ../data ../data/running_backs.xlsx RB
python build_workbook.py ../data ../data/wide_receivers.xlsx WR
python build_sheets_csv.py ../data ../data/sheets
python audit_report.py ../data/sheets ../VALIDATION_REPORT.md
```
