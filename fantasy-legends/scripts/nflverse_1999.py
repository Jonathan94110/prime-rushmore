"""Extract 1999 two-point conversions and offensive fumble-recovery TDs from nflverse.

nflverse (github.com/nflverse/nflverse-data) starts in 1999, the last season of this dataset.

Usage:
    curl -L -o ps1999.csv https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_1999.csv
    curl -L -o pbp1999.csv.gz https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.csv.gz
    curl -L -o players.csv https://github.com/nflverse/nflverse-data/releases/download/players/players.csv
    python nflverse_1999.py ps1999.csv pbp1999.csv.gz players.csv ../data/enrich/nflverse_1999.json

Output:
  team_games: {"<date>|<team>": successful two-point conversions by that team in that game}
  players:    {"<full name>|<date>": {"two_pt": n, "fum_rec_td": n}} (only players with a nonzero value)
  kickers:    {"<full name>|<date>": field goals made by distance, misses, extra points}
  defense:    {"<date>|<team>": fumble recoveries, safeties, blocked punts/FGs/PATs, defensive TDs by type}
Team codes are converted to Pro-Football-Reference codes.
"""

import csv
import gzip
import json
import os
import sys
from collections import defaultdict

NFLVERSE_TO_PFR = {"GB": "GNB", "KC": "KAN", "NE": "NWE", "NO": "NOR", "SD": "SDG", "LAC": "SDG",
                   "SF": "SFO", "TB": "TAM", "LA": "STL", "LV": "OAK"}


def pfr(team):
    return NFLVERSE_TO_PFR.get(team, team)


def main(ps_path, pbp_path, players_path, out_path):
    ids_to_name = {p["gsis_id"]: p["display_name"] for p in csv.DictReader(open(players_path)) if p["gsis_id"]}
    kickers = defaultdict(lambda: defaultdict(int))
    defense = defaultdict(lambda: defaultdict(int))
    week_date = {}  # (season_type, week, team) -> date
    team_two_pt = defaultdict(int)
    fum_rec_td = defaultdict(int)  # (gsis id, date)

    for p in csv.DictReader(open(ps_path)):
        ids_to_name[p["player_id"]] = p["player_display_name"]

    for row in csv.DictReader(gzip.open(pbp_path, "rt")):
        if not row["game_date"] or not row["home_team"]:
            continue
        date = row["game_date"]
        for side in ("home_team", "away_team"):
            week_date[(row["season_type"], row["week"], pfr(row[side]))] = date
            team_two_pt.setdefault(f"{date}|{pfr(row[side])}", 0)
        if row["two_point_conv_result"] == "success" and row["posteam"]:
            team_two_pt[f"{date}|{pfr(row['posteam'])}"] += 1
        d = row["defteam"] and f"{date}|{pfr(row['defteam'])}"
        if d:
            defense[d]  # every team-game appears, even with all zeros
        if row["field_goal_attempt"] == "1" and row["kicker_player_id"]:
            k = kickers[f"{ids_to_name.get(row['kicker_player_id'], row['kicker_player_name'])}|{date}"]
            k["fga"] += 1
            if row["field_goal_result"] == "made":
                dist = int(float(row["kick_distance"]))
                k["fgm"] += 1
                k["fgm_0_39" if dist < 40 else "fgm_40_49" if dist < 50 else "fgm_50p"] += 1
            else:
                k["fg_missed"] += 1
        if row["extra_point_attempt"] == "1" and row["kicker_player_id"]:
            k = kickers[f"{ids_to_name.get(row['kicker_player_id'], row['kicker_player_name'])}|{date}"]
            k["xpa"] += 1
            k["xpm"] += row["extra_point_result"] == "good"
        if d:
            if row["punt_blocked"] == "1":
                defense[d]["blk_punt"] += 1
            if row["field_goal_result"] == "blocked":
                defense[d]["blk_fg"] += 1
            if row["extra_point_result"] == "blocked":
                defense[d]["blk_xp"] += 1
            if row["safety"] == "1":
                defense[d]["safeties"] += 1
            if row["play_type"] in ("pass", "run") and row["fumble_lost"] == "1":
                defense[d]["fum_rec"] += 1
            if row["touchdown"] == "1" and row["td_team"] == row["defteam"] and row["play_type"] in ("pass", "run"):
                defense[d]["def_int_td" if row["interception"] == "1" else "def_fum_td"] += 1
        # Offense recovers its own fumble and that player scores.
        if (row["touchdown"] == "1" and row["posteam"] and row["fumble_recovery_1_team"] == row["posteam"]
                and row["td_team"] == row["posteam"]
                and row["td_player_id"] == row["fumble_recovery_1_player_id"]):
            fum_rec_td[(row["td_player_id"], date)] += 1

    players = defaultdict(lambda: {"two_pt": 0, "fum_rec_td": 0})
    for p in csv.DictReader(open(ps_path)):
        n = sum(int(float(p[k] or 0)) for k in
                ("passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions"))
        if n:
            date = week_date[(p["season_type"], p["week"], pfr(p["recent_team"]))]
            players[f"{p['player_display_name']}|{date}"]["two_pt"] += n
    for (gsis, date), n in fum_rec_td.items():
        players[f"{ids_to_name.get(gsis, gsis)}|{date}"]["fum_rec_td"] += n

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"source": "nflverse-data player_stats_1999 and play_by_play_1999",
                   "team_games": team_two_pt, "players": players, "kickers": kickers, "defense": defense},
                  f, indent=1, sort_keys=True)
    print(f"{len(team_two_pt)} team-games, {len(players)} player-games with 2-pt or fumble-recovery TDs")


if __name__ == "__main__":
    main(*sys.argv[1:5])
