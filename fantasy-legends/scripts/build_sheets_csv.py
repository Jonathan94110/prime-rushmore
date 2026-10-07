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
    "K": ["fgm", "fga", "fg_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "xpm", "xpa", "xp_missed",
          "pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td",
          "two_pt", "fum_rec_td"],
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
BRANCH_RAW = ("https://raw.githubusercontent.com/Jonathan94110/prime-rushmore/claude/inspiring-archimedes-aum2zs/"
              "fantasy-legends/data/sheets/")
KAGGLE_URL = "https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats"
NFLV_PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.csv.gz"
NFLV_PS_URL = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_1999.csv"
RULE2PT_URL = "https://en.wikipedia.org/wiki/Two-point_conversion"
RECON_URL = KAGGLE_URL  # the recorded plays come from the source game logs; arithmetic in score_reconciliation.csv
UNRECORDED = "Source shows 0 but doesn't record this field for this era, so the 0 isn't a real value"

RECON = {}       # (team, date) -> team-game row with team_score, recorded_td/xpm/fgm, score_residual
CONFLICTS = []   # evidence that disagrees between sources


def track(g, fields, absent=()):
    """Remember source values before repair. Fields in `absent` don't exist in the source at all."""
    g["_orig"] = {c: ("absent" if c in absent else g.get(c)) for c in fields}
    g["_prov"] = {}


def setv(g, field, value, src, url, evidence):
    g[field] = value
    g["_prov"][field] = (src, url, evidence)


def recon_kind(g):
    """SCORE0: the team's recorded TDs, XPs and FGs add up to its whole final score, so no other scoring
    play happened. SCORE2: they add up to 2 less, before 1994 in an NFL game, so the 2 is a safety and no
    other unrecorded scoring play happened."""
    r = RECON.get((g["team"], g["date"]))
    if not r:
        return None, None
    season = g["season"]
    afl = 1960 <= season <= 1969 and (g["team"] in AFL_TEAMS or g["opp"] in AFL_TEAMS)
    if r["score_residual"] == 0:
        return "SCORE0", r
    if r["score_residual"] == 2 and 1960 <= season < 1994 and not afl:
        return "SCORE2", r
    return None, r


def recon_evidence(kind, r):
    td, xp, fg = r["recorded_td"], r["recorded_xpm"], r["recorded_fgm"]
    pts = 6 * td + xp + 3 * fg
    tail = "whole score" if kind == "SCORE0" else "score minus a 2-pt safety"
    return f"{r['team']} scored {r['team_score']}; recorded {td} TD + {xp} XP + {fg} FG = {pts} = {tail} (score_reconciliation.csv)"


RECON_MEANING = {
    "SCORE0": "Recorded TDs, XPs and FGs add up to the whole final score, so no other scoring play (safety, two-point "
              "conversion, defensive, fumble-recovery or return TD) happened for this team.",
    "SCORE2": "Recorded plays add up to 2 less than the final score in an NFL game before 1994 (no two-point conversion "
              "existed), so the 2 points are one safety and no other unrecorded touchdown happened.",
}


def repair_scoring(g, enrich):
    """two_pt, fum_rec_td and (before 1960) ret_td: fill only from evidence, recording where each value came from."""
    season, team, opp, date = g["season"], g["team"], g["opp"], g["date"]
    track(g, ("two_pt", "fum_rec_td", "ret_td"), absent=("two_pt", "fum_rec_td"))
    g["two_pt"] = g["fum_rec_td"] = None
    afl_game = 1960 <= season <= 1969 and (team in AFL_TEAMS or opp in AFL_TEAMS)
    kind, r = recon_kind(g)
    if season < RETURNS_FIRST_SEASON:
        setv(g, "ret_td", None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no return data before 1960)")
    if season == 1999 and f"{date}|{team}" in enrich["team_games"]:
        found = enrich["players"].get(f"{g['name']}|{date}", {})
        plays = enrich["evidence"]["players"].get(f"{g['name']}|{date}", [])
        gid = enrich["nflverse_game_ids"].get(f"{date}|{team}")
        for c in ("two_pt", "fum_rec_td"):
            value = found.get(c, 0)
            ev = "; ".join(p for p in plays if p.startswith(c + ":")) or f"No qualifying play by this player in nflverse play-by-play for {gid}"
            setv(g, c, value, "NFLV1999", NFLV_PBP_URL, ev)
            if value and kind == "SCORE0":
                CONFLICTS.append((g["pos"], g["player_id"], g["name"], game_id(g), c, f"nflverse {value} but score reconciles"))
    elif season < 1994 and not afl_game:
        setv(g, "two_pt", 0, "RULE2PT", RULE2PT_URL, "The NFL had no two-point conversion before 1994")
    if kind:
        for c in ("two_pt", "fum_rec_td", "ret_td"):
            if g[c] is None:
                setv(g, c, 0, kind, RECON_URL, recon_evidence(kind, r))
    for c in ("two_pt", "fum_rec_td"):
        if g[c]:
            g["fpts_std"] = round(g["fpts_std"] + g[c] * (2 if c == "two_pt" else 6), 2)
            g["fpts_ppr"] = round(g["fpts_ppr"] + g[c] * (2 if c == "two_pt" else 6), 2)
    check = ("targets", "two_pt", "fum_rec_td", "ret_td") if g["pos"] != "QB" else ("sacked", "two_pt", "fum_rec_td", "ret_td")
    missing = [c for c in check if g[c] is None or blank(c, season)]
    g["missing_fields"] = ";".join(missing)
    g["complete"] = not missing
    g["source"] = "+".join(dict.fromkeys(["PFR"] + [v[0] for v in g["_prov"].values() if v[0] != "UNRECORDED"]))
    g["team_score_residual"] = r["score_residual"] if r else None
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
    "K": ("xpm", "xp_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed") + OFFENSE_SCORING,
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


# The era-scored option for kickers keeps its original kicking-only field set (Historical rules unchanged).
ERA_FIELDS_K = ("xpm", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed")


def scoring_status(g, pos):
    """strict: every scoring field known. era-scored: unknowns limited to fields the era never records."""
    missing = [c for c in SCORING_FIELDS[pos] if g.get(c) is None]
    excluded = era_unrecorded(g, pos)
    era_missing = [c for c in ERA_FIELDS_K if g.get(c) is None] if pos == "K" else missing
    blocking = [c for c in era_missing if c not in excluded]
    g["scoring_missing"] = ";".join(dict.fromkeys(missing))
    g["scoring_complete"] = g["strict_eligible"] = not missing
    g["era_excluded_fields"] = ";".join(c for c in era_missing if c in excluded)
    g["era_blocking_fields"] = ";".join(dict.fromkeys(blocking))
    g["era_scored_eligible"] = not blocking
    g["game_id"] = game_id(g)
    return g


def kicker_contract_points(g):
    """Kicking points under the app's rules: XP +1, missed XP -1, FG <40 +3, 40-49 +4, 50+ +5, missed FG
    (blocks included) -1. Blank unless every kicking input is known. A kicker's own passing, rushing,
    receiving and return points use the site's offense coefficients and aren't included here."""
    if any(g[c] is None for c in ("xpm", "xp_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed")):
        return None
    return (g["xpm"] - g["xp_missed"] + 3 * g["fgm_0_39"] + 4 * g["fgm_40_49"] + 5 * g["fgm_50p"]
            - g["fg_missed"])


KICK_FIRST_SEASON = 1960  # the source has almost no kicking stats before 1960
RETURNS_FIRST_SEASON = 1960  # nor kick/punt return stats (45 kick-return rows in the whole decade)


def repair_kicking(g, enrich):
    """Kicking inputs, after repair_scoring has handled the kicker's offense fields.
    - Before 1960 the source rarely records kicking; values count only where the team's score reconciles.
    - xpm/xpa are swapped back in build_data; logged here per row.
    - xp_missed = xpa - xpm and fg_missed = fga - fgm (blocked attempts count as misses).
    - FG distance tiers: 0 when no field goal was made; 1999 from nflverse when its counts agree."""
    season = g["season"]
    kicking = ("fgm", "fga", "xpm", "xpa", "fgm_0_39", "fgm_40_49", "fgm_50p")
    g["_orig"].update({"xpm": g["xpa"], "xpa": g["xpm"], "fgm": g["fgm"], "fga": g["fga"],
                       "fgm_0_39": "absent", "fgm_40_49": "absent", "fgm_50p": "absent"})
    if g["xpm"] != g["xpa"]:
        swap = "Source has extra points made and attempted swapped on every row (made > attempted in all 1,673 rows that differ)"
        g["_prov"]["xpm"] = g["_prov"]["xpa"] = ("SWAP", KAGGLE_URL, swap)
    for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
        g[c] = None
    kind, r = recon_kind(g)
    if season < KICK_FIRST_SEASON and kind != "SCORE0":
        for c in ("fgm", "fga", "xpm", "xpa"):
            setv(g, c, None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no kicking data before 1960)")
        g["fpts_std"] = g["fpts_ppr"] = None
    elif season < KICK_FIRST_SEASON:
        g["_prov"].setdefault("fgm", ("SCORE0", RECON_URL, recon_evidence(kind, r)))
    known = g["fgm"] is not None
    g["fg_missed"] = g["fga"] - g["fgm"] if known else None
    g["xp_missed"] = g["xpa"] - g["xpm"] if known else None
    if known:
        k = enrich["kickers"].get(f"{g['name']}|{g['date']}") if season == 1999 else None
        if g["fgm"] == 0:
            for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
                setv(g, c, 0, "NOFGM", KAGGLE_URL, f"Source records 0 FG made ({g['fga']} attempted)")
        elif k and (k.get("fgm", 0), k.get("fga", 0)) == (g["fgm"], g["fga"]):
            plays = [p for p in enrich["evidence"]["kickers"].get(f"{g['name']}|{g['date']}", []) if "field goal" in p.lower()]
            for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
                setv(g, c, k.get(c, 0), "NFLV1999", NFLV_PBP_URL, "; ".join(plays))
        elif season == 1999 and k:
            CONFLICTS.append(("K", g["player_id"], g["name"], game_id(g), "fgm/fga",
                              f"source {g['fgm']}/{g['fga']}, nflverse {k.get('fgm', 0)}/{k.get('fga', 0)}"))
    missing = [c for c in ("fgm", "xpm", "fgm_0_39", "two_pt", "fum_rec_td", "ret_td") if g[c] is None]
    g["missing_fields"] = ";".join("fg_distance" if c == "fgm_0_39" else c for c in missing)
    g["complete"] = not missing
    g["source"] = "+".join(dict.fromkeys(["PFR"] + [v[0] for v in g["_prov"].values() if v[0] != "UNRECORDED"]))
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
    """Interceptions: kept only where defenders' and opposing passers' counts agree; disputed games are
    quarantined (blank) with both originals kept. Unrecorded zeros become blank. 1999 extras from nflverse.
    Score reconciliation supplies evidence-based defensive TD and safety values."""
    g = dict(g, team_name=team_name(g["team"], g["season"]), def_int_defenders=g["def_int"])
    season = g["season"]
    track(g, ("def_int", "safeties", "def_int_td", "def_fum_td", "fum_rec", "blk_punt", "blk_fg", "blk_xp", "ret_td"),
          absent=("def_fum_td", "fum_rec", "blk_punt", "blk_fg", "blk_xp"))
    opp = g["opp_pass_int"]
    if opp is not None and opp == g["def_int"]:
        g["int_check"] = "match"
    else:
        g["int_check"] = "disputed" if opp is not None else "unverified"
        setv(g, "def_int", None, "QUARANTINE", KAGGLE_URL,
             f"Defenders' logs record {g['def_int_defenders']} interceptions; the opposing passers' logs record {opp} thrown")
    for c in ("safeties", "def_int_td"):
        setv(g, c, None, "UNRECORDED", KAGGLE_URL, UNRECORDED)
    for c in ("fum_rec", "blk_punt", "blk_fg", "blk_xp", "def_fum_td"):
        g[c] = None
    if season < RETURNS_FIRST_SEASON:
        setv(g, "ret_td", None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no return data before 1960)")
    kind, r = recon_kind(g)
    extra = enrich["defense"].get(f"{g['date']}|{g['team']}") if season == 1999 else None
    if extra is not None:
        plays = enrich["evidence"]["defense"].get(f"{g['date']}|{g['team']}", [])
        gid = enrich["nflverse_game_ids"].get(f"{g['date']}|{g['team']}")
        for c in ("fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td"):
            ev = "; ".join(p for p in plays if p.startswith(c + ":")) or f"No qualifying play in nflverse play-by-play for {gid}"
            setv(g, c, extra.get(c, 0), "NFLV1999", NFLV_PBP_URL, ev)
        if kind == "SCORE0" and any(extra.get(c, 0) for c in ("safeties", "def_int_td", "def_fum_td")):
            CONFLICTS.append(("DEF", g["team"], g["team_name"], game_id(g), "def TDs/safeties", "nflverse nonzero but score reconciles"))
    if kind:
        ev = recon_evidence(kind, r)
        for c in ("def_int_td", "def_fum_td", "ret_td"):
            if g[c] is None:
                setv(g, c, 0, kind, RECON_URL, ev)
        if g["safeties"] is None:
            setv(g, "safeties", 0 if kind == "SCORE0" else 1, kind, RECON_URL, ev)
    g["def_td"] = g["def_int_td"] + g["def_fum_td"] if None not in (g["def_int_td"], g["def_fum_td"]) else None
    g["fpts_known"] = dst_points(g)
    g["fpts"] = g["fpts_known"] if all(g[c] is not None for c in SCORING_FIELDS["DEF"]) else None
    missing = [c for c in ("sacks", "def_int", "fum_rec", "safeties", "blk_punt", "def_int_td", "def_fum_td", "ret_td") if g[c] is None]
    g["missing_fields"] = ";".join("blocked_kicks" if c == "blk_punt" else c for c in missing)
    g["complete"] = not missing
    g["source"] = "+".join(dict.fromkeys(["PFR"] + [v[0] for v in g["_prov"].values() if v[0] != "UNRECORDED"]))
    g["team_score_residual"] = r["score_residual"] if r else None
    return g


def load_reconciliation(data_dir):
    d = json.load(open(os.path.join(data_dir, "dst_gamelogs.json")))
    for r in d["rows"]:
        row = dict(zip(d["columns"], r))
        RECON[(row["team"], row["date"])] = row


def write_defenses(data_dir, out_dir, enrich):
    d = json.load(open(os.path.join(data_dir, "dst_gamelogs.json")))
    games = [scoring_status(repair_defense(dict(zip(d["columns"], r)), enrich), "DEF") for r in d["rows"]]
    nick = {(f["team"], f["season"]): f["nickname"] or "Featured"
            for f in json.load(open(os.path.join(data_dir, "featured_defenses.json")))}
    stats = ["sacks", "def_int", "fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp",
             "def_int_td", "def_fum_td", "def_td", "ret_td"]
    cols = (["team_name", "team", "season", "week", "date", "playoff", "opp", "home_away", "result",
             "team_score", "pts_allowed"] + stats +
            ["fpts", "fpts_known", "int_check", "def_int_defenders", "opp_pass_int", "recorded_td", "recorded_xpm",
             "recorded_fgm", "team_score_residual", "complete", "missing_fields", "source",
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
    return games


LOG_COLUMNS = ["game_id", "pos", "player_id", "name", "season", "field", "old_value", "new_value", "source",
               "source_url", "evidence"]


def change_rows(g, pos, ident):
    """One log row per field whose final value differs from the source value."""
    out = []
    for field, old in g.get("_orig", {}).items():
        new = g.get(field)
        if old == new or (old == "absent" and new is None):
            continue
        src, url, ev = g["_prov"].get(field, ("", "", ""))
        out.append({"game_id": game_id(g), "pos": pos, "player_id": ident,
                    "name": g.get("name") or g.get("team_name"), "season": g["season"], "field": field,
                    "old_value": "not in source" if old == "absent" else ("" if old is None else old),
                    "new_value": "" if new is None else new, "source": src, "source_url": url, "evidence": ev})
    return out


def write_logs(out_dir, player_rows, def_rows):
    """corrections_log.csv (every changed field, with evidence), score_reconciliation.csv (the arithmetic
    behind SCORE0/SCORE2), conflicts.csv, unresolved_{players,defense}.csv (regular season, still missing a
    scoring field) and verified_replacements.csv (Darius's merge format)."""
    groups = list(player_rows.items()) + [("DEF", def_rows)]
    with open(os.path.join(out_dir, "corrections_log.csv"), "w", newline="") as f:
        # Rule-level entries, plus a pointer to the per-position files with one row per changed field.
        w = csv.DictWriter(f, fieldnames=LOG_COLUMNS)
        w.writeheader()
        w.writerow({"game_id": "all", "pos": "QB/RB/WR/TE/K", "field": "pass_cmp/pass_att", "old_value": "swapped",
                    "new_value": "swapped back", "source": "SWAP", "source_url": KAGGLE_URL,
                    "evidence": "Source has completions and attempts swapped on every row (cmp > att in all 36k passing games); not a scoring field"})
        w.writerow({"game_id": "all", "pos": "DEF", "field": "sacks", "old_value": "0", "new_value": "",
                    "source": "UNRECORDED", "source_url": KAGGLE_URL,
                    "evidence": "Sacks were not an official stat before 1982; blank for 1950-1981"})
        for pos, _ in groups:
            w.writerow({"game_id": "all", "pos": pos, "field": "every changed field",
                        "source": "see file", "source_url": BRANCH_RAW + f"corrections_log_{pos.lower()}.csv",
                        "evidence": f"One row per changed field for {pos}: corrections_log_{pos.lower()}.csv"})
    for pos, rows in groups:
        with open(os.path.join(out_dir, f"corrections_log_{pos.lower()}.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=LOG_COLUMNS)
            w.writeheader()
            for g in rows:
                for row in change_rows(g, pos, g["team"] if pos == "DEF" else g["player_id"]):
                    w.writerow(row)
    with open(os.path.join(out_dir, "score_reconciliation.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["game_id", "team", "season", "date", "playoff", "team_score", "recorded_td", "recorded_xpm",
                    "recorded_fgm", "recorded_points", "score_residual", "result"])
        for g in def_rows:
            r = RECON[(g["team"], g["date"])]
            kind, _ = recon_kind(g)
            pts = 6 * r["recorded_td"] + r["recorded_xpm"] + 3 * r["recorded_fgm"]
            w.writerow([game_id(g), g["team"], g["season"], g["date"], g["playoff"], r["team_score"], r["recorded_td"],
                        r["recorded_xpm"], r["recorded_fgm"], pts, r["score_residual"],
                        kind or ("recorded plays exceed the score" if r["score_residual"] < 0 else "unexplained points")])
    with open(os.path.join(out_dir, "conflicts.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pos", "player_id_or_team", "name", "game_id", "field", "detail"])
        w.writerows(CONFLICTS)
        for g in def_rows:
            if g["team_score_residual"] is not None and g["team_score_residual"] < 0:
                w.writerow(["DEF", g["team"], g["team_name"], game_id(g), "team score",
                            f"recorded scoring plays add up to more than the final score (residual {g['team_score_residual']})"])
    with open(os.path.join(out_dir, "unresolved_players.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pos", "player_id", "name", "season", "game_id", "date", "team", "opp", "missing_fields", "team_score_residual"])
        for pos, rows in player_rows.items():
            for g in rows:
                if not g["playoff"] and g["scoring_missing"]:
                    w.writerow([pos, g["player_id"], g["name"], g["season"], game_id(g), g["date"], g["team"], g["opp"],
                                g["scoring_missing"], g.get("team_score_residual")])
    with open(os.path.join(out_dir, "unresolved_defense.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["team", "team_name", "season", "game_id", "date", "opp", "missing_fields", "int_check", "team_score_residual"])
        for g in def_rows:
            if not g["playoff"] and g["scoring_missing"]:
                w.writerow([g["team"], g["team_name"], g["season"], game_id(g), g["date"], g["opp"], g["scoring_missing"],
                            g["int_check"], g["team_score_residual"]])
    for pos, rows in groups:
        with open(os.path.join(out_dir, f"verified_replacements_{pos.lower()}.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["position", "player_id_or_team", "game_id", "verified_replacements_json", "evidence_url", "verification_notes"])
            for g in rows:
                if g["playoff"]:
                    continue
                ident = g["team"] if pos == "DEF" else g["player_id"]
                filled = {r["field"]: r["new_value"] for r in change_rows(g, pos, ident)
                          if r["new_value"] != "" and r["source"] in ("NFLV1999", "SCORE0", "SCORE2", "RULE2PT", "NOFGM")}
                if filled:
                    urls = sorted({g["_prov"][c][1] for c in filled})
                    notes = sorted({f"{g['_prov'][c][0]}: {g['_prov'][c][2]}" for c in filled})
                    w.writerow([pos, ident, game_id(g), json.dumps(filled, sort_keys=True), " ".join(urls), " | ".join(notes)])


INFO = ["name", "season", "week", "date", "playoff", "team", "opp", "home_away", "result", "team_score", "opp_score"]
POINTS = ["fpts_std", "fpts_ppr"]


def main(data_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    players = {p["player_id"]: p for p in json.load(open(os.path.join(data_dir, "players.json")))}
    d = json.load(open(os.path.join(data_dir, "player_gamelogs.json")))
    games = [dict(zip(d["columns"], r)) for r in d["rows"]]
    enrich = json.load(open(os.path.join(data_dir, "enrich", "nflverse_1999.json")))
    load_reconciliation(data_dir)
    player_rows = {}

    for pos, stats in COLUMNS.items():
        rows = [g for g in games if g["pos"] == pos]
        cols = INFO + stats + POINTS + ["player_id"]
        if pos in REPAIRED:
            rows = [scoring_status(repair_scoring(dict(g), enrich), pos) for g in rows]
            cols += ["complete", "missing_fields", "source", "game_id", "scoring_complete", "scoring_missing", "strict_eligible", "era_scored_eligible",
                     "era_excluded_fields", "era_blocking_fields", "team_score_residual"]
        elif pos == "K":
            rows = [scoring_status(repair_kicking(repair_scoring(dict(g), enrich), enrich), pos) for g in rows]
            for g in rows:
                g["fpts_k_contract"] = kicker_contract_points(g)
            cols += ["complete", "missing_fields", "source", "game_id", "scoring_complete", "scoring_missing", "strict_eligible", "era_scored_eligible",
                     "era_excluded_fields", "era_blocking_fields", "team_score_residual", "fpts_k_contract"]
        player_rows[pos] = rows

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
    def_rows = write_defenses(data_dir, out_dir, enrich)
    write_logs(out_dir, player_rows, def_rows)
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
