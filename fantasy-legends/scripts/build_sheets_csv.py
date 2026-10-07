"""Write small per-position CSVs for Google Sheets (loaded with =IMPORTDATA from GitHub).

Usage: python build_sheets_csv.py ../data ../data/sheets

For each position (QB, RB, WR, TE, K), writes:
  <pos>_gamelogs.csv       one row per game, only the columns that position uses
  <pos>_gamelogs_<decade>s.csv  the same, split by decade (small enough for IMPORTDATA)
  <pos>_season_totals.csv  one row per player per season (regular season only)
and for team defenses: def_season_totals.csv and def_gamelogs_<decade>s.csv.
"""

import csv
import json
import os
import sys
from collections import defaultdict

from build_data import AFL_TEAMS

COLUMNS = {
    "QB": ["pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "pass_rating", "sacked",
           "rush_att", "rush_yds", "rush_td"],
    "RB": ["rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds", "rec_td", "ret_td"],
    "WR": ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td",
           "pass_yds", "pass_td", "pass_int", "two_pt", "fum_rec_td", "ret_td"],
    "TE": ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td",
           "pass_yds", "pass_td", "pass_int", "two_pt", "fum_rec_td", "ret_td"],
    "K": ["fgm", "fga", "xpm", "xpa"],
}

# Pro-Football-Reference codes follow the city, so some codes cover two franchises.
TEAM_NAMES = [
    ("ARI", 1994, 1999, "Arizona Cardinals"), ("ATL", 1966, 1999, "Atlanta Falcons"),
    ("BAL", 1950, 1983, "Baltimore Colts"), ("BAL", 1996, 1999, "Baltimore Ravens"),
    ("BOS", 1960, 1970, "Boston Patriots"), ("BUF", 1960, 1999, "Buffalo Bills"),
    ("CAR", 1995, 1999, "Carolina Panthers"), ("CHI", 1950, 1999, "Chicago Bears"),
    ("CIN", 1968, 1999, "Cincinnati Bengals"), ("CLE", 1950, 1999, "Cleveland Browns"),
    ("CRD", 1950, 1959, "Chicago Cardinals"), ("DAL", 1960, 1999, "Dallas Cowboys"),
    ("DEN", 1960, 1999, "Denver Broncos"), ("DET", 1950, 1999, "Detroit Lions"),
    ("DTX", 1952, 1962, "Dallas Texans"), ("GNB", 1950, 1999, "Green Bay Packers"),
    ("HOU", 1960, 1996, "Houston Oilers"), ("IND", 1984, 1999, "Indianapolis Colts"),
    ("JAX", 1995, 1999, "Jacksonville Jaguars"), ("KAN", 1963, 1999, "Kansas City Chiefs"),
    ("LAC", 1960, 1960, "Los Angeles Chargers"), ("MIA", 1966, 1999, "Miami Dolphins"),
    ("MIN", 1961, 1999, "Minnesota Vikings"), ("NOR", 1967, 1999, "New Orleans Saints"),
    ("NWE", 1971, 1999, "New England Patriots"), ("NYG", 1950, 1999, "New York Giants"),
    ("NYJ", 1963, 1999, "New York Jets"), ("NYT", 1960, 1962, "New York Titans"),
    ("NYY", 1950, 1951, "New York Yanks"), ("OAK", 1960, 1999, "Oakland Raiders"),
    ("PHI", 1950, 1999, "Philadelphia Eagles"), ("PHO", 1988, 1993, "Phoenix Cardinals"),
    ("PIT", 1950, 1999, "Pittsburgh Steelers"), ("RAI", 1982, 1994, "Los Angeles Raiders"),
    ("RAM", 1950, 1994, "Los Angeles Rams"), ("SDG", 1961, 1999, "San Diego Chargers"),
    ("SEA", 1976, 1999, "Seattle Seahawks"), ("SFO", 1950, 1999, "San Francisco 49ers"),
    ("STL", 1960, 1987, "St. Louis Cardinals"), ("STL", 1995, 1999, "St. Louis Rams"),
    ("TAM", 1976, 1999, "Tampa Bay Buccaneers"), ("TEN", 1997, 1998, "Tennessee Oilers"),
    ("TEN", 1999, 1999, "Tennessee Titans"), ("WAS", 1950, 1999, "Washington Redskins"),
]


# Positions whose game logs carry the repaired scoring fields (two_pt, fum_rec_td, missing_fields, source).
REPAIRED = {"WR", "TE"}

# Source codes used in the `source` column.
#   PFR       Pro-Football-Reference, via the Kaggle scrape (zynicide/nfl-football-player-stats, Dec 2017)
#   NFLV1999  nflverse-data player_stats_1999 / play_by_play_1999 (two_pt, fum_rec_td)
#   RULE2PT   two_pt = 0 because the NFL had no two-point conversion before 1994
def repair_scoring(g, enrich):
    """Fill two_pt and fum_rec_td only where they're known, and recompute fantasy points."""
    season, team, opp, date = g["season"], g["team"], g["opp"], g["date"]
    source = ["PFR"]
    g["two_pt"] = g["fum_rec_td"] = None
    afl_game = season <= 1969 and (team in AFL_TEAMS or opp in AFL_TEAMS)
    if season == 1999 and f"{date}|{team}" in enrich["team_games"]:
        found = enrich["players"].get(f"{g['name']}|{date}", {})
        g["two_pt"] = found.get("two_pt", 0)
        g["fum_rec_td"] = found.get("fum_rec_td", 0)
        source.append("NFLV1999")
    elif season < 1994 and not afl_game:
        g["two_pt"] = 0
        source.append("RULE2PT")
    for c in ("two_pt", "fum_rec_td"):
        if g[c]:
            g["fpts_std"] = round(g["fpts_std"] + g[c] * (2 if c == "two_pt" else 6), 2)
            g["fpts_ppr"] = round(g["fpts_ppr"] + g[c] * (2 if c == "two_pt" else 6), 2)
    missing = [c for c in ("targets", "two_pt", "fum_rec_td") if g[c] is None or blank(c, season)]
    g["missing_fields"] = ";".join(missing)
    g["complete"] = not missing
    g["source"] = "+".join(source)
    return g


def blank(column, season):
    """Stats the source doesn't record for early seasons (they'd show as 0)."""
    return (column == "targets" and season < 1992) or (column == "sacked" and season < 1982)


def passer_rating(cmp, att, yds, td, ints):
    """NFL passer rating for a season's totals."""
    if not att:
        return ""
    clamp = lambda x: max(0.0, min(x, 2.375))
    a = clamp((cmp / att - 0.3) * 5)
    b = clamp((yds / att - 3) * 0.25)
    c = clamp(td / att * 20)
    d = clamp(2.375 - ints / att * 25)
    return round((a + b + c + d) / 6 * 100, 1)


def team_name(code, season):
    return next((n for c, a, b, n in TEAM_NAMES if c == code and a <= season <= b), code)


def write_defenses(data_dir, out_dir):
    d = json.load(open(os.path.join(data_dir, "dst_gamelogs.json")))
    games = [dict(zip(d["columns"], r)) for r in d["rows"]]
    nick = {(f["team"], f["season"]): f["nickname"] or "Featured"
            for f in json.load(open(os.path.join(data_dir, "featured_defenses.json")))}
    cols = ["team_name", "team", "season", "week", "date", "playoff", "opp", "home_away", "result",
            "team_score", "pts_allowed", "sacks", "def_int", "def_int_td", "safeties", "ret_td", "fpts"]
    for decade in range(1950, 2000, 10):
        with open(os.path.join(out_dir, f"def_gamelogs_{decade}s.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for g in games:
                if decade <= g["season"] < decade + 10:
                    g = dict(g, team_name=team_name(g["team"], g["season"]))
                    w.writerow(["" if g[c] is None else g[c] for c in cols])
    totals = {}
    for g in games:
        if g["playoff"]:
            continue
        t = totals.setdefault((g["team"], g["season"]), defaultdict(float))
        t["games"] += 1
        t[{"W": "wins", "L": "losses", "T": "ties"}[g["result"]]] += 1
        for c in ("pts_allowed", "def_int", "def_int_td", "safeties", "ret_td", "fpts"):
            t[c] += g[c]
        t["sacks"] = None if g["sacks"] is None else (t.get("sacks") or 0) + g["sacks"]
    tcols = ["team_name", "team", "season", "games", "wins", "losses", "ties", "pts_allowed",
             "pts_allowed_per_game", "sacks", "def_int", "def_int_td", "safeties", "ret_td",
             "fpts", "fpts_per_game", "featured"]
    with open(os.path.join(out_dir, "def_season_totals.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(tcols)
        for (team, season), t in sorted(totals.items(), key=lambda kv: (kv[0][1], team_name(*kv[0]))):
            row = {c: int(t.get(c, 0)) for c in ("games", "wins", "losses", "ties", "pts_allowed", "def_int",
                                                 "def_int_td", "safeties", "ret_td")}
            row.update(team_name=team_name(team, season), team=team, season=season,
                       sacks="" if t["sacks"] is None else int(t["sacks"]), fpts=int(t["fpts"]),
                       pts_allowed_per_game=round(t["pts_allowed"] / t["games"], 1),
                       fpts_per_game=round(t["fpts"] / t["games"], 2),
                       featured=nick.get((team, season), ""))
            w.writerow([row[c] for c in tcols])
KAGGLE = "Kaggle zynicide/nfl-football-player-stats (Pro-Football-Reference scrape, Dec 2017)"
NFLVERSE = "nflverse-data player_stats_1999 + play_by_play_1999 (github.com/nflverse/nflverse-data)"


def write_corrections_log(games, enrich, out_dir):
    """Every change made to the source data, with where the corrected value came from."""
    log = [
        ("all positions", "", "", "pass_cmp/pass_att", "swapped back",
         KAGGLE, "Source has completions and attempts swapped on every row (cmp > att in all 36k passing games)"),
        ("all positions", "", "", "xpm/xpa", "swapped back",
         KAGGLE, "Source has extra points made and attempted swapped on every row"),
        ("all positions", "", "", "targets", "blank before 1992", KAGGLE, "Not recorded before 1992 (source shows 0)"),
        ("all positions", "", "", "sacked / DST sacks", "blank before 1982", KAGGLE, "Not an official stat before 1982"),
        ("WR, TE", "", "1950-1993 NFL games", "two_pt", "0",
         "NFL rulebook: two-point conversion adopted 1994", "AFL games (1960-69) left blank: the AFL allowed it"),
        ("WR, TE", "", "1994-1998", "two_pt", "blank", "", "No accessible source; Pro-Football-Reference blocks automated access"),
        ("WR, TE", "", "before 1999", "fum_rec_td", "blank", "", "No accessible source before 1999"),
        ("WR, TE", "", "1999", "two_pt, fum_rec_td", "filled (0 unless listed below)", NFLVERSE, ""),
    ]
    names = {g["name"] for g in games if g["pos"] in REPAIRED and g["season"] == 1999}
    for key, v in sorted(enrich["players"].items()):
        name, date = key.split("|")
        if name in names:
            for c in ("two_pt", "fum_rec_td"):
                if v[c]:
                    log.append(("player game", name, date, c, v[c], NFLVERSE, ""))
    with open(os.path.join(out_dir, "corrections_log.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["scope", "player", "date_or_seasons", "field", "value", "source", "note"])
        w.writerows(log)


INFO = ["name", "season", "week", "date", "playoff", "team", "opp", "home_away", "result", "team_score", "opp_score"]
POINTS = ["fpts_std", "fpts_ppr"]


def main(data_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    players = {p["player_id"]: p for p in json.load(open(os.path.join(data_dir, "players.json")))}
    d = json.load(open(os.path.join(data_dir, "player_gamelogs.json")))
    games = [dict(zip(d["columns"], r)) for r in d["rows"]]
    enrich = json.load(open(os.path.join(data_dir, "enrich", "nflverse_1999.json")))

    for pos, stats in COLUMNS.items():
        rows = [g for g in games if g["pos"] == pos]
        cols = INFO + stats + POINTS + ["player_id"]
        if pos in REPAIRED:
            rows = [repair_scoring(dict(g), enrich) for g in rows]
            cols += ["complete", "missing_fields", "source"]
        def write_games(path, games_subset):
            with open(path, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(cols)
                for g in games_subset:
                    w.writerow(["" if blank(c, g["season"]) or g[c] is None else g[c] for c in cols])

        write_games(os.path.join(out_dir, f"{pos.lower()}_gamelogs.csv"), rows)
        for decade in range(1950, 2000, 10):
            write_games(os.path.join(out_dir, f"{pos.lower()}_gamelogs_{decade}s.csv"),
                        [g for g in rows if decade <= g["season"] < decade + 10])

        totals = defaultdict(lambda: defaultdict(float))
        teams = defaultdict(list)
        for g in rows:
            if g["playoff"]:
                continue
            key = (g["player_id"], g["season"])
            t = totals[key]
            t["games"] += 1
            for c in stats + POINTS:
                if g[c] is not None:
                    t[c] += g[c]
                else:
                    t["unknown_" + c] = 1
            if g["team"] not in teams[key]:
                teams[key].append(g["team"])
        tcols = ["name", "season", "team", "games"] + stats + POINTS + ["ppr_per_game", "hof", "legend", "player_id"]
        with open(os.path.join(out_dir, f"{pos.lower()}_season_totals.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(tcols)
            for (pid, season), t in sorted(totals.items(), key=lambda kv: (players[kv[0][0]]["name"], kv[0][1])):
                p = players[pid]
                row = {"name": p["name"], "season": season, "team": "/".join(teams[(pid, season)]),
                       "hof": p["hof"], "legend": p["legend"], "player_id": pid,
                       "ppr_per_game": round(t["fpts_ppr"] / t["games"], 2)}
                for c in ["games"] + stats + POINTS:
                    v = t.get(c, 0)
                    row[c] = ("" if blank(c, season) or t.get("unknown_" + c)
                              else round(v, 2) if c in POINTS else int(v))
                if "pass_rating" in stats:
                    row["pass_rating"] = passer_rating(t["pass_cmp"], t["pass_att"], t["pass_yds"],
                                                      t["pass_td"], t["pass_int"])
                w.writerow([row[c] for c in tcols])
    write_defenses(data_dir, out_dir)
    write_corrections_log(games, enrich, out_dir)
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
