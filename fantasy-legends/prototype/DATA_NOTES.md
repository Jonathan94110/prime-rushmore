# Data notes

`build_data.py` reads the repaired decade CSVs in `../data/sheets/` and writes the files below. Run it with
`python3 build_data.py` from this folder (no packages needed; about 3 s). The output is byte-for-byte
reproducible: two runs give identical SHA-256 sums.

Inputs: `{qb,rb,wr,te,k,def}_gamelogs_{1960s,1970s,1980s,1990s}.csv` and `{qb,rb,wr,te,k}_season_totals.csv`.
Filter: `playoff == "False"` and seasons 1960–1999.

## Output

| File | Rows | Players | Size | Gzipped |
|---|---|---|---|---|
| `data/games_qb.json` | 18,584 | 174 | 2.32 MB | 0.45 MB |
| `data/games_rb.json` | 31,027 | 314 | 4.02 MB | 0.69 MB |
| `data/games_wr.json` | 36,031 | 335 | 4.63 MB | 0.74 MB |
| `data/games_te.json` | 14,936 | 123 | 1.92 MB | 0.29 MB |
| `data/games_k.json` | 14,154 | 112 | 1.52 MB | 0.26 MB |
| `data/games_def.json` | 15,998 | 31 franchises | 2.46 MB | 0.31 MB |
| `data/players.json` | — | 1,089 | 0.14 MB | 0.02 MB |

Total: 17.0 MB raw, 2.8 MB gzipped. The largest file is 4.6 MB. Every file is compact JSON (no spaces).

Hall of Fame and legend flags in `players.json`: 82 players with `hof: true` and 89 with `legend: true`.
By position (hof / legend): QB 22 / 25, RB 27 / 27, WR 21 / 20, TE 8 / 10, K 4 / 7. DEF franchises are
`false` / `false`, because `def_season_totals.csv` has no such columns.

## Decisions to know about

- **Column mapping.** `team_game` is the CSV `week` column. `int_verified` is `int_check == "match"` (`int_check` is
  never blank). `source` is copied as-is. Every other column has the same name as in the CSV.
- **Columns the CSV doesn't have are `null` on every row.** RB, WR and TE files have no `pass_cmp` or `pass_att`, so
  those are `null` throughout (no zeros).
- **DEF `opp_score` comes from `pts_allowed`.** The DEF CSVs have no `opp_score` column. Their `pts_allowed` is the
  opponent's final score (`data/README.md`), and the checks confirm it equals the opponent's own `team_score` in every
  one of the 7,999 games. So DEF rows can show "W 30–24" like the others.
- **Numbers.** Whole values are written as integers. DEF `sacks` keeps its fractions (1.5, 0.5 and so on). One source
  row has 1.3 sacks (1982-11-29, TAM vs MIA); it's copied as-is.
- **Row order.** Each games file is sorted by `pid`, then `date`, then `game_id`, so a player's games are in date
  order. `players.json` lists QB, RB, WR, TE, K, DEF, each sorted by name.
- **`teams`** lists team codes in the order the player first played for them. For DEF it lists the franchise's codes
  (colts: `["BAL","IND"]`; cardinals: `["STL","PHO","ARI"]`).
- **DEF ids follow the franchise table.** Teams not named in the table use the lowercase code, so Pittsburgh is
  `DEF-pit`, not `DEF-steelers` as in the spec's example. The 31 franchises: `atl buf car cardinals chargers chi chiefs
  cin cle colts dal den det gnb jax jets mia min nor nyg oilers patriots phi pit raiders rams ravens sea sfo tam was`.
  Each name is the most recent `team_name` seen (for example, oilers is "Tennessee Titans" and colts is
  "Indianapolis Colts"). Each row's own `team_name` is unchanged ("Baltimore Colts" in 1975).
- **Same name, two players.** WR-23334 and WR-23335 are both "Gene Washington" (MIN/DEN 1967–73 and SFO/DET
  1969–79). The UI may want to show years or teams next to the name.
- Players who only played before 1960 aren't in `players.json`: 4 QBs, 5 RBs and 15 WRs from the season-totals files.

## What's unknown (`null` counts)

Every null comes from a blank CSV cell, or from a column the position's CSV doesn't have. Columns not listed below
have no nulls.

| File | Column | Nulls | Why |
|---|---|---|---|
| QB | `two_pt` | 3,745 | AFL games 1960–69, 1994–98, and the 1999-09-12 BAL at STL game (missing from nflverse) |
| QB | `fum_rec_td` | 18,144 | known for 1999 only (except BAL at STL on 1999-09-12) |
| RB | `pass_cmp`, `pass_att` | 31,027 each | no such column in the RB CSV |
| RB | `two_pt` / `fum_rec_td` | 5,516 / 30,493 | as QB |
| WR | `pass_cmp`, `pass_att` | 36,031 each | no such column |
| WR | `two_pt` / `fum_rec_td` | 7,866 / 35,165 | as QB |
| TE | `pass_cmp`, `pass_att` | 14,936 each | no such column |
| TE | `two_pt` / `fum_rec_td` | 2,682 / 14,650 | as QB |
| K | `fgm_0_39`, `fgm_40_49`, `fgm_50p` | 13,750 each | FG distances known for 1999 only |
| DEF | `sacks` | 7,982 | not an official stat before 1982 (every 1960–81 row) |
| DEF | `fum_rec`, `safeties`, `blk_punt`, `blk_fg`, `blk_xp`, `def_int_td`, `def_fum_td` | 15,504 each | 1999 only (1999-09-12 BAL at STL also blank) |

## Eligible depth per mode

Counted with the `requiredFields` lists in SPEC.md section 2, for players with at least 16 eligible games
(`MIN_GAMES`). This is for planning only; the engine computes the real pool.

| Position | Strict: eligible games / players with 16+ | Historical: eligible games / players with 16+ |
|---|---|---|
| QB | 440 / 10 | 18,584 / 173 |
| RB | 534 / 18 | 31,027 / 312 |
| WR | 866 / 32 | 36,031 / 330 |
| TE | 286 / 10 | 14,936 / 123 |
| K | 404 / 17 | 14,154 / 112 |
| DEF | 491 / 28 | 15,998 / 31 (15,811 / 31 with interceptions) |

Strict mode is 1999 only, because `fum_rec_td`, FG distances and DEF fumble recoveries are known only for 1999.
With 10 QBs and 10 TEs, strict `maxTeams` should come out at 10. Historical supports 16 teams.

## Checks run

An independent check script (`check_data.py`, kept in the session scratchpad and not shipped) re-reads the CSVs
without importing `build_data.py`. All 334 checks passed.

1. **Row counts.** Each games file has exactly the number of regular-season 1960–99 rows in the decade CSVs: QB 18,584,
   RB 31,027, WR 36,031, TE 14,936, K 14,154, DEF 15,998. The four decade headers per position are identical.
2. **Nulls equal blanks.** For every column of every file, the number of `null`s equals the number of blank CSV cells
   (or the row count when the CSV has no such column). `pid` and `int_verified` have no nulls, and DEF `opp_score`
   is checked against `pts_allowed` blanks (0).
3. **Every row, field by field.** Each JSON row is matched to its CSV row by `(pid, game_id)` and every value is
   compared: text exactly, numbers by value, blanks as `null`, and `int_verified` as `int_check == "match"`. There
   were 0 mismatches across all 130,730 rows.
4. **Joe Montana, 1989-09-10 (`19890910-SFO-IND`)** matches the CSV in all 26 fields: SFO at IND, W 30–24, team game
   1, 15/26, 233 yds, 1 TD, 0 INT, 4 rushes for 21 yds, `two_pt` 0, `fum_rec_td` null, source `PFR+RULE2PT`. His
   `players.json` entry equals the spec example exactly (hof, legend, 1979–1994, `["SFO","KAN"]`).
5. **Franchises.** BAL before 1984 → `DEF-colts` (339 rows), BAL 1996–99 → `DEF-ravens` (64), STL 1995–99 → `DEF-rams`
   (80), STL before 1988 → `DEF-cardinals` (402). There are no BAL rows in 1984–95 and no STL rows in 1988–94. Every
   DEF row's pid matches an independently coded copy of the spec table.
6. **Players ↔ games.** Every pid in the games files is in `players.json` and vice versa, with no duplicate ids.
   `first`, `last`, `teams` and DEF names are recomputed from the games. `hof`/`legend` match the season-totals CSVs,
   which are consistent across each player's seasons. Offense and K names match the CSV.
7. **Integrity.** `(pid, game_id)` is unique in every file. Numeric columns hold numbers, text columns hold strings
   and `int_verified` is boolean. Every season is within 1960–1999. `result` agrees with the scores on every row.
8. **Cross-file consistency.** Every DEF game has both teams' rows, with mirrored teams and scores. Every
   QB/RB/WR/TE/K row has a DEF row for the same team and game, with the same season, date, opponent, home/away,
   result, scores and team game.
9. **Source equivalence.** For QB, RB, WR, TE and K, the full `*_gamelogs.csv` files hold exactly the same 1960–99
   regular-season `(player_id, game_id)` rows as the decade files. There is no full DEF file.
10. **Size and format.** Every file is under 4.7 MB, and re-serializing it compactly reproduces it byte for byte.
11. **Browser-style load (Node 22).** The files load with `JSON.parse` and rows map to objects by column name. Every
    row is the full width, there are no unknown pids or duplicate `pid|game_id` keys, the header numbers are numbers,
    and Montana's game reads back correctly.
12. **The checks catch errors.** On a mutated copy of the data, the script failed as expected. The mutations were one
    `null` changed to `0`, one 1975 BAL row relabelled `DEF-ravens`, one kicker removed from `players.json`, and one
    WR's `hof` flipped. They produced 9 failures (null count, field mismatch, franchise mapping, pid sets and flags).
