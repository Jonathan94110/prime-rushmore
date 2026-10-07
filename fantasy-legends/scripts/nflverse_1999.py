"""Extract 1999 two-point conversions and offensive fumble-recovery TDs from nflverse.

nflverse (github.com/nflverse/nflverse-data) starts in 1999, the last season of this dataset.

Usage:
    curl -L -o ps1999.csv https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_1999.csv
    curl -L -o pbp1999.csv.gz https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.csv.gz
    python nflverse_1999.py ps1999.csv pbp1999.csv.gz ../data/enrich/nflverse_1999.json

Output:
  team_games: {"<date>|<team>": successful two-point conversions by that team in that game}
  players:    {"<full name>|<date>": {"two_pt": n, "fum_rec_td": n}} (only players with a nonzero value)
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


def main(ps_path, pbp_path, out_path):
    ids_to_name = {}
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
                   "team_games": team_two_pt, "players": players}, f, indent=1, sort_keys=True)
    print(f"{len(team_two_pt)} team-games, {len(players)} player-games with 2-pt or fumble-recovery TDs")


if __name__ == "__main__":
    main(*sys.argv[1:4])
