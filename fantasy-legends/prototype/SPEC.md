# Fantasy Football of the Past — prototype spec

A playable prototype of the owner's design (deck "Fantasy Football of the Past — Technical handoff", 7 Oct 2026):
draft once, 17 fantasy weeks, one real historical regular-season game drawn per player per week, consumed once,
revealed as VS → fictional Q1–Q4 → FINAL with the real stat line. No averages, no invented stat lines.

Root: `P = /home/user/prime-rushmore/fantasy-legends/prototype`

| File | Owner | Purpose |
|---|---|---|
| `P/build_data.py` | data | Reads the repaired CSVs, writes `P/data/*.json` |
| `P/data/players.json`, `P/data/games_{qb,rb,wr,te,k,def}.json` | data | Compact data the app loads |
| `P/DATA_NOTES.md` | data | Row counts, sizes, checks run |
| `P/src/engine.js` | engine | All game logic. Pure, no DOM, no `Math.random`, no `Date`. UMD: browser global `FFP`, Node `module.exports` |
| `P/tests/engine.test.js` | engine | `node --test P/tests/` — no npm dependencies, inline fixtures |
| `P/src/page.html` | UI | Page template: `<title>`, `<style>`, markup, and two script tags containing the exact placeholders `/*__ENGINE__*/` and `/*__APP__*/` |
| `P/src/app.js` | UI | UI code; uses `window.FFP` only through the API below |
| `P/build.py` | UI | Writes `P/dist/index.html` (template with engine.js and app.js inlined) and copies `P/data/*.json` to `P/dist/data/` |
| `P/tests/smoke.mjs` | UI | Playwright smoke test of `P/dist` (see Testing) |

## 1. Data

Source: `/home/user/prime-rushmore/fantasy-legends/data/sheets/{qb,rb,wr,te,k,def}_gamelogs_{1960s,1970s,1980s,1990s}.csv`.
Use the decade files only (the full `*_gamelogs.csv` files repeat the same rows). Keep regular season only
(`playoff == "False"`), seasons 1960–1999. A blank CSV cell means **unknown** and becomes JSON `null`. Never turn
an unknown into 0. Numbers stay numbers. `source` columns are copied as-is.

### `players.json`
```json
{ "version": 1, "dataVersion": "2622f67a7cea", "seasons": [1960, 1999],
  "players": [
    {"id": "QB-15597", "name": "Joe Montana", "pos": "QB", "hof": true, "legend": true, "first": 1979, "last": 1994, "teams": ["SFO", "KAN"]},
    {"id": "DEF-steelers", "name": "Pittsburgh Steelers", "pos": "DEF", "hof": false, "legend": false, "first": 1960, "last": 1999, "teams": ["PIT"]}
  ] }
```
Player id = `{POS}-{player_id}`. `first`/`last`/`teams` describe the player's 1960–99 regular-season games in the file.
`hof`/`legend` come from the `*_season_totals.csv` files (`True`/`False`). Every player in a games file appears in
`players.json` and vice versa. `dataVersion` is the first 12 hex digits of a SHA-256 over the six games files and the
players list, so a save can tell when the data was rebuilt after it was played. Rebuild whenever the sheets change.

DEF players are **franchises**. Franchise key from team code and season:

| key | codes | name (use the most recent `team_name` seen) |
|---|---|---|
| colts | BAL ≤ 1983, IND | |
| ravens | BAL ≥ 1996 | |
| cardinals | STL ≤ 1987, PHO, ARI | |
| rams | RAM, STL ≥ 1995 | |
| raiders | OAK, RAI | |
| oilers | HOU, TEN | |
| patriots | BOS, NWE | |
| jets | NYT, NYJ | |
| chiefs | DTX, KAN | |
| chargers | LAC, SDG | |
| anything else | lowercase team code (`pit`, `chi`, …) | |

### `games_{pos}.json`
`{"columns": [...], "rows": [[...], ...]}`, compact JSON (no spaces). Columns, in this order:

Common: `pid, game_id, season, date, team, opp, home_away, result, team_score, opp_score, team_game, source`
(`team_game` is the CSV `week` column: the team's game number that season, **not** the NFL week.)

- QB/RB/WR/TE add: `pass_cmp, pass_att, pass_yds, pass_td, pass_int, rush_att, rush_yds, rush_td, rec, rec_yds, rec_td, ret_td, two_pt, fum_rec_td` (null where the position's CSV has no such column)
- K adds: `fgm, fga, fg_missed, fgm_0_39, fgm_40_49, fgm_50p, xpm, xpa`
- DEF adds: `team_name, pts_allowed, sacks, def_int, int_verified, fum_rec, safeties, blk_punt, blk_fg, blk_xp, def_int_td, def_fum_td, ret_td` (`int_verified` = `int_check == "match"`, boolean)

## 2. Engine API (`P/src/engine.js`)

All state is plain JSON (serializable). Functions that change the league **mutate it in place and return it**.
All randomness comes from a seeded PRNG (mulberry32 or similar) whose stream is derived from `league.seed` plus a
label (e.g. `"bye"`, `"draw|<week>|<pid>"`), so results are reproducible. Points are summed in integer hundredths
and reported rounded to 2 decimals.

### Constants
- `FFP.ENGINE_VERSION = "proto-1"`, `FFP.SAVE_VERSION = 1`, `FFP.TOTAL_WEEKS = 17`, `FFP.MIN_GAMES = 16` (17 weeks minus one bye)
- `FFP.SLOTS = ["QB","RB","WR","TE","FLEX","DEF","K"]`, `FFP.BENCH = 4`, `FFP.ROSTER_SIZE = 11`. FLEX takes RB, WR or TE.
- `FFP.DEFAULT_RULES`:
```js
{ offense: {pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6,
            ret_td: 6, two_pt: 2, fum_rec_td: 6, fumble_lost: 0},
  kicker: {xp: 1, fg_0_39: 3, fg_40_49: 4, fg_50p: 5, fg_flat: 3, fg_miss: -1},
  defense: {sack: 1, int: 2, fum_rec: 2, safety: 2, block: 2, def_td: 6, ret_td: 6,
            pa_tiers: [[0, 10], [6, 7], [13, 4], [20, 1], [27, 0], [34, -1], [999, -4]]} }
```
Offense coefficients are placeholders: the deck says the real ones come from the live site's code. Keep them in this
one object so they can be replaced.

### Modes
`mode` is `"strict"` or `"historical"`. `settings.historical = {includeInterceptions: false}` (owner's current
proposal; the toggle exists because adding interceptions is under discussion).

`FFP.requiredFields(pos, mode, settings)` — fields that must be non-null for a game to be eligible:
- strict QB/RB/WR/TE: `pass_yds, pass_td, pass_int, rush_yds, rush_td, rec, rec_yds, rec_td, ret_td, two_pt, fum_rec_td`
- historical QB/RB/WR/TE: `pass_yds, pass_td, pass_int, rush_yds, rush_td, rec, rec_yds, rec_td, ret_td`
- strict K: `xpm, fgm_0_39, fgm_40_49, fgm_50p, fg_missed`
- historical K: `fgm, xpm, fg_missed`
- strict DEF: `pts_allowed, sacks, def_int, fum_rec, safeties, blk_punt, blk_fg, blk_xp, def_int_td, def_fum_td, ret_td`, and `int_verified === true`
- historical DEF: `pts_allowed, ret_td`; plus `def_int` with `int_verified === true` when `includeInterceptions`

`FFP.isEligible(game, pos, mode, settings)` — true when every required field is non-null (and the DEF interception
condition holds) and the season is 1960–1999.

`FFP.scoreGame(game, pos, mode, settings, rules)` → `{total, parts: [{label, stat, value, points}]}`. Throws if the
game isn't eligible. Uses only the mode's fields:
- offense (both modes): yards × per-yard rates, TDs, interceptions, receptions; strict also two_pt and fum_rec_td.
- strict K: `xp·xpm + fg_0_39·fgm_0_39 + fg_40_49·fgm_40_49 + fg_50p·fgm_50p + fg_miss·fg_missed`
- historical K: `fg_flat·fgm + xp·xpm + fg_miss·fg_missed`
- strict DEF: `sack·sacks + 2·(def_int + fum_rec + safeties + blk_punt + blk_fg + blk_xp) + 6·(def_int_td + def_fum_td + ret_td) + tier(pts_allowed)`
- historical DEF: `tier(pts_allowed) + 6·ret_td` (+ `2·def_int` when `includeInterceptions`)
- `tier(pa)`: points of the first `[max, pts]` with `pa <= max`.

### Data and pools
- `FFP.loadData({players, games: {QB, RB, WR, TE, K, DEF}})` → `db` with `db.players` (array), `db.playersById`,
  `db.gamesByPid[pid]` (array of game objects keyed by column name; each also gets `key = pid + "|" + game_id`).
- `FFP.eligibleGames(db, pid, mode, settings)` → eligible games for that player: the games he can draw. One
  exception to `isEligible`: in Strict, a kicker's games from a season whose distance splits are known mostly for
  games with no field goal made are left out (they would hand Strict kickers their worst games). A season is skewed
  when, among kickers with any known split that season, made-field-goal games have a known split at a rate more than
  10 points below no-field-goal games. `loadData` lists them in `db.fgDistanceSkewedSeasons` (1960–1998 in the
  current sheets). `loadData` also sets `db.dataVersion` from `players.json` (or `null`).
- `FFP.draftPool(db, mode, settings, rules)` → players with at least `MIN_GAMES` eligible games, each
  `{id, name, pos, hof, legend, first, last, eligibleCount, avgPoints}`, sorted by `avgPoints` descending. `avgPoints`
  ranks players for the draft and AI decisions only; it is never anyone's score.
- `FFP.poolSummary(db, mode, settings, rules)` → `{counts: {QB, RB, WR, TE, K, DEF}, maxTeams}`. `maxTeams` is the
  largest N ≤ 16 for which a full draft is possible: QB ≥ N, TE ≥ N, K ≥ N, DEF ≥ N, RB + WR + TE ≥ 3N (RB, WR, TE
  and FLEX starters), and total ≥ 11N.

### League
`FFP.createLeague({name, teamName, numTeams, playoffTeams, mode, historical, draftOrder, userPick, seed, rules}, db)`
- `numTeams` 2–16, clamped to `poolSummary(...).maxTeams`. `playoffTeams` 4 or 6; 6 needs ≥ 6 teams, 4 needs ≥ 4
  teams, otherwise 2 (a championship only). Playoff rounds: 6 → 3 (weeks 15–17), 4 → 2 (weeks 16–17),
  2 → 1 (week 17). Regular-season weeks = 17 − rounds.
- `draftOrder`: `"random"` (seeded shuffle) or `"custom"` (user picks slot `userPick`, 1-based; AI teams fill the
  rest in seeded order). Snake draft, 11 rounds.
- Teams: `{id: "t0".., name, isUser}`. AI names, in order: Leather Helmets, Single Wing, Flying Wedge, Wishbone,
  Run-and-Shoot, Wing-T, Shotgun, Ice Bowl, Statue of Liberty, Hook and Ladder, Flea Flicker, Fumblerooski,
  Hail Mary, Coffin Corner, Sudden Death.
- `league.stage`: `"draft" → "season" → "complete"`.

### Draft
- `FFP.currentPick(league)` → `{overall, round, pickInRound, teamId}` or `null` when done.
- `FFP.canPick(league, db, teamId, pid)` → `{ok, reason}`. Rejects players already rostered, outside the pool, or a
  pick that would leave the team unable to fill QB, RB, WR, TE, FLEX, DEF and K with its remaining picks.
- `FFP.makePick(league, db, pid)` — the team on the clock takes `pid` (throws if `canPick` fails).
- `FFP.aiPick(league, db, teamId)` → pid: best available `avgPoints`, filling required starters when remaining picks
  equal remaining required slots; deterministic tie-breaks. Caps, tried in order until one leaves a legal pick: at
  most 2 at every position (so the bench covers byes at all but one position); at most 2 each of QB, TE, K, DEF;
  anything legal (only when the pool forces it, e.g. a small Strict pool).
- `FFP.runAIPicks(league, db)` — AI teams pick until the user is on the clock or the draft ends.
- After the last pick the engine calls `startSeason` automatically.

### Season
- `FFP.startSeason(league, db)` — builds the schedule, assigns byes, sets every team's lineup with `autoLineup`,
  `stage = "season"`, `week = 1`.
- Schedule: circle-method round robin (a dummy "idle" slot when the team count is odd), repeated in order to fill
  the regular-season weeks. `league.schedule[week]` = array of `{home, away}` (team ids). With an odd count the idle
  slot is the fixed point and the user's team takes the last idle week of each cycle (the computer teams' order is
  a seeded shuffle), so the user is never idle in week 1 and never plays fewer games than any other team.
- Byes: every rostered player gets exactly one bye week, drawn uniformly from weeks 2..regularWeeks, stored in
  `league.byes[pid]` and never reassigned. A player picked up later gets a bye drawn from the remaining regular
  weeks after the current one if any remain; otherwise none.
- Lineups: `league.lineups[teamId] = {QB, RB, WR, TE, FLEX, DEF, K, bench: [4 pids]}`.
  `FFP.setLineup(league, db, teamId, lineup)` validates positions and that it uses exactly the roster.
  `FFP.autoLineup(league, db, teamId, week)` — best `avgPoints` starters, preferring players not on bye that week.
- `FFP.playWeek(league, db)` — plays `league.week`. Every rostered player of every team with a matchup that week
  (starters and bench) who is not on bye draws **one** game uniformly at random from their eligible games not yet in
  `league.consumed[pid]`, and that game is consumed. Players on bye score 0 and consume nothing. A team's score is
  the sum of its starters only. Stores `league.results[week] = {matchups: [{home, away, homeScore, awayScore, winner,
  lines: {[teamId]: [{slot, pid, gameKey, points, bye}]}}]}`. Never redraws a played week. AI lineups are set with
  `autoLineup` before the draw; the user's lineup is used as saved. Then advances `league.week`, seeds the playoffs
  after the regular season, and sets `stage = "complete"` with `league.champion` after week 17.
- Standings `FFP.standings(league)` → `[{teamId, w, l, t, pf, pa}]` ranked by wins + ½·ties, then points for, then
  team order.
- Playoffs (fixed bracket): 6 teams — week 15: 3 v 6, 4 v 5 (seeds 1–2 rest); week 16: 1 v winner(4/5), 2 v winner(3/6);
  week 17 final. 4 teams — week 16: 1 v 4, 2 v 3; week 17 final. 2 teams — week 17: 1 v 2. A tied playoff game goes to
  the higher seed. Eliminated and resting teams have no matchup and draw nothing.
- Free agents: `FFP.freeAgents(league, db)` = draft pool minus rostered players.
  `FFP.addDrop(league, db, teamId, addPid, dropPid)` between weeks only; roster stays at 11 and must still fill every
  starting slot. Consumed games stay with the player.
- No trades in the prototype.

### Save, load, reveal
- `FFP.serialize(league)` → JSON string `{saveVersion, engineVersion, league}`; `FFP.deserialize(text)` → league,
  throwing a clear error on an unknown version or a structurally broken league (a missing schedule, lineup, roster,
  results week and so on). A round trip preserves draws, consumed games and results exactly. `createLeague` stores
  `league.dataVersion = db.dataVersion`; saves without it still load.
- `FFP.revealTimeline(league, db, week, matchupIndex)` →
  `{vs: {home: {teamId, starters: [{slot, pid, name, pos, season}]}, away: {...}},`
  `highlights: [{quarter, teamId, slot, pid, points}],`
  `final: {homeScore, awayScore, winner, lines: {[teamId]: [{slot, pid, name, pos, bye, points, parts, game}]}, bench: {...same shape}}}`.
  Each starter who played gets one highlight in a fictional quarter chosen with a seeded draw; highlights within a
  quarter are ordered by a seeded draw. Per team, the highlights add up exactly to the final score. `game` is the full
  game object (date, team, opp, home_away, team_game, result, scores, stats). VS shows only the season year.
  A stored result is never rescored. Each final/bench line also has `dataChanged`. When the loaded data no longer
  reproduces the stored points (the game is gone, no longer scoreable, or scores differently), `dataChanged` is true,
  `parts` is `[]` and `currentPoints` is the revised score (or `null`). `points` is always the stored value.

## 3. UI (`P/src/page.html`, `P/src/app.js`)

Screens: **Setup** → **Draft** → **League hub** (tabs: This week, My team, Schedule, Standings, Free agents,
Results, Rules & data) → **Game center** (reveal).

- Setup: league name, team name, number of teams (2–16; shows the mode's max and why), playoff teams, mode
  (Strict / Historical) with a plain explanation and live pool counts per position, the Historical interceptions
  toggle labelled as a proposal under discussion, draft order (random / choose your pick), seed. A **Quick start**
  button creates an 8-team Historical league and autodrafts the user's team, so the first view can show a working
  league.
- Draft: who's on the clock, the user's roster and remaining needs, a searchable, position-filtered table of
  available players (name, position, years, Hall of Fame badge, eligible games, average points), Draft and
  Auto-pick buttons, and a pick log. AI picks run quickly.
- League hub: current week, the user's matchup, lineup editing (choose a starter per slot from the roster; show byes
  for the week), "Play week N" which goes to the game center, other matchups' results, standings (all teams, the
  user's team highlighted), full schedule with results, playoff bracket, free agents (add/drop), results history
  with replay.
- Game center: VS (season year only), then fictional highlights Q1–Q4 with running scores, speed control
  (0.25×–4×), pause/resume, next highlight, skip to final; then FINAL with each starter's real game ("1989 · team game
  1 · Sep 10, 1989 · SFO at IND · W 30–24"), the stat line and the point breakdown; bench results after the final,
  outside the team total. State on screen that quarters and highlights are fictional and not real play-by-play.
  Replaying an old week uses the stored result.
- Rules & data: the active mode's scoring rules; data sources and caveats (Pro-Football-Reference via a Kaggle
  scrape; nflverse for 1999; unknown fields are never filled; this is a prototype and data reuse rights are not
  settled); offense coefficients are placeholders.
- Persistence: autosave after every action to `localStorage["ffp-proto-save-v1"]` inside try/catch (the page must
  work without storage). Export save (JSON in a read-only textarea plus a Copy button using
  `navigator.clipboard.writeText` with a select-text fallback); Import save (paste into a textarea). "New league"
  asks for confirmation inside the page.
- Data loading: `fetch("data/players.json")` and the six games files with a visible progress state and a clear
  error message if loading fails.

### Artifact page rules (the page is published as a claude.ai artifact)
- `page.html` has no `<!doctype>`, `<html>`, `<head>` or `<body>` tags; it starts with `<title>Fantasy Football of the Past</title>` and a `<style>`.
- External resources: only Google Fonts stylesheets (fonts.googleapis.com / fonts.gstatic.com) with real fallback
  stacks. No other external scripts, images or requests; everything else is inline or in `data/`.
- No `alert`, `confirm`, `prompt`, `window.print`, `window.open`, download links. Forms handle `submit` with
  `preventDefault()`. Every form control has a stable `id`.
- Theme: every color is a token on bare `:root` (light values); redefine for dark under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...; color-scheme: dark} }` and again under
  `:root[data-theme="dark"]`. `body` has an explicit token background. Components only use tokens.
- Layout: works at 400px wide with no horizontal page scroll; ≥16px side gutter set once (`padding-inline`);
  wide tables scroll inside their own `overflow-x: auto` wrapper; flex/grid children holding text get `min-width: 0`;
  `font-variant-numeric: tabular-nums` for numbers; visible keyboard focus; respect `prefers-reduced-motion`.
- Look: a mid-century game program and an old stadium scoreboard. Light theme: printed program stock (a cool,
  slightly blue-grey paper, not warm cream), deep navy ink, pennant red and turf green accents. The scoreboard panel
  (scores, quarter, clock-style labels) is the one bold element in both themes: a dark board with warm bulb-amber
  digits. Dark theme: night game. Avoid the live site's dark green-and-gold, and avoid Inter / Space Grotesk, emoji
  icons, purple gradients and `rounded-lg`-everything. Pick a characterful display face (e.g. a varsity or slab face),
  a readable body face and a tabular mono/utility face from Google Fonts.
- Copy: plain, specific, active voice; name things the way players would (Draft, Lineup, Play week 5).

## 4. Testing
- `node --test /home/user/prime-rushmore/fantasy-legends/prototype/tests/` must pass. Engine tests cover: both modes'
  eligibility and scoring (including a hand-computed example per position and the PA tiers), null-never-zero,
  pool thresholds and `maxTeams`, draft legality and AI picks, schedule (even and odd team counts), byes (one per
  player, never week 1 or playoffs), draws (one consumed game per result, no game drawn twice for a player, bye
  consumes nothing), standings tie-breaks, playoff brackets for 2, 4 and 6, free-agent add/drop, save/load round
  trip, and reveal highlights summing to the final.
- `P/tests/smoke.mjs`: serve `P/dist` with `python3 -m http.server`, open it in Playwright (global install; browsers
  at `/opt/pw-browsers`), Quick start, play two weeks through the game center (skip to final), check the final score
  equals the stored result, reload and check the save is restored, check there are no console errors or failed
  requests, check no horizontal scroll at 400px, and save light and dark screenshots to `P/tests/screens/`.
