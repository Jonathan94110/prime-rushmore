# Decade Top 100 bot

Ranks the top 100 **QBs, RBs, WRs, kickers and team defenses (D/ST)** of every NFL decade by fantasy points, and writes static JSON your site can `fetch()`. `index.html` in this folder is a page for browsing the lists.

- **1999 to now:** weekly stats from [nflverse](https://github.com/nflverse/nflverse-data) (free, CC-BY 4.0), covering players, kickers, team defense and schedules.
- **Before 1999:** loaded by `bot/legacy.py`. The sources for this are still being chosen and checked, and until then the lists start at 1999.

## How ranking works

- **Players** are ranked on regular-season fantasy points scored *inside the decade*. A career that spans two decades is ranked in both. FBs count as RBs.
- **Team defenses** are ranked as team-seasons (for example the 2000 Ravens). A decade has only about 30 franchises, so 100 franchise-decades isn't possible.
- Lists are shorter than 100 when fewer players exist. A decade typically has only about 90 kickers who kicked at all.

## Run it

```sh
pip install -r fantasy-data/bot/requirements.txt
python fantasy-data/bot/fetch_stats.py            # every decade, top 100
python fantasy-data/bot/fetch_stats.py --top 50   # shorter lists
python fantasy-data/bot/fetch_stats.py --force    # re-download everything
```

Downloads are cached in `fantasy-data/.cache/` (gitignored). The `Fantasy stats bot` GitHub Action (`.github/workflows/fantasy-stats.yml`) reruns this every Tuesday from September through February. It commits changes and redeploys Pages. You can also run it from the Actions tab.

## Output (`fantasy-data/data/top100/`)

| File | Contents |
| --- | --- |
| `index.json` | Decades, list sizes, scoring, coverage notes |
| `<decade>.json` (e.g. `1980s.json`) | `positions.QB / RB / WR / K / DEF`: ranked lists. Players include decade totals, all three scoring formats, best season and `season_lines` |
| `games/<decade>.json` | Game logs (regular season and playoffs) for the ranked players and defenses, stored column-wise as `{columns, rows}` |

```js
const { positions } = await (await fetch("fantasy-data/data/top100/2000s.json")).json();
positions.RB[0].name; // "LaDainian Tomlinson"

const logs = await (await fetch("fantasy-data/data/top100/games/2000s.json")).json();
const { columns, rows } = logs.RB;
const games = rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
```

## Scoring (`bot/scoring.json`)

Edit the file and rerun the bot to rescore and re-rank everything. `rank_by` picks the offensive format used for ranking: `ppr`, `half_ppr` or `standard`.

| Position | Default scoring |
| --- | --- |
| Offense | 25 passing yards = 1 point. Passing TD = 4. Interception = −2. 10 rushing/receiving yards = 1 point. Rushing/receiving TD = 6. Fumble lost = −2. 2-point conversion = 2 |
| Kickers | Field goal: 3 points under 40 yards, 4 for 40–49, 5 for 50+. Missed FG = −1. Extra point = 1. Missed extra point = −1 |
| D/ST | Sack = 1. Interception = 2. Fumble recovery = 2. Defensive or return TD = 6. Safety = 2. Blocked kick = 2. Points allowed per game: 0 = +10, 1–6 = +7, 7–13 = +4, 14–20 = +1, 21–27 = 0, 28–34 = −1, 35+ = −4 |
