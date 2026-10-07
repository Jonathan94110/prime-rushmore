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
  evidence:   play-by-play descriptions behind every counted event; nflverse_game_ids: "<date>|<team>" -> game id
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
    # Supporting evidence: the play-by-play description of every event counted, plus nflverse game ids.
    evidence = {"players": defaultdict(list), "kickers": defaultdict(list), "defense": defaultdict(list)}
    nflv_game = {}
    week_date = {}  # (season_type, week, team) -> date
    team_two_pt = defaultdict(int)
    fum_rec_td = defaultdict(int)  # (gsis id, date)

    for p in csv.DictReader(open(ps_path)):
        ids_to_name[p["player_id"]] = p["player_display_name"]

    for row in csv.DictReader(gzip.open(pbp_path, "rt")):
        if not row["game_date"] or not row["home_team"]:
            continue
        date = row["game_date"]
        play = f"{row['game_id']} play {row['play_id']}: {row['desc']}"
        for side in ("home_team", "away_team"):
            week_date[(row["season_type"], row["week"], pfr(row[side]))] = date
            team_two_pt.setdefault(f"{date}|{pfr(row[side])}", 0)
            nflv_game[f"{date}|{pfr(row[side])}"] = row["game_id"]
        if row["two_point_conv_result"] == "success" and row["posteam"]:
            team_two_pt[f"{date}|{pfr(row['posteam'])}"] += 1
        d = row["defteam"] and f"{date}|{pfr(row['defteam'])}"
        if d:
            defense[d]  # every team-game appears, even with all zeros
        if row["field_goal_attempt"] == "1" and row["kicker_player_id"]:
            kkey = f"{ids_to_name.get(row['kicker_player_id'], row['kicker_player_name'])}|{date}"
            k = kickers[kkey]
            k["fga"] += 1
            if row["field_goal_result"] == "made":
                dist = int(float(row["kick_distance"]))
                k["fgm"] += 1
                k["fgm_0_39" if dist < 40 else "fgm_40_49" if dist < 50 else "fgm_50p"] += 1
            else:
                k["fg_missed"] += 1
            evidence["kickers"][kkey].append(play)
        if row["extra_point_attempt"] == "1" and row["kicker_player_id"]:
            kkey = f"{ids_to_name.get(row['kicker_player_id'], row['kicker_player_name'])}|{date}"
            k = kickers[kkey]
            k["xpa"] += 1
            k["xpm"] += row["extra_point_result"] == "good"
            if row["extra_point_result"] != "good":
                evidence["kickers"][kkey].append(play)
        if d:
            for field, hit in (("blk_punt", row["punt_blocked"] == "1"),
                               ("blk_fg", row["field_goal_result"] == "blocked"),
                               ("blk_xp", row["extra_point_result"] == "blocked"),
                               ("fum_rec", row["play_type"] in ("pass", "run") and row["fumble_lost"] == "1")):
                if hit:
                    defense[d][field] += 1
                    evidence["defense"][d].append(f"{field}: {play}")
            if row["touchdown"] == "1" and row["td_team"] == row["defteam"] and row["play_type"] in ("pass", "run"):
                field = "def_int_td" if row["interception"] == "1" else "def_fum_td"
                defense[d][field] += 1
                evidence["defense"][d].append(f"{field}: {play}")
        if row["safety"] == "1" and row["posteam"]:
            # Two points go to the team without the ball at the end of the play: the defense, unless
            # possession changed on the play (an interception or lost fumble), when the original offense scores.
            turnover = row["interception"] == "1" or row["fumble_lost"] == "1"
            scorer = row["posteam"] if turnover else row["defteam"]
            sd = f"{date}|{pfr(scorer)}"
            defense[sd]["safeties"] += 1
            evidence["defense"][sd].append(f"safeties: {play}")
        # Offense recovers its own fumble on a scrimmage play and that player scores. Kick and punt returns
        # are excluded: the main source already counts those as return TDs.
        if (row["touchdown"] == "1" and row["posteam"] and row["play_type"] in ("pass", "run")
                and row["fumble_recovery_1_team"] == row["posteam"]
                and row["td_team"] == row["posteam"]
                and row["td_player_id"] == row["fumble_recovery_1_player_id"]):
            fum_rec_td[(row["td_player_id"], date)] += 1
            evidence["players"][f"{ids_to_name.get(row['td_player_id'], row['td_player_id'])}|{date}"].append(f"fum_rec_td: {play}")
        if row["two_point_conv_result"] == "success":
            for pid_col in ("passer_player_id", "rusher_player_id", "receiver_player_id"):
                if row.get(pid_col):
                    evidence["players"][f"{ids_to_name.get(row[pid_col], row[pid_col])}|{date}"].append(f"two_pt: {play}")

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
                   "team_games": team_two_pt, "players": players, "kickers": kickers, "defense": defense,
                   "nflverse_game_ids": nflv_game, "evidence": evidence},
                  f, indent=1, sort_keys=True)
    print(f"{len(team_two_pt)} team-games, {len(players)} player-games with 2-pt or fumble-recovery TDs")


if __name__ == "__main__":
    main(*sys.argv[1:5])
