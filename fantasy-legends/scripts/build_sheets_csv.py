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

from build_data import AFL_TEAMS, SACKS_FIRST_SEASON

COLUMNS = {
    "QB": ["pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "pass_rating", "sacked",
           "rush_att", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td", "two_pt", "fum_rec_td"],
    "RB": ["rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds", "rec_td",
           "pass_yds", "pass_td", "pass_int", "two_pt", "fum_rec_td", "ret_td"],
    "WR": ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td",
           "pass_yds", "pass_td", "pass_int", "two_pt", "fum_rec_td", "ret_td"],
    "TE": ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td",
           "pass_yds", "pass_td", "pass_int", "two_pt", "fum_rec_td", "ret_td"],
    "K": ["fgm", "fga", "fg_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "xpm", "xpa"],
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
REPAIRED = {"QB", "RB", "WR", "TE"}

# Source codes used in the `source` column.
#   PFR       Pro-Football-Reference, via the Kaggle scrape (zynicide/nfl-football-player-stats, Dec 2017)
#   NFLV1999  nflverse-data player_stats_1999 / play_by_play_1999 (two_pt, fum_rec_td)
#   RULE2PT   two_pt = 0 because the NFL had no two-point conversion before 1994
def repair_scoring(g, enrich):
    """Fill two_pt and fum_rec_td only where they're known, and recompute fantasy points."""
    season, team, opp, date = g["season"], g["team"], g["opp"], g["date"]
    source = ["PFR"]
    g["two_pt"] = g["fum_rec_td"] = None
    afl_game = 1960 <= season <= 1969 and (team in AFL_TEAMS or opp in AFL_TEAMS)
    if season == 1999 and f"{date}|{team}" in enrich["team_games"]:
        found = enrich["players"].get(f"{g['name']}|{date}", {})
        g["two_pt"] = found.get("two_pt", 0)
        g["fum_rec_td"] = found.get("fum_rec_td", 0)
        source.append("NFLV1999")
    elif season < 1994 and not afl_game:
        g["two_pt"] = 0
        source.append("RULE2PT")
    if season < RETURNS_FIRST_SEASON:
        g["ret_td"] = None  # the source has almost no return data before 1960
    for c in ("two_pt", "fum_rec_td"):
        if g[c]:
            g["fpts_std"] = round(g["fpts_std"] + g[c] * (2 if c == "two_pt" else 6), 2)
            g["fpts_ppr"] = round(g["fpts_ppr"] + g[c] * (2 if c == "two_pt" else 6), 2)
    check = ("targets", "two_pt", "fum_rec_td", "ret_td") if g["pos"] != "QB" else ("sacked", "two_pt", "fum_rec_td", "ret_td")
    missing = [c for c in check if g[c] is None or blank(c, season)]
    g["missing_fields"] = ";".join(missing)
    g["complete"] = not missing
    g["source"] = "+".join(source)
    return g


def game_id(g):
    """Stable game ID built from this dataset's own fields: YYYYMMDD-AWAY-HOME (team codes as in `team`/`opp`).
    Neutral-site games list the two teams alphabetically with an N marker."""
    day = g["date"].replace("-", "")
    if g["home_away"] == "H":
        return f"{day}-{g['opp']}-{g['team']}"
    if g["home_away"] == "A":
        return f"{day}-{g['team']}-{g['opp']}"
    a, b = sorted((g["team"], g["opp"]))
    return f"{day}-{a}-{b}-N"


# Every field that earns points under the owner's scoring contract (deck v4). Targets and times sacked
# don't score; fumbles lost score 0 in v4. Offense coefficients come from the site's code.
OFFENSE_SCORING = ("pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td",
                   "ret_td", "two_pt", "fum_rec_td")
SCORING_FIELDS = {
    "QB": OFFENSE_SCORING, "RB": OFFENSE_SCORING, "WR": OFFENSE_SCORING, "TE": OFFENSE_SCORING,
    "K": ("xpm", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed"),
    "DEF": ("pts_allowed", "sacks", "def_int", "fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp",
            "def_int_td", "def_fum_td", "ret_td"),
}


def era_unrecorded(g, pos):
    """Scoring fields the source records for no game in this era. The era-scored option leaves these out
    for everyone in the era; anything else that's unknown still blocks the game."""
    season = g["season"]
    if pos in ("QB", "RB", "WR", "TE"):
        fields = {"fum_rec_td"} if season < 1999 else set()
        if season < RETURNS_FIRST_SEASON:
            fields.add("ret_td")
        afl = 1960 <= season <= 1969 and (g["team"] in AFL_TEAMS or g["opp"] in AFL_TEAMS)
        if afl or 1994 <= season <= 1998:
            fields.add("two_pt")
        return fields
    if pos == "K":
        # Distance tiers only exist for 1999. Before 1960 all kicking is unknown, which isn't excludable.
        return {"fgm_0_39", "fgm_40_49", "fgm_50p"} if KICK_FIRST_SEASON <= season < 1999 else set()
    fields = {"sacks"} if season < SACKS_FIRST_SEASON else set()
    if season < RETURNS_FIRST_SEASON:
        fields.add("ret_td")
    if season < 1999:
        fields |= {"fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td"}
    return fields


def scoring_status(g, pos):
    """strict: every scoring field known. era-scored: unknowns limited to fields the era never records."""
    missing = [c for c in SCORING_FIELDS[pos] if g.get(c) is None]
    if pos == "DEF" and g["int_check"] != "match":
        missing.append("def_int")  # max(defenders, opposing passers) is a heuristic, not verified
    excluded = era_unrecorded(g, pos)
    blocking = [c for c in missing if c not in excluded]
    g["scoring_missing"] = ";".join(dict.fromkeys(missing))
    g["scoring_complete"] = g["strict_eligible"] = not missing
    g["era_excluded_fields"] = ";".join(c for c in missing if c in excluded)
    g["era_blocking_fields"] = ";".join(dict.fromkeys(blocking))
    g["era_scored_eligible"] = not blocking
    g["game_id"] = game_id(g)
    return g


def kicker_contract_points(g):
    """Deck v4 kicker scoring: XP +1, FG <40 +3, 40-49 +4, 50+ +5, missed FG (blocks included) -1.
    Blank unless every input is known."""
    if any(g[c] is None for c in ("xpm", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed")):
        return None
    return g["xpm"] + 3 * g["fgm_0_39"] + 4 * g["fgm_40_49"] + 5 * g["fgm_50p"] - g["fg_missed"]


KICK_FIRST_SEASON = 1960  # the source has almost no kicking stats before 1960
RETURNS_FIRST_SEASON = 1960  # nor kick/punt return stats (45 kick-return rows in the whole decade)


def repair_kicking(g, enrich):
    """Kicking stats are unknown (not zero) before 1960. FG distances only exist for 1999 (nflverse),
    and are used only when nflverse's made/attempted counts agree with the main source."""
    season = g["season"]
    source = ["PFR"]
    for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
        g[c] = None
    if season < KICK_FIRST_SEASON:
        for c in ("fgm", "fga", "xpm", "xpa", "fpts_std", "fpts_ppr"):
            g[c] = None
        g["fg_missed"] = None
    else:
        g["fg_missed"] = g["fga"] - g["fgm"]
        k = enrich["kickers"].get(f"{g['name']}|{g['date']}") if season == 1999 else None
        if k and (k.get("fgm", 0), k.get("fga", 0)) == (g["fgm"], g["fga"]):
            for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
                g[c] = k.get(c, 0)
            source.append("NFLV1999")
        elif season == 1999 and g["fga"] == 0:
            for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
                g[c] = 0
        elif season == 1999 and k:
            source.append("NFLV1999-MISMATCH")
    missing = [c for c in ("fgm", "xpm", "fgm_0_39") if g[c] is None]
    g["missing_fields"] = ";".join("fg_distance" if c == "fgm_0_39" else c for c in missing)
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


def dst_points(g):
    """Deck v4 DEF scoring from the components known for this game (unknown components count as nothing).
    `fpts` is only filled when every component is known; `fpts_known` is this partial sum."""
    pa = g["pts_allowed"]
    pts = 10 if pa == 0 else 7 if pa <= 6 else 4 if pa <= 13 else 1 if pa <= 20 else 0 if pa <= 27 else -1 if pa <= 34 else -4
    v = lambda c: g[c] or 0
    return (pts + v("sacks") + 2 * (v("def_int") + v("fum_rec") + v("safeties") + v("blk_punt") + v("blk_fg") + v("blk_xp"))
            + 6 * (v("def_int_td") + v("def_fum_td") + v("ret_td")))


def repair_defense(g, enrich):
    """Cross-check interceptions against the opponent's passers, add 1999 extras, flag unknowns."""
    g = dict(g, team_name=team_name(g["team"], g["season"]), def_int_defenders=g["def_int"])
    source = ["PFR"]
    opp = g["opp_pass_int"]
    if opp is None or opp == g["def_int"]:
        g["int_check"] = "match" if opp is not None else "unverified"
    elif opp > g["def_int"]:
        # Each count can only miss interceptions (rows missing from one log), so the larger is more complete.
        g["def_int"], g["int_check"] = opp, "raised_to_opp_qb_count"
    else:
        g["int_check"] = "kept_defender_count"
    extra = enrich["defense"].get(f"{g['date']}|{g['team']}") if g["season"] == 1999 else None
    # The source never records defensive INT-return TDs and almost never safeties (both read 0), so they're
    # unknown except where nflverse has them (1999).
    for c in ("fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td"):
        g[c] = extra.get(c, 0) if extra is not None else None
    if g["season"] < RETURNS_FIRST_SEASON:
        g["ret_td"] = None
    if extra is not None:
        source.append("NFLV1999")
    g["def_td"] = g["def_int_td"] + g["def_fum_td"] if g["def_fum_td"] is not None else None
    g["fpts_known"] = dst_points(g)
    g["fpts"] = g["fpts_known"] if all(g[c] is not None for c in SCORING_FIELDS["DEF"]) else None
    missing = [c for c in ("sacks", "fum_rec", "safeties", "blk_punt", "def_int_td", "def_fum_td", "ret_td") if g[c] is None]
    g["missing_fields"] = ";".join("blocked_kicks" if c == "blk_punt" else c for c in missing)
    g["complete"] = not missing
    g["source"] = "+".join(source)
    return g


def write_defenses(data_dir, out_dir, enrich):
    d = json.load(open(os.path.join(data_dir, "dst_gamelogs.json")))
    games = [scoring_status(repair_defense(dict(zip(d["columns"], r)), enrich), "DEF") for r in d["rows"]]
    nick = {(f["team"], f["season"]): f["nickname"] or "Featured"
            for f in json.load(open(os.path.join(data_dir, "featured_defenses.json")))}
    stats = ["sacks", "def_int", "fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp",
             "def_int_td", "def_fum_td", "def_td", "ret_td"]
    cols = (["team_name", "team", "season", "week", "date", "playoff", "opp", "home_away", "result",
             "team_score", "pts_allowed"] + stats +
            ["fpts", "fpts_known", "int_check", "def_int_defenders", "opp_pass_int", "complete", "missing_fields", "source",
             "game_id", "scoring_complete", "scoring_missing", "strict_eligible", "era_scored_eligible",
                     "era_excluded_fields", "era_blocking_fields"])
    for decade in range(1950, 2000, 10):
        with open(os.path.join(out_dir, f"def_gamelogs_{decade}s.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for g in games:
                if decade <= g["season"] < decade + 10:
                    w.writerow(["" if g[c] is None else g[c] for c in cols])
    totals = {}
    for g in games:
        if g["playoff"]:
            continue
        t = totals.setdefault((g["team"], g["season"]), defaultdict(float))
        t["games"] += 1
        t[{"W": "wins", "L": "losses", "T": "ties"}[g["result"]]] += 1
        for c in stats + ["pts_allowed", "fpts", "fpts_known"]:
            if g[c] is None:
                t["unknown_" + c] = 1
            else:
                t[c] += g[c]
        t["ints_corrected"] += g["int_check"] == "raised_to_opp_qb_count"
    tcols = (["team_name", "team", "season", "games", "wins", "losses", "ties", "pts_allowed",
              "pts_allowed_per_game"] + stats + ["fpts", "fpts_per_game", "fpts_known", "ints_corrected", "featured"])
    with open(os.path.join(out_dir, "def_season_totals.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(tcols)
        for (team, season), t in sorted(totals.items(), key=lambda kv: (kv[0][1], team_name(*kv[0]))):
            row = {c: "" if t.get("unknown_" + c) else int(t.get(c, 0))
                   for c in ["games", "wins", "losses", "ties", "pts_allowed", "fpts", "fpts_known", "ints_corrected"] + stats}
            row.update(team_name=team_name(team, season), team=team, season=season,
                       pts_allowed_per_game=round(t["pts_allowed"] / t["games"], 1),
                       fpts_per_game="" if t.get("unknown_fpts") else round(t["fpts"] / t["games"], 2),
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
        ("QB, RB, WR, TE", "", "1950-1993 NFL games", "two_pt", "0",
         "NFL rulebook: two-point conversion adopted 1994", "AFL games (1960-69) left blank: the AFL allowed it"),
        ("QB, RB, WR, TE", "", "1994-1998", "two_pt", "blank", "", "No accessible source; Pro-Football-Reference blocks automated access"),
        ("QB, RB, WR, TE", "", "before 1999", "fum_rec_td", "blank", "", "No accessible source before 1999"),
        ("QB, RB, WR, TE", "", "1999", "two_pt, fum_rec_td", "filled (0 unless listed below)", NFLVERSE, ""),
        ("K", "", "before 1960", "fgm/fga/xpm/xpa, fpts", "blank", KAGGLE, "Source has almost no kicking stats before 1960"),
        ("K", "", "all seasons", "fg_missed", "fga - fgm", KAGGLE, ""),
        ("K", "", "1999", "fgm_0_39/fgm_40_49/fgm_50p", "filled", NFLVERSE,
         "Only where nflverse FG made/attempted equal the main source; other years blank (no FG distances)"),
        ("DEF", "", "all seasons", "def_int", "max(defenders' INTs, opposing passers' INTs thrown)", KAGGLE,
         "Both logs can only miss interceptions, so the larger count is more complete. int_check and "
         "def_int_defenders/opp_pass_int show the original numbers. Verified: 1985 CHI 34, 1975 PIT 27, "
         "1969 MIN 30, 1961 SDG 49"),
        ("DEF", "", "1999", "fum_rec, blk_punt/blk_fg/blk_xp, def_fum_td", "filled", NFLVERSE,
         "Other seasons blank. 1999-09-12 BAL at STL is missing from nflverse, so those two rows stay blank"),
        ("DEF", "", "1950-1998", "safeties, def_int_td", "blank", KAGGLE,
         "Source never records defensive INT-return TDs and records safeties in 18 of 1M rows, so its zeros aren't real; "
         "1999 filled from nflverse"),
        ("all positions", "", "1950-1959", "ret_td", "blank", KAGGLE,
         "Source has almost no return data before 1960 (45 kick-return rows in the decade)"),
        ("QB, RB, WR, TE", "", "1952", "two_pt", "0", "NFL rulebook",
         "Dallas Texans 1952 were an NFL team; earlier build treated them as AFL"),
        ("DEF", "", "all seasons", "def_int_td vs def_fum_td vs ret_td", "separate columns", "",
         "Defensive TDs (def_td = def_int_td + def_fum_td) and special-teams return TDs (ret_td) never overlap"),
    ]
    for d in json.load(open(os.path.join(os.path.dirname(out_dir), "enrich", "dedup_log.json"))):
        log.append(("duplicate removed", d["player"], d["date"], "whole row",
                    f"kept {d['kept_team']}, dropped {'/'.join(d['dropped_teams'])}", KAGGLE,
                    f"Same player listed for two teams on one date; kept {d['reason']}"))
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
            rows = [scoring_status(repair_scoring(dict(g), enrich), pos) for g in rows]
            cols += ["complete", "missing_fields", "source", "game_id", "scoring_complete", "scoring_missing", "strict_eligible", "era_scored_eligible",
                     "era_excluded_fields", "era_blocking_fields"]
        elif pos == "K":
            rows = [scoring_status(repair_kicking(dict(g), enrich), pos) for g in rows]
            for g in rows:
                g["fpts_k_contract"] = kicker_contract_points(g)
            cols += ["complete", "missing_fields", "source", "game_id", "scoring_complete", "scoring_missing", "strict_eligible", "era_scored_eligible",
                     "era_excluded_fields", "era_blocking_fields", "fpts_k_contract"]
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
                       "ppr_per_game": "" if t.get("unknown_fpts_ppr") else round(t["fpts_ppr"] / t["games"], 2)}
                for c in ["games"] + stats + POINTS:
                    v = t.get(c, 0)
                    row[c] = ("" if blank(c, season) or t.get("unknown_" + c)
                              else round(v, 2) if c in POINTS else int(v))
                if "pass_rating" in stats:
                    row["pass_rating"] = passer_rating(t["pass_cmp"], t["pass_att"], t["pass_yds"],
                                                      t["pass_td"], t["pass_int"])
                w.writerow([row[c] for c in tcols])
    write_defenses(data_dir, out_dir, enrich)
    write_corrections_log(games, enrich, out_dir)
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
