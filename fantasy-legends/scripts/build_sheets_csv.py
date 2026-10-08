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
import re
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

# Source codes used in the `source` column and the corrections logs.
#   PFR         Pro-Football-Reference, via the Kaggle scrape (zynicide/nfl-football-player-stats, Dec 2017)
#   NFLV1999    nflverse-data player_stats_1999 / play_by_play_1999, checked against the final score
#   RULE2PT     two_pt = 0 because the NFL had no two-point conversion before 1994
#   SCORE0      the team's recorded scoring plays add up to its final score, so no unrecorded play happened
#   SCORE2      they add up to 2 less in an NFL game before 1994, so the 2 is a safety
#   NOFGM       no field goal made, so 0 in every distance tier
#   UNRECORDED  the source shows 0 for a field it doesn't record in this era; blanked
#   INCOMPLETE  the source's own totals show the field is incomplete for this game; blanked
#   QUARANTINE  sources disagree, or the value can't be checked; blanked, originals kept in the log
#   SWAP        the source swaps two fields on every row; swapped back
#   DEDUPE      a duplicate or wrong-roster row dropped
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
GSIS = {}        # player_id -> nflverse id, for 1999 players


def track(g, fields, absent=()):
    """Remember source values before repair. Fields in `absent` don't exist in the source at all."""
    g["_orig"] = {c: ("absent" if c in absent else g.get(c)) for c in fields}
    g["_prov"] = {}


def setv(g, field, value, src, url, evidence):
    g[field] = value
    g["_prov"][field] = (src, url, evidence)


def recon_kind(g):
    """SCORE0: the team's recorded TDs, XPs, FGs and safeties add up to its whole final score, so no other
    scoring play happened. SCORE2: they add up to 2 less, before 1994 in an NFL game, with a recorded PAT
    attempt for every recorded TD (so the 2 can't be extra points the source missed): the 2 is a safety and
    no other unrecorded scoring play happened."""
    r = RECON.get((g["team"], g["date"]))
    if not r:
        return None, None
    season = g["season"]
    afl = 1960 <= season <= 1969 and (g["team"] in AFL_TEAMS or g["opp"] in AFL_TEAMS)
    if r["score_residual"] == 0:
        return "SCORE0", r
    if (r["score_residual"] == 2 and 1960 <= season < 1994 and not afl
            and r["recorded_xpa"] >= r["recorded_td"]):
        return "SCORE2", r
    return None, r


def recon_evidence(kind, r):
    td, xp, fg, sf = r["recorded_td"], r["recorded_xpm"], r["recorded_fgm"], r["safeties"]
    pts = 6 * td + xp + 3 * fg + 2 * sf
    plays = f"{td} TD + {xp} XP + {fg} FG" + (f" + {sf} safety" if sf else "")
    tail = "whole score" if kind == "SCORE0" else f"score minus a 2-pt safety ({r['recorded_xpa']} PAT attempts for {td} TD)"
    return f"{r['team']} scored {r['team_score']}; recorded {plays} = {pts} = {tail} (score_reconciliation.csv)"


def closure_1999(team, date, enrich):
    """1999 games in nflverse: do the play-by-play's scoring plays account for every point the main source's
    recorded plays leave unexplained? Returns ("closes" | "fails" | None, explanation)."""
    x = enrich["defense"].get(f"{date}|{team}")
    r = RECON.get((team, date))
    if x is None or r is None:
        return None, "game not in nflverse play-by-play"
    recorded = 6 * r["recorded_td"] + r["recorded_xpm"] + 3 * r["recorded_fgm"]
    tds = x["def_int_td"] + x["def_fum_td"] + x["st_other_td"] + x["off_fum_rec_td"]
    found = 6 * tds + 2 * (x["safeties"] + x["two_pt"])
    ok = r["team_score"] - recorded == found and x["ret_td"] == r["ret_td"]
    detail = (f"{team} scored {r['team_score']}; main source records {r['recorded_td']} TD + {r['recorded_xpm']} XP + "
              f"{r['recorded_fgm']} FG = {recorded}; play-by-play adds {tds} defensive/special-teams/fumble-recovery TD, "
              f"{x['safeties']} safety and {x['two_pt']} two-point conversion = {found}"
              + ("" if x["ret_td"] == r["ret_td"] else f"; return TDs differ (main source {r['ret_td']}, play-by-play {x['ret_td']})")
              + (" (every point accounted for)" if ok else " (doesn't add up)"))
    return ("closes" if ok else "fails"), detail


def match_gsis(players, ids, enrich):
    """Link each 1999 player to his nflverse id by birth date and name (names alone differ: nflverse has
    "Raghib Ismail" for Rocket Ismail). Falls back to exact name plus a shared 1999 team."""
    words = lambda n: set(re.split(r"[\s\-.']+", n.lower())) - {""}
    by_birth, by_name = defaultdict(list), defaultdict(list)
    for gsis, p in enrich["people"].items():
        by_birth[p["birth_date"]].append((gsis, p))
        by_name[p["name"]].append((gsis, p))
    for pid, teams in ids.items():
        name, birth = players[pid]["name"], players[pid]["birth_date"]
        same_day = by_birth.get(birth, []) if birth else []
        last = name.split()[-1].lower()
        for cands in ([c for c in same_day if c[1]["name"] == name],
                      [c for c in same_day if last in words(c[1]["name"])],
                      [c for c in same_day if len(words(c[1]["name"]) & words(name)) >= 2],
                      [c for c in by_name.get(name, []) if set(c[1]["teams"]) & teams]):
            if len(cands) == 1:
                GSIS[pid] = cands[0][0]
                break


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
    status = None
    if season < RETURNS_FIRST_SEASON and not g["ret_td"]:
        setv(g, "ret_td", None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no return data before 1960)")
    if season == 1999 and f"{date}|{team}" in enrich["team_games"]:
        status, detail = closure_1999(team, date, enrich)
        x = enrich["defense"][f"{date}|{team}"]
        gid = enrich["nflverse_game_ids"].get(f"{date}|{team}")
        gsis = GSIS.get(g["player_id"])
        found = enrich["players"].get(f"{gsis}|{date}", {})
        plays = enrich["evidence"]["players"].get(f"{gsis}|{date}", [])
        for c, team_total, label in (("two_pt", x["two_pt"], "two-point conversion"),
                                     ("fum_rec_td", x["off_fum_rec_td"], "offensive fumble-recovery TD")):
            if gsis:
                value = found.get(c, 0)
                ev = ("; ".join(p for p in plays if p.startswith(c + ":"))
                      or f"No {label} credited to this player (nflverse id {gsis}) in {gid}; {team} total {team_total}")
            elif team_total == 0:
                value, ev = 0, f"{team} had no {label} in {gid} (player not linked to an nflverse id)"
            else:
                CONFLICTS.append((g["pos"], g["player_id"], g["name"], game_id(g), c,
                                  f"player not linked to an nflverse id; {team} had {team_total} {label}(s) in {gid}"))
                continue
            if value == 0 and status != "closes":
                CONFLICTS.append((g["pos"], g["player_id"], g["name"], game_id(g), c, f"0 not confirmed: {detail}"))
                continue
            setv(g, c, value, "NFLV1999", NFLV_PBP_URL, f"{ev}. Score check: {detail}")
    elif season < 1994 and not afl_game:
        setv(g, "two_pt", 0, "RULE2PT", RULE2PT_URL, "The NFL had no two-point conversion before 1994")
    if kind and status != "fails":
        for c in ("two_pt", "fum_rec_td", "ret_td"):
            if g[c] is None:
                setv(g, c, 0, kind, RECON_URL, recon_evidence(kind, r))
    for c in ("two_pt", "fum_rec_td"):
        if g[c]:
            g["fpts_std"] = round(g["fpts_std"] + g[c] * (2 if c == "two_pt" else 6), 2)
            g["fpts_ppr"] = round(g["fpts_ppr"] + g[c] * (2 if c == "two_pt" else 6), 2)
    check = ("targets", "two_pt", "fum_rec_td", "ret_td") if g["pos"] != "QB" else ("sacked", "two_pt", "fum_rec_td", "ret_td")
    missing = [c for c in check if g[c] is None or blank(c, season, g[c])]
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
            "def_int_td", "def_fum_td", "ret_td", "st_other_td"),
}


def era_unrecorded(g, pos):
    """Scoring fields the source records for no game in this era. The era-scored option leaves these out
    for everyone in the era; anything else that's unknown still blocks the game."""
    season = g["season"]
    offense = {"fum_rec_td"} if season < 1999 else set()
    if season < RETURNS_FIRST_SEASON:
        offense.add("ret_td")
    afl = 1960 <= season <= 1969 and (g["team"] in AFL_TEAMS or g["opp"] in AFL_TEAMS)
    if afl or 1994 <= season <= 1998:
        offense.add("two_pt")
    if pos in ("QB", "RB", "WR", "TE"):
        return offense
    if pos == "K":
        # Distance tiers only exist for 1999. Before 1960 all kicking is unknown, which isn't excludable.
        return offense | ({"fgm_0_39", "fgm_40_49", "fgm_50p"} if KICK_FIRST_SEASON <= season < 1999 else set())
    fields = {"sacks"} if season < SACKS_FIRST_SEASON else set()
    if season < RETURNS_FIRST_SEASON:
        fields.add("ret_td")
    if season < 1999:
        fields |= {"fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td", "st_other_td"}
    return fields


def scoring_status(g, pos):
    """strict: every scoring field known. era-scored: unknowns limited to fields the era never records."""
    missing = [c for c in SCORING_FIELDS[pos] if g.get(c) is None]
    excluded = era_unrecorded(g, pos)
    era_missing = missing
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


MIN_OPP_PASS_ATT = 10  # fewer recorded opposing pass attempts than this can't confirm an interception count


def kicking_explained(g, r):
    """Is the team's kicking record complete for this game? Returns (makes known, PAT tries known, why not).
    Every way the leftover points R (final score minus recorded plays) could have been scored is tried:
    R = 6u + xm + 3fm + 2sf + 2c, with u unrecorded TDs, xm and fm unrecorded XP and FG makes, sf safeties
    (up to 2) and c successful two-point conversions (where they existed), and every TD, recorded or not,
    accounted for by a recorded PAT try, an unrecorded make, a two-point success, or no recorded try (n).
    Makes are known only when some reading fits and none needs a missing kick. PAT tries are known only
    when, in addition, no reading leaves a TD without a recorded try (it could be an unrecorded missed PAT)."""
    R, td, xpa = r["score_residual"], r["recorded_td"], r["recorded_xpa"]
    two_pt_era = g["season"] >= 1994 or (1960 <= g["season"] <= 1969 and (g["team"] in AFL_TEAMS or g["opp"] in AFL_TEAMS))
    base = (f"{g['team']} scored {r['team_score']}; the source records {td} TD + {r['recorded_xpm']} XP of {xpa} tried + "
            f"{r['recorded_fgm']} FG" + (f" + {r['safeties']} safety" if r["safeties"] else "") + f", leaving {R} points")
    readings = []
    for u in range(4):
        for fm in range(5):
            for xm in range(5):
                for sf in range(3):
                    for c in (range(3) if two_pt_era else (0,)):
                        n = td + u - xpa - xm - c
                        if 6 * u + xm + 3 * fm + 2 * sf + 2 * c == R and n >= 0:
                            readings.append((u, xm, fm, sf, c, n))
    if not readings:
        return False, False, base + " that no combination of unrecorded TDs, kicks and safeties accounts for, so this kicking line isn't complete"
    kick = next((x for x in readings if x[1] or x[2]), None)
    if kick:
        return False, False, (base + f"; they could include {kick[1]} unrecorded XP and {kick[2]} unrecorded FG, "
                              "so a kick may be missing from the source and this kicking line isn't complete")
    if any(x[5] for x in readings):
        return True, False, (base + "; every make is accounted for, but a TD may have had no recorded PAT try, so a missed "
                             "PAT may be unrecorded" + (" (or the team went for two)" if two_pt_era else ""))
    return True, True, ""


def repair_kicking(g, enrich):
    """Kicking inputs, after repair_scoring has handled the kicker's offense fields.
    - xpm/xpa are swapped back in build_data; logged here per row.
    - Before 1960 the source rarely records kicking. A recorded make stands; a 0 make counts only where the
      team's score reconciles (every make is then recorded). Attempts and misses can't be confirmed (a miss
      doesn't score), so they stay blank unless recorded.
    - fg_missed = fga - fgm (blocked attempts count as misses). xp_missed = xpa - xpm, blank where the team
      scored more TDs than the source records PAT attempts (a missed PAT may be unrecorded).
    - 1999: makes and attempts are compared with nflverse; where they disagree both are quarantined.
    - FG distance tiers: 0 when no field goal was made; 1999 from nflverse when its counts agree."""
    season, date = g["season"], g["date"]
    g["_orig"].update({"xpm": g["xpa"], "xpa": g["xpm"], "fgm": g["fgm"], "fga": g["fga"], "fg_missed": "absent",
                       "xp_missed": "absent", "fgm_0_39": "absent", "fgm_40_49": "absent", "fgm_50p": "absent"})
    if g["xpm"] != g["xpa"]:
        swap = "Source has extra points made and attempted swapped on every row (made > attempted in all 1,673 rows that differ)"
        g["_prov"]["xpm"] = g["_prov"]["xpa"] = ("SWAP", KAGGLE_URL, swap)
    for c in ("fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed", "xp_missed"):
        g[c] = None
    kind, r = recon_kind(g)
    k = None
    if season < KICK_FIRST_SEASON:
        for c in ("fgm", "xpm"):
            if g[c]:
                continue
            if kind == "SCORE0":
                setv(g, c, 0, "SCORE0", RECON_URL, recon_evidence(kind, r))
            else:
                setv(g, c, None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no kicking data before 1960)")
        for c in ("fga", "xpa"):
            if not g[c]:
                setv(g, c, None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no kicking data before 1960; "
                     "a miss doesn't score, so the final score can't show attempts)")
        for c in ("fg_missed", "xp_missed"):
            setv(g, c, None, "UNRECORDED", KAGGLE_URL,
                 "Kicking attempts aren't reliably recorded before 1960, so misses can't be confirmed")
    else:
        if season == 1999 and f"{date}|{g['team']}" in enrich["team_games"] and GSIS.get(g["player_id"]):
            gid = enrich["nflverse_game_ids"].get(f"{date}|{g['team']}")
            k = enrich["kickers"].get(f"{GSIS[g['player_id']]}|{date}", {})
            for made, att, label in (("xpm", "xpa", "XP"), ("fgm", "fga", "FG")):
                theirs = (k.get(made, 0), k.get(att, 0))
                if (g[made], g[att]) != theirs:
                    detail = (f"main source credits {g['name']} with {g[made]}/{g[att]} {label} made/attempted; nflverse "
                              f"play-by-play ({gid}) credits him with {theirs[0]}/{theirs[1]} (another kicker took some kicks)")
                    for c in (made, att):
                        setv(g, c, None, "QUARANTINE", NFLV_PBP_URL, "Sources disagree: " + detail)
                    CONFLICTS.append(("K", g["player_id"], g["name"], game_id(g), f"{made}/{att}", detail))
                else:
                    agree = f"Main source and nflverse play-by-play ({gid}) both credit him with {theirs[0]}/{theirs[1]} {label} made/attempted"
                    for c in (made, att):
                        src, url, ev = g["_prov"].get(c, ("PFR", NFLV_PBP_URL, ""))
                        setv(g, c, g[c], src, url, f"{ev}; {agree}" if ev else agree)
        line_ok, tries_ok, why = kicking_explained(g, r) if k is None and r else (True, True, "")
        if not line_ok:
            for c in ("xpm", "xpa", "fgm", "fga", "fg_missed", "xp_missed"):
                swapped = g["_prov"].get(c, ("",))[0] == "SWAP"
                setv(g, c, None, "INCOMPLETE", KAGGLE_URL,
                     ("Old value is from the source's swapped XP column (made and attempted are swapped on every row). "
                      if swapped else "") + why)
        else:
            if g["fgm"] is not None:
                g["fg_missed"] = g["fga"] - g["fgm"]
            else:
                setv(g, "fg_missed", None, "QUARANTINE", NFLV_PBP_URL, "FG made/attempted disputed (see conflicts.csv)")
            if g["xpm"] is None:
                setv(g, "xp_missed", None, "QUARANTINE", NFLV_PBP_URL, "XP made/attempted disputed (see conflicts.csv)")
            elif not tries_ok:
                setv(g, "xp_missed", None, "INCOMPLETE", KAGGLE_URL, why)
            else:
                g["xp_missed"] = g["xpa"] - g["xpm"]
    if g["fgm"] == 0:
        how = "Source records" if g["_prov"].get("fgm", ("",))[0] != "SCORE0" else "Score reconciliation shows"
        for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
            setv(g, c, 0, "NOFGM", KAGGLE_URL, f"{how} 0 FG made")
    elif g["fgm"] and k is not None:
        plays = [p for p in enrich["evidence"]["kickers"].get(f"{GSIS[g['player_id']]}|{date}", []) if "field goal" in p.lower()]
        for c in ("fgm_0_39", "fgm_40_49", "fgm_50p"):
            setv(g, c, k.get(c, 0), "NFLV1999", NFLV_PBP_URL, "; ".join(plays))
    if g["fgm"] is None or g["xpm"] is None:
        g["fpts_std"] = g["fpts_ppr"] = None
    missing = [c for c in ("fgm", "xpm", "fgm_0_39", "two_pt", "fum_rec_td", "ret_td") if g[c] is None]
    g["missing_fields"] = ";".join("fg_distance" if c == "fgm_0_39" else c for c in missing)
    g["complete"] = not missing
    g["source"] = "+".join(dict.fromkeys(["PFR"] + [v[0] for v in g["_prov"].values() if v[0] != "UNRECORDED"]))
    return g


def blank(column, season, value=None):
    """Stats the source doesn't record for early seasons, where it shows 0. A nonzero value (targets from a
    Super Bowl box score, say) is real and kept; season totals for those seasons stay blank."""
    era = (column == "targets" and season < 1992) or (column == "sacked" and season < 1982)
    return era and not value


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
            + 6 * (v("def_int_td") + v("def_fum_td") + v("ret_td") + v("st_other_td")))


def repair_defense(g, enrich):
    """Interceptions: kept only where defenders' and opposing passers' counts agree; disputed or uncheckable
    games are quarantined (blank) with both originals kept. Unrecorded zeros become blank; recorded nonzero
    values stay. 1999 extras from nflverse, checked against the final score. Score reconciliation supplies
    evidence-based defensive TD and safety values for other seasons."""
    g = dict(g, team_name=team_name(g["team"], g["season"]), def_int_defenders=g["def_int"],
             recorded_safeties=g["safeties"], sacks=g["sacks_recorded"])
    season = g["season"]
    track(g, ("sacks", "def_int", "safeties", "def_int_td", "def_fum_td", "st_other_td", "fum_rec", "blk_punt", "blk_fg",
              "blk_xp", "ret_td"), absent=("def_fum_td", "st_other_td", "fum_rec", "blk_punt", "blk_fg", "blk_xp"))
    if season < SACKS_FIRST_SEASON:
        setv(g, "sacks", None, "UNRECORDED", KAGGLE_URL, "Sacks weren't an official stat before 1982" + (
            f"; the source has sacks for only some players, so its team total ({g['sacks']}) is a partial count"
            if g["sacks"] else ", so the source's 0 isn't a real value"))
    if g["sacks"] is not None and (g["sacks"] * 2) != int(g["sacks"] * 2):
        CONFLICTS.append(("DEF", g["team"], g["team_name"], game_id(g), "sacks",
                          f"source total {g['sacks']} isn't a whole or half sack (kept as recorded)"))
    opp, att = g["opp_pass_int"], g["opp_pass_att"]
    if opp is None or (att or 0) < MIN_OPP_PASS_ATT:
        g["int_check"] = "unverified"
        setv(g, "def_int", None, "QUARANTINE", KAGGLE_URL,
             f"Defenders' logs record {g['def_int_defenders']} interceptions; the source has only {att or 0} pass attempts "
             f"for {g['opp']} in this game (fewer than {MIN_OPP_PASS_ATT}; its passer is probably missing from the source), "
             "so the passers' log can't confirm the count")
    elif g["opp_passer_gap"]:
        g["int_check"] = "unverified"
        setv(g, "def_int", None, "QUARANTINE", KAGGLE_URL,
             f"Defenders' logs record {g['def_int_defenders']} interceptions; {g['opp']}'s receivers caught more passes for "
             f"more yards than its recorded passers completed, so a passer is missing from the source and the passers' log "
             f"({opp} thrown) can't confirm the count")
    elif opp == g["def_int"]:
        g["int_check"] = "match"
        setv(g, "def_int", g["def_int"], "PFR", KAGGLE_URL,
             f"Defenders' logs and {g['opp']}'s passers' logs both record {opp} interceptions")
    else:
        g["int_check"] = "disputed"
        setv(g, "def_int", None, "QUARANTINE", KAGGLE_URL,
             f"Defenders' logs record {g['def_int_defenders']} interceptions; {g['opp']}'s passers' logs record {opp} thrown")
    for c in ("safeties", "def_int_td"):
        if not g[c]:
            setv(g, c, None, "UNRECORDED", KAGGLE_URL, UNRECORDED)
    for c in ("fum_rec", "blk_punt", "blk_fg", "blk_xp", "def_fum_td", "st_other_td"):
        g[c] = None
    if season < RETURNS_FIRST_SEASON and not g["ret_td"]:
        setv(g, "ret_td", None, "UNRECORDED", KAGGLE_URL, UNRECORDED + " (almost no return data before 1960)")
    kind, r = recon_kind(g)
    key = f"{g['date']}|{g['team']}"
    extra = enrich["defense"].get(key) if season == 1999 else None
    if extra is not None:
        status, detail = closure_1999(g["team"], g["date"], enrich)
        plays = enrich["evidence"]["defense"].get(key, [])
        gid = enrich["nflverse_game_ids"].get(key)
        if status != "closes":
            CONFLICTS.append(("DEF", g["team"], g["team_name"], game_id(g), "final score", detail))
        for c in ("fum_rec", "blk_punt", "blk_fg", "blk_xp", "safeties", "def_int_td", "def_fum_td", "st_other_td"):
            value = extra[c]
            ev = "; ".join(p for p in plays if p.startswith(c + ":")) or f"No qualifying play in nflverse play-by-play for {gid}"
            if c == "fum_rec" and extra.get("fum_rec_disputed"):
                lost = "; ".join(p for p in plays if p.startswith("fum_rec_disputed:"))
                detail_f = (f"{value} recovered opponent fumble(s), plus {extra['fum_rec_disputed']} the play-by-play marks lost "
                            f"with no recovering team (out of the end zone; nflverse player stats don't count it lost): {lost}")
                setv(g, c, None, "QUARANTINE", NFLV_PBP_URL, "Sources disagree: " + detail_f)
                CONFLICTS.append(("DEF", g["team"], g["team_name"], game_id(g), "fum_rec", detail_f))
                continue
            if c in ("safeties", "def_int_td", "def_fum_td", "st_other_td"):
                if value == 0 and status != "closes":
                    setv(g, c, None, "QUARANTINE", NFLV_PBP_URL, f"0 not confirmed: {detail}")
                    continue
                ev += f". Score check: {detail}"
            setv(g, c, value, "NFLV1999", NFLV_PBP_URL, ev)
        if extra["ret_td"] != g["ret_td"]:
            setv(g, "ret_td", None, "QUARANTINE", NFLV_PBP_URL,
                 f"Main source records {g['ret_td']} kick/punt return TDs, nflverse play-by-play {extra['ret_td']}")
            CONFLICTS.append(("DEF", g["team"], g["team_name"], game_id(g), "ret_td", f"main source {g['_orig']['ret_td']}, nflverse {extra['ret_td']}"))
    elif kind:
        ev = recon_evidence(kind, r)
        for c in ("def_int_td", "def_fum_td", "st_other_td", "ret_td"):
            if g[c] is None:
                setv(g, c, 0, kind, RECON_URL, ev)
        if g["safeties"] is None or kind == "SCORE2":
            setv(g, "safeties", (g["safeties"] or 0) + (kind == "SCORE2"), kind, RECON_URL, ev)
    g["def_td"] = g["def_int_td"] + g["def_fum_td"] if None not in (g["def_int_td"], g["def_fum_td"]) else None
    g["fpts_known"] = dst_points(g)
    g["fpts"] = g["fpts_known"] if all(g[c] is not None for c in SCORING_FIELDS["DEF"]) else None
    missing = [c for c in ("sacks", "def_int", "fum_rec", "safeties", "blk_punt", "def_int_td", "def_fum_td", "ret_td",
                           "st_other_td") if g[c] is None]
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
             "def_int_td", "def_fum_td", "def_td", "ret_td", "st_other_td"]
    cols = (["team_name", "team", "season", "week", "date", "playoff", "opp", "home_away", "result",
             "team_score", "pts_allowed"] + stats +
            ["fpts", "fpts_known", "int_check", "def_int_defenders", "opp_pass_int", "opp_pass_att", "recorded_td",
             "recorded_xpm", "recorded_xpa", "recorded_fgm", "recorded_safeties", "team_score_residual", "complete",
             "missing_fields", "source", "game_id", "scoring_complete", "scoring_missing", "strict_eligible",
             "era_scored_eligible", "era_excluded_fields", "era_blocking_fields"])
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
        t["ints_quarantined"] += g["int_check"] != "match"
    tcols = (["team_name", "team", "season", "games", "wins", "losses", "ties", "pts_allowed",
              "pts_allowed_per_game"] + stats + ["fpts", "fpts_per_game", "fpts_known", "ints_quarantined", "featured"])
    with open(os.path.join(out_dir, "def_season_totals.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(tcols)
        for (team, season), t in sorted(totals.items(), key=lambda kv: (kv[0][1], team_name(*kv[0]))):
            # Half sacks are real; round rather than truncate.
            row = {c: "" if t.get("unknown_" + c) else round(t.get(c, 0), 2) if c in ("sacks", "fpts", "fpts_known")
                   else int(t.get(c, 0))
                   for c in ["games", "wins", "losses", "ties", "pts_allowed", "fpts", "fpts_known", "ints_quarantined"] + stats}
            for c in ("sacks", "fpts", "fpts_known"):
                if row[c] != "" and row[c] == int(row[c]):
                    row[c] = int(row[c])
            row.update(team_name=team_name(team, season), team=team, season=season,
                       pts_allowed_per_game=round(t["pts_allowed"] / t["games"], 1),
                       fpts_per_game="" if t.get("unknown_fpts") else round(t["fpts"] / t["games"], 2),
                       featured=nick.get((team, season), ""))
            w.writerow([row[c] for c in tcols])
    return games


LOG_COLUMNS = ["game_id", "pos", "player_id", "name", "season", "field", "old_value", "new_value", "source",
               "source_url", "evidence"]


def change_rows(g, pos, ident):
    """One log row per field that was changed or checked against evidence: every value that differs from the
    source, and every value an evidence rule confirmed, including a 0 the source already showed."""
    out = []
    for field, old in g.get("_orig", {}).items():
        new = g.get(field)
        prov = g["_prov"].get(field)
        if prov is None and (old == new or old == "absent"):
            continue
        src, url, ev = prov or ("", "", "")
        out.append({"game_id": game_id(g), "pos": pos, "player_id": ident,
                    "name": g.get("name") or g.get("team_name"), "season": g["season"], "field": field,
                    "old_value": "not in source" if old == "absent" else ("" if old is None else old),
                    "new_value": "" if new is None else new, "source": src, "source_url": url, "evidence": ev})
    return out


def write_logs(out_dir, player_rows, def_rows, dedup_log):
    """corrections_log.csv (rules, dropped duplicate rows and pointers to the per-position logs, which have
    one row per changed or evidence-checked field), score_reconciliation.csv (the arithmetic behind
    SCORE0/SCORE2), conflicts.csv, unresolved_{players,defense}.csv (regular season, still missing a scoring
    field) and verified_replacements_<pos>.csv (Darius's merge format)."""
    groups = list(player_rows.items()) + [("DEF", def_rows)]
    pos_of = {g["player_id"]: pos for pos, rows in player_rows.items() for g in rows}
    with open(os.path.join(out_dir, "corrections_log.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LOG_COLUMNS)
        w.writeheader()
        rules = [
            ("QB", "pass_cmp/pass_att", "swapped", "swapped back", "SWAP",
             "Source has completions and attempts swapped on every row (cmp > att in all 36k passing games); not a scoring field"),
            ("RB/WR/TE", "targets", "0", "", "UNRECORDED",
             "Targets aren't recorded before 1992; a 0 is blanked, nonzero values (Super Bowl box scores) are kept; not a scoring field"),
            ("QB", "sacked", "0", "", "UNRECORDED",
             "Times sacked isn't recorded before 1982; a 0 is blanked, nonzero values are kept; not a scoring field"),
            ("K", "xpm/xpa", "swapped", "swapped back", "SWAP",
             "Source has extra points made and attempted swapped on every row (made > attempted in all 1,673 rows that "
             "differ); rows where the values differ are also logged one by one"),
            ("K", "fg_missed/xp_missed", "not in source", "fga - fgm / xpa - xpm", "PFR",
             "Derived from the source's attempts and makes (blocked kicks count as misses); exceptions are logged per row"),
        ]
        for pos, field, old, new, src, ev in rules:
            w.writerow({"game_id": "all", "pos": pos, "field": field, "old_value": old, "new_value": new,
                        "source": src, "source_url": KAGGLE_URL, "evidence": ev})
        for d in dedup_log:
            for r in d["dropped"]:
                w.writerow({"game_id": game_id({"date": r["date"], "home_away": r["home_away"], "team": r["team"], "opp": r["opp"]}),
                            "pos": pos_of.get(d["player_id"], ""), "player_id": d["player_id"], "name": d["player"],
                            "season": r["season"], "field": "row",
                            "old_value": f"listed for {r['team']} vs {r['opp']} on {r['date']} (game {r['game_number']})",
                            "new_value": "dropped", "source": "DEDUPE", "source_url": KAGGLE_URL, "evidence": d["reason"]})
        for pos, _ in groups:
            w.writerow({"game_id": "all", "pos": pos, "field": "every changed or checked field",
                        "source": "see file", "source_url": BRANCH_RAW + f"corrections_log_{pos.lower()}.csv",
                        "evidence": f"One row per changed or evidence-checked field for {pos}: corrections_log_{pos.lower()}.csv"})
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
                    "recorded_xpa", "recorded_fgm", "recorded_safeties", "recorded_points", "score_residual", "result"])
        for g in def_rows:
            r = RECON[(g["team"], g["date"])]
            kind, _ = recon_kind(g)
            pts = 6 * r["recorded_td"] + r["recorded_xpm"] + 3 * r["recorded_fgm"] + 2 * r["safeties"]
            if kind:
                result = kind
            elif r["score_residual"] < 0:
                result = "recorded plays exceed the score"
            elif r["score_residual"] == 2 and 1960 <= g["season"] < 1994:
                result = "2 unexplained points, but fewer PAT attempts than TDs recorded (or an AFL game)"
            else:
                result = "unexplained points"
            w.writerow([game_id(g), g["team"], g["season"], g["date"], g["playoff"], r["team_score"], r["recorded_td"],
                        r["recorded_xpm"], r["recorded_xpa"], r["recorded_fgm"], r["safeties"], pts, r["score_residual"], result])
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
    dedup_log = json.load(open(os.path.join(data_dir, "enrich", "dedup_log.json")))
    load_reconciliation(data_dir)
    teams_1999 = defaultdict(set)
    for g in games:
        if g["season"] == 1999:
            teams_1999[g["player_id"]].add(g["team"])
    match_gsis(players, teams_1999, enrich)
    print(f"1999 players linked to nflverse ids: {len(GSIS)} of {len(teams_1999)}; not linked: "
          + ", ".join(sorted(players[p]["name"] for p in teams_1999 if p not in GSIS)))
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
                    w.writerow(["" if g[c] is None or blank(c, g["season"], g[c]) else g[c] for c in cols])

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
    write_logs(out_dir, player_rows, def_rows, dedup_log)
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
