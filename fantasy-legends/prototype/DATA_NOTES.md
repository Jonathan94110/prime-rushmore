# Data notes

`build_data.py` reads the repaired decade CSVs in `../data/sheets/` and writes the files below. Run it with
`python3 build_data.py` from this folder (no packages needed; about 3 s). The output is byte-for-byte
reproducible: two runs give identical files.

**Rebuild whenever the sheets change.** The files here were rebuilt on 8 Oct 2026 from the sheets that also drop
incomplete kicker lines, check interceptions only against a real opposing passing record and drop tied duplicate
rows (same commit as these notes). Earlier builds used dd8ae46 ("Fix verification findings: 1999 play-by-play
classification, zero-only blanking, kicker and INT checks").
The previous build (21:03) predated both that commit and 24536ad ("Fill scoring gaps from final-score
reconciliation; quarantine disputed INTs"). It still showed 187 quarantined interception counts, gave the
1999-10-03 PHI at NYG safety to the Giants, and had about 85,000 strict-eligible games marked unknown.

Inputs: `{qb,rb,wr,te,k,def}_gamelogs_{1960s,1970s,1980s,1990s}.csv` and `{qb,rb,wr,te,k}_season_totals.csv`.
Filter: `playoff == "False"` and seasons 1960–1999.

## Output

| File | Rows | Players | Size | Gzipped |
|---|---|---|---|---|
| `data/games_qb.json` | 18,583 | 174 | 2.38 MB | 0.45 MB |
| `data/games_rb.json` | 31,026 | 314 | 4.11 MB | 0.70 MB |
| `data/games_wr.json` | 36,031 | 335 | 4.73 MB | 0.73 MB |
| `data/games_te.json` | 14,936 | 123 | 1.96 MB | 0.29 MB |
| `data/games_k.json` | 14,150 | 112 | 1.69 MB | 0.27 MB |
| `data/games_def.json` | 15,998 | 31 franchises | 2.43 MB | 0.31 MB |
| `data/players.json` | — | 1,089 | 0.14 MB | 0.02 MB |

Total: 17.4 MB raw, 2.8 MB gzipped. The largest file is 4.7 MB. Every file is compact JSON (no spaces).

Hall of Fame and legend flags in `players.json`: 82 players with `hof: true` and 89 with `legend: true`.
By position (hof / legend): QB 22 / 25, RB 27 / 27, WR 21 / 20, TE 8 / 10, K 4 / 7. DEF franchises are
`false` / `false`, because `def_season_totals.csv` has no such columns.

## Decisions to know about

- **`dataVersion`.** `players.json` carries `"dataVersion"`: the first 12 hex digits of a SHA-256 over the six
  games files and the players list (currently `2622f67a7cea`). A league stores the version it was created with.
  When a save from an earlier build is opened, the page says so. Results already played keep their stored scores,
  and a replay marks any game whose record has changed (see SPEC section 2, Save, load, reveal).
- **Column mapping.** `team_game` is the CSV `week` column. `int_verified` is `int_check == "match"`. In these sheets
  `int_check` is either `match` or `disputed`. `source` is copied as-is, including the repair tags (`RULE2PT`,
  `SCORE0`, `SCORE2`, `NOFGM`, `QUARANTINE`, `NFLV1999`, `SWAP`). Every other column has the same name as in the CSV.
- **Proven zeros.** Many zeros in the sheets are evidence-based, not recorded. `SCORE0` means the team's recorded TDs,
  XPs and FGs add up to its final score, so nothing else scored. `SCORE2` means a 2-point residual in a 1960–93 NFL
  game, which can only be one safety. `RULE2PT` means an NFL game before 1994, which had no two-point conversion.
  `NOFGM` means distance bins of 0 because no field goal was made. These are copied as numbers. Blanks stay `null`.
- **Quarantined interceptions.** Where the defense's interception count disagrees with the opposing passers'
  interceptions thrown, the sheet leaves `def_int` blank (`int_check = disputed`, source tag `QUARANTINE`). Here that
  is `def_int: null, int_verified: false` on 197 rows, and no row has an unverified count.
- **Columns the CSV doesn't have are `null` on every row.** RB, WR and TE files have no `pass_cmp` or `pass_att`, so
  those are `null` throughout (no zeros).
- **DEF `opp_score` comes from `pts_allowed`.** The DEF CSVs have no `opp_score` column. Their `pts_allowed` is the
  opponent's final score (`data/README.md`).
- **Numbers.** Whole values are written as integers. DEF `sacks` keeps its fractions (1.5, 0.5 and so on).
- **Row order.** Each games file is sorted by `pid`, then `date`, then `game_id`, so a player's games are in date
  order. `players.json` lists QB, RB, WR, TE, K, DEF, each sorted by name.
- **`teams`** lists team codes in the order the player first played for them. For DEF it lists the franchise's codes.
- **DEF ids follow the franchise table.** Teams not named in the table use the lowercase code, so Pittsburgh is
  `DEF-pit`, not `DEF-steelers` as in the spec's example. The 31 franchises: `atl buf car cardinals chargers chi chiefs
  cin cle colts dal den det gnb jax jets mia min nor nyg oilers patriots phi pit raiders rams ravens sea sfo tam was`.
- **Same name, two players.** WR-23334 and WR-23335 are both "Gene Washington". The UI shows years and teams.

## What's unknown (`null` counts)

Every null comes from a blank CSV cell, or from a column the position's CSV doesn't have. Columns not listed below
have no nulls.

| File | Column | Nulls | Why |
|---|---|---|---|
| QB | `two_pt` / `fum_rec_td` | 1,009 / 3,182 | AFL and 1994–98 games the final score doesn't settle; fumble-recovery TDs known for 1999 and reconciled games |
| RB | `pass_cmp`, `pass_att` | 31,026 each | no such column in the RB CSV |
| RB | `two_pt` / `fum_rec_td` | 1,431 / 5,234 | as QB |
| WR | `pass_cmp`, `pass_att` | 36,031 each | no such column |
| WR | `two_pt` / `fum_rec_td` | 2,065 / 6,153 | as QB |
| TE | `pass_cmp`, `pass_att` | 14,936 each | no such column |
| TE | `two_pt` / `fum_rec_td` | 707 / 2,469 | as QB |
| K | `fgm_0_39`, `fgm_40_49`, `fgm_50p` | 9,668 each | known for 1999, and for earlier games only when no field goal was made |
| K | `fgm`, `fga`, `fg_missed` / `xpm`, `xpa` | 2 / 4 | five 1999 games quarantined in the sheet (source tag `QUARANTINE`: the two sources disagree) |
| DEF | `sacks` | 7,982 | not an official stat before 1982 |
| DEF | `def_int` | 197 | quarantined: defenders' and passers' counts disagree |
| DEF | `safeties`, `def_int_td`, `def_fum_td` | 2,727 each | known for 1999 and reconciled games |
| DEF | `fum_rec`, `blk_punt`, `blk_fg`, `blk_xp` | 15,504 each | 1999 only (1999-09-12 BAL at STL also blank) |

## Eligible depth per mode

Computed with `src/engine.js` (`eligibleGames`, `poolSummary`) on these files. Players need 16 eligible games
(`MIN_GAMES`).

| Position | Strict: drawable games / players with 16+ | Historical: eligible games / players with 16+ |
|---|---|---|
| QB | 15,400 / 172 (1960–1999) | 18,583 / 173 |
| RB | 25,792 / 312 (1960–1999) | 31,026 / 312 |
| WR | 29,878 / 328 (1960–1999) | 36,031 / 330 |
| TE | 12,467 / 123 (1960–1999) | 14,936 / 123 |
| K | 401 / 17 (1999 only; see below) | 13,944 / 112 |
| DEF | 490 / 27 (1999 only) | 15,998 / 31 (15,731 / 31 with interceptions) |

Both modes support 16 teams. Strict offense now reaches back to 1960 (about 83% of games). Strict DEF stays 1999-only
because fumble recoveries and blocked kicks are known only for 1999.

**Kicker scoring and new columns.** Strict kickers lose 1 point per missed extra point (`xp_missed`; the owner's
current rules) and score their own passing, rushing, receiving and return stats with the offense coefficients, so
games files for K carry `xp_missed` and those offense columns. Strict K eligibility now matches the sheet's
`strict_eligible` flag. DEF files carry `st_other_td` (blocked punt/FG return TDs and the kicking team scoring on the
returner's fumble; 5 games in 1999), which Strict scores at 6 like a return TD. Historical scoring is unchanged.

**Strict kickers.** 3,737 kicker games have every Strict field. Before 1999, though, distance bins are known only
for games with no field goal made (all three bins are a proven 0). Drawing from those would give Strict kickers only
their worst games: those 3,336 games average 1.60 points, against 6.94 for the 401 Strict games from 1999 and 5.39 for
a Historical kicker. The validation report flags this as an owner decision; the rule below is the prototype's
stand-in until the owner decides. The engine therefore leaves a season's kicker games out of Strict draws when that season is
skewed this way. That is the case for every season from 1960 to 1998, so Strict kickers draw 1999 games only.
`db.fgDistanceSkewedSeasons` lists the seasons, and the rule is data-driven, so it lifts by itself if real distance
data for earlier seasons is added. The 1960–98 kicker games still score in Strict (`isEligible`); they are just
never drawn.

## Checks run

An independent check script (`check_data.py`, kept in the session scratchpad and not shipped) re-reads the CSVs
without importing `build_data.py`. All 28 checks passed on these files.

1. **Row counts.** Each games file has exactly the number of regular-season 1960–99 rows in the decade CSVs: QB 18,583,
   RB 31,026, WR 36,031, TE 14,936, K 14,150, DEF 15,998. `(pid, game_id)` is unique in every file.
2. **Every cell.** Each JSON row is matched to its CSV row by `(pid, game_id)`, with the DEF pid recomputed from an
   independently coded copy of the franchise table. Every value is compared: text exactly, numbers by value, blanks
   as `null`, a column the CSV lacks as `null`, `int_verified` as `int_check == "match"`, and DEF `opp_score` as
   `pts_allowed`. There were 0 mismatches across all 130,724 rows, `source` included.
3. **Players ↔ games.** The set of pids in the games files equals the set of ids in `players.json`.
4. **Format.** Re-serializing each games file compactly reproduces it byte for byte. `dataVersion` recomputes from the
   files.
5. **Spot checks.** Joe Montana, 1989-09-10 (`QB-15597`, `19890910-SFO-IND`): `two_pt` 0, `fum_rec_td` 0, source
   `PFR+RULE2PT+SCORE0`. He scores 15.42 in both modes and is strict-eligible. No DEF row has an unverified `def_int`.
6. **Engine on the real data** (`tests/data.integration.test.js`): the quarantined counts (DEF-cardinals
   1967-10-08, DEF-patriots 1960-10-16) are `null`. The 1999-10-03 PHI at NYG safety scores for Philadelphia. Both
   modes report `maxTeams` 16. Strict kickers draw only 1999 games. A full season plays in Historical (8 teams),
   Strict (16 teams) and Historical with interceptions (7 teams).

`build_data.py` was also run twice into separate folders, and the outputs were identical.
