"""Build the Fantasy Legends data files from the Pro-Football-Reference scrape on Kaggle.

Source: https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats
(scraped from pro-football-reference.com in Dec 2017 by github.com/zackthoutt/nfl-player-stats)

Usage:
    pip install ijson
    curl -L -o stats.zip https://www.kaggle.com/api/v1/datasets/download/zynicide/nfl-football-player-stats
    unzip stats.zip -d raw
    python build_data.py raw/games_*.json raw/profiles_*.json ../data
"""

import csv
import json
import os
import sys
from collections import defaultdict

import ijson

from legends import FEATURED_DEFENSES, LEGENDS, POOL_HALL_OF_FAMERS, POOLS

FIRST_SEASON, LAST_SEASON = 1950, 1999
TARGETS_FIRST_SEASON = 1992  # targets are blank in the source before this
SACKS_FIRST_SEASON = 1982  # sacks became an official stat in 1982

# AFL franchise codes (used 1960-1969, when the AFL played a 14-game schedule)
AFL_TEAMS = {"BOS", "BUF", "NYT", "NYJ", "HOU", "DEN", "DTX", "KAN", "LAC", "SDG", "OAK", "MIA", "CIN"}


def regular_season_games(season, team):
    """Length of the regular season; any later game number is a playoff game."""
    if season <= 1960:
        return 14 if season == 1960 and team in AFL_TEAMS else 12
    if season <= 1977:
        return 14
    if season == 1982:
        return 9
    if season == 1987:
        return 15
    return 16


def num(value):
    if value in (None, ""):
        return 0
    return float(value) if isinstance(value, float) or "." in str(value) else int(value)


def result(row):
    pf, pa = num(row["player_team_score"]), num(row["opponent_score"])
    return "T" if pf == pa else ("W" if pf > pa else "L")


def player_fantasy_points(g, ppr):
    pts = (
        g["pass_yds"] * 0.04 + g["pass_td"] * 4 - g["pass_int"] * 2
        + (g["rush_yds"] + g["rec_yds"]) * 0.1
        + (g["rush_td"] + g["rec_td"] + g["ret_td"]) * 6
        + g["fgm"] * 3 + g["xpm"]
        + g["rec"] * ppr
    )
    return round(pts, 2)


def dst_points_allowed_score(pa):
    if pa == 0:
        return 10
    if pa <= 6:
        return 7
    if pa <= 13:
        return 4
    if pa <= 20:
        return 1
    if pa <= 27:
        return 0
    if pa <= 34:
        return -1
    return -4


def dst_fantasy_points(d):
    return (
        dst_points_allowed_score(d["pts_allowed"])
        + (d["sacks"] or 0)
        + d["def_int"] * 2
        + d["safeties"] * 2
        + (d["def_int_td"] + d["ret_td"]) * 6
    )


PLAYER_COLUMNS = [
    "player_id", "name", "pos", "season", "week", "date", "playoff", "team", "opp", "home_away", "result",
    "team_score", "opp_score", "age",
    "pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "pass_rating", "sacked",
    "rush_att", "rush_yds", "rush_td",
    "targets", "rec", "rec_yds", "rec_td", "ret_td",
    "xpm", "xpa", "fgm", "fga",
    "fpts_std", "fpts_ppr",
]

DST_COLUMNS = [
    "team", "season", "week", "date", "playoff", "opp", "home_away", "result",
    "team_score", "pts_allowed", "sacks", "def_int", "def_int_td", "safeties", "ret_td", "fpts",
]


def main(games_path, profiles_path, out_dir):
    profiles = json.load(open(profiles_path))
    by_name = defaultdict(list)
    for p in profiles:
        by_name[p["name"].strip()].append(p)

    team_games = {}
    player_rows = defaultdict(list)
    candidate_ids = {p["player_id"] for n, *_ in LEGENDS for p in by_name.get(n, [])}
    pool_of = {}  # player_id -> pool position
    for p in profiles:
        tokens = (p["position"] or "").split("-")
        for tok in tokens:
            pos = next((k for k, pool in POOLS.items() if tok in pool["source_positions"]), None)
            if pos:
                if POOLS[pos]["min_career"] is not None:
                    pool_of[p["player_id"]] = pos
                break
    candidate_ids |= set(pool_of)

    with open(games_path, "rb") as f:
        for row in ijson.items(f, "item", use_float=True):
            season = int(row["year"])
            if not FIRST_SEASON <= season <= LAST_SEASON:
                continue
            week = int(row["game_number"])
            playoff = week > regular_season_games(season, row["team"])

            key = (row["team"], season, week)
            t = team_games.get(key)
            if t is None:
                t = team_games[key] = {
                    "team": row["team"], "season": season, "week": week, "date": row["date"],
                    "playoff": playoff, "opp": row["opponent"], "home_away": row["game_location"],
                    "result": result(row), "team_score": num(row["player_team_score"]),
                    "pts_allowed": num(row["opponent_score"]),
                    "sacks": 0, "def_int": 0, "def_int_td": 0, "safeties": 0, "ret_td": 0,
                }
            t["sacks"] += num(row["defense_sacks"])
            t["def_int"] += num(row["defense_interceptions"])
            t["def_int_td"] += num(row["defense_interception_touchdowns"])
            t["safeties"] += num(row["defense_safeties"])
            t["ret_td"] += num(row["kick_return_touchdowns"]) + num(row["punt_return_touchdowns"])

            if row["player_id"] in candidate_ids:
                player_rows[row["player_id"]].append((season, week, row, playoff))

    os.makedirs(out_dir, exist_ok=True)

    # --- players ---
    profile_by_id = {p["player_id"]: p for p in profiles}
    selected = []  # (profile, name, pos, hof, legend)
    for name, pos, hof in LEGENDS:
        candidates = [p for p in by_name.get(name, []) if player_rows.get(p["player_id"])]
        if not candidates:
            print(f"WARNING: no game logs found for {name}", file=sys.stderr)
            continue
        p = max(candidates, key=lambda c: len(player_rows[c["player_id"]]))
        selected.append((p, name, pos, hof, True))
    taken = {p["player_id"] for p, *_ in selected}
    pool_players = []
    for pid, pos in pool_of.items():
        pool = POOLS[pos]
        career = sum(num(r[2][pool["stat"]]) for r in player_rows.get(pid, []))
        if pid not in taken and career >= pool["min_career"]:
            p = profile_by_id[pid]
            name = p["name"].strip()
            pool_players.append((-career, (p, name, pos, name in POOL_HALL_OF_FAMERS, False)))
    selected += [entry for _, entry in sorted(pool_players, key=lambda x: x[0])]

    players, logs = [], []
    for p, name, pos, hof, legend in selected:
        rows = sorted(player_rows[p["player_id"]], key=lambda r: (r[0], r[1]))
        seasons = [r[0] for r in rows]
        teams = []
        for _, _, row, _ in rows:
            if row["team"] not in teams:
                teams.append(row["team"])
        players.append({
            "player_id": p["player_id"], "name": name, "pos": pos, "hof": hof, "legend": legend,
            "first_season": min(seasons), "last_season": max(seasons), "teams": teams,
            "college": p["college"], "birth_date": p["birth_date"],
            "draft_year": p["draft_year"], "draft_team": p["draft_team"],
        })
        for season, week, row, playoff in rows:
            g = {
                "player_id": p["player_id"], "name": name, "pos": pos, "season": season, "week": week, "date": row["date"],
                "playoff": playoff, "team": row["team"], "opp": row["opponent"],
                "home_away": row["game_location"], "result": result(row),
                "team_score": num(row["player_team_score"]), "opp_score": num(row["opponent_score"]),
                "age": row["age"],
                # The source scrape swaps these two fields on every row.
                "pass_cmp": num(row["passing_attempts"]), "pass_att": num(row["passing_completions"]),
                "pass_yds": num(row["passing_yards"]), "pass_td": num(row["passing_touchdowns"]),
                "pass_int": num(row["passing_interceptions"]), "pass_rating": num(row["passing_rating"]),
                "sacked": num(row["passing_sacks"]),
                "rush_att": num(row["rushing_attempts"]), "rush_yds": num(row["rushing_yards"]),
                "rush_td": num(row["rushing_touchdowns"]),
                "targets": num(row["receiving_targets"]) if season >= TARGETS_FIRST_SEASON else None,
                "rec": num(row["receiving_receptions"]), "rec_yds": num(row["receiving_yards"]),
                "rec_td": num(row["receiving_touchdowns"]),
                "ret_td": num(row["kick_return_touchdowns"]) + num(row["punt_return_touchdowns"]),
                "xpm": num(row["point_after_makes"]), "xpa": num(row["point_after_attemps"]),
                "fgm": num(row["field_goal_makes"]), "fga": num(row["field_goal_attempts"]),
            }
            g["fpts_std"] = player_fantasy_points(g, 0)
            g["fpts_ppr"] = player_fantasy_points(g, 1)
            logs.append(g)

    # --- team defenses ---
    featured = {(t, s): nick for t, s, nick in FEATURED_DEFENSES}
    dst = []
    for key in sorted(team_games, key=lambda k: (k[1], k[0], k[2])):
        d = team_games[key]
        if d["season"] < SACKS_FIRST_SEASON:
            d["sacks"] = None
        d["fpts"] = dst_fantasy_points(d)
        dst.append(d)
    defenses = []
    for (team, season), nick in featured.items():
        games = [d for d in dst if d["team"] == team and d["season"] == season and not d["playoff"]]
        if not games:
            print(f"WARNING: no games for featured defense {team} {season}", file=sys.stderr)
            continue
        defenses.append({
            "team": team, "season": season, "nickname": nick, "games": len(games),
            "pts_allowed": sum(g["pts_allowed"] for g in games),
            "def_int": sum(g["def_int"] for g in games),
            "sacks": None if season < SACKS_FIRST_SEASON else sum(g["sacks"] for g in games),
        })
    defenses.sort(key=lambda d: d["season"])

    # --- write ---
    def write_csv(path, columns, rows):
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(columns)
            for r in rows:
                w.writerow(["" if r[c] is None else r[c] for c in columns])

    def write_json(path, columns, rows):
        with open(path, "w") as f:
            json.dump({"columns": columns, "rows": [[r[c] for c in columns] for r in rows]},
                      f, separators=(",", ":"))

    with open(os.path.join(out_dir, "players.json"), "w") as f:
        json.dump(players, f, indent=1)
    with open(os.path.join(out_dir, "featured_defenses.json"), "w") as f:
        json.dump(defenses, f, indent=1)
    write_json(os.path.join(out_dir, "player_gamelogs.json"), PLAYER_COLUMNS, logs)
    write_csv(os.path.join(out_dir, "player_gamelogs.csv"), PLAYER_COLUMNS, logs)
    write_json(os.path.join(out_dir, "dst_gamelogs.json"), DST_COLUMNS, dst)
    write_csv(os.path.join(out_dir, "dst_gamelogs.csv"), DST_COLUMNS, dst)
    print(f"{len(players)} players, {len(logs)} player games, {len(dst)} team-defense games")


if __name__ == "__main__":
    main(*sys.argv[1:4])
