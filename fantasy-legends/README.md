# Fantasy Legends data (1950–1999)

Game-by-game stats for NFL stars from 1950 to 1999 (QB, RB, WR, TE and K), plus team-defense (DST) game logs for every team from 1950 to 1999.

## Files (`data/`)

| File | What's in it |
| --- | --- |
| `players.json` | The 92 curated players: id, name, fantasy position, Hall of Fame flag, seasons, teams, college, draft info |
| `player_gamelogs.json` / `.csv` | One row per game played (regular season + playoffs) for those players |
| `dst_gamelogs.json` / `.csv` | One row per team per game, 1950–1999 (18k games) |
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

## Gaps in the source data

- **Missing everywhere:** fumbles, two-point conversions, and FG distances. So there's no fumble-lost deduction and no distance bonus for kickers.
- **Sacks** weren't an official stat before 1982, so they're `null` for those seasons. This applies to both a QB's `sacked` count (often 0) and DST `sacks`.
- **Targets** are `null` before 1992.
- **DST:** no fumble recoveries or fumble-return TDs, and no tackles before 2000.
- **Season lengths** vary: 12 games through 1960 (14 for the 1960 AFL), 14 from 1961 to 1977, 16 from 1978 on, with 9 games in 1982 and 15 in 1987 (strike seasons). Compare players on per-game numbers.
- Players whose careers ran past 1999 (Rice, Favre, Faulk, etc.) only have their games through 1999.

## Source and rebuilding

The data comes from Pro-Football-Reference via the [zynicide/nfl-football-player-stats](https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats) Kaggle dataset ([scraper](https://github.com/zackthoutt/nfl-player-stats), scraped Dec 2017). Spot checks match the record books: Campbell 1980 (1,934 rush yds), Dickerson 1984 (2,105), Montana 1989, the 1985 Bears (198 pts allowed, 64 sacks, 34 INT).

To add players or defenses, edit `scripts/legends.py` and rebuild:

```sh
pip install ijson
curl -L -o stats.zip https://www.kaggle.com/api/v1/datasets/download/zynicide/nfl-football-player-stats
unzip stats.zip -d raw
cd scripts && python build_data.py ../raw/games_*.json ../raw/profiles_*.json ../data
```
