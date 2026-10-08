# Fantasy stats bot

Pulls NFL player stats, scores them for fantasy, and writes static JSON your site can `fetch()`.

- **1999 to now:** weekly game logs from [nflverse](https://github.com/nflverse/nflverse-data) (free, CC-BY 4.0).
- **Before 1999:** season totals you enter by hand in `sources/legends_seasons.csv`. No free, open source has older game logs, so legends get season rows only.

Positions covered: QB, RB, FB, WR, TE.

## Run it

```sh
pip install -r fantasy-data/bot/requirements.txt
python fantasy-data/bot/fetch_stats.py              # 1999 through the current season
python fantasy-data/bot/fetch_stats.py --start 2010 # narrower range
python fantasy-data/bot/fetch_stats.py --force      # ignore the download cache
```

Downloads are cached in `fantasy-data/.cache/` (gitignored). Past seasons are downloaded once. The current season is re-downloaded on every run.

The `Fantasy stats bot` GitHub Action (`.github/workflows/fantasy-stats.yml`) runs every Tuesday from September through February. It commits any changed data and redeploys Pages. You can also run it by hand from the Actions tab.

## Output (`fantasy-data/data/`)

| File | Contents |
| --- | --- |
| `players.json` | One object per player: career totals, first/last season, best PPR season, headshot. Sorted by career PPR points. |
| `seasons.json` | One object per player per regular season. `era` is `"nflverse"` or `"legend"`. |
| `weekly/<season>.json` | Every game (regular season and playoffs), stored column-wise to keep the files small. |
| `meta.json` | Build time, seasons covered, and the scoring used. |

Each row carries `fp_standard`, `fp_half_ppr` and `fp_ppr`.

```js
const players = await (await fetch("fantasy-data/data/players.json")).json();

// Weekly files are {columns, rows}; turn them back into objects:
const { columns, rows } = await (await fetch("fantasy-data/data/weekly/2007.json")).json();
const games = rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
const randyMoss = games.filter(g => g.name === "Randy Moss");
```

## Scoring

Edit `bot/scoring.json` and rerun the bot. The defaults are standard ESPN/Yahoo scoring:

- 25 passing yards = 1 point
- passing TD = 4, interception = −2
- 10 rushing/receiving yards = 1 point
- rushing/receiving TD = 6
- 2-point conversion = 2, fumble lost = −2

Points are computed here instead of taken from nflverse, so legends and modern players are scored the same way. They match nflverse's own numbers, except that offensive fumble-recovery TDs count 6 here (nflverse leaves them out).

## Adding legends

Add a row to `sources/legends_seasons.csv` for each pre-1999 season. Leave a stat blank if it's unknown; blanks count as 0. Fumbles lost often weren't tracked in older seasons.

- `player_id`: any unique slug, such as `legend-barry-sanders`.
- `nflverse_id`: optional. Use it for a player whose career continued past 1998 (Jerry Rice, for example), so both eras merge into one player. Find the ID in `players.json`.
- Rows from 1999 or later are ignored, because nflverse already covers those seasons.

The six seed rows are well-known record seasons, entered from memory. **Check them against Pro Football Reference before relying on them.**
