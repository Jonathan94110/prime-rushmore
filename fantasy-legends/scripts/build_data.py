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
from collections import Counter, defaultdict
from datetime import date

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
    "team_score", "pts_allowed", "sacks", "def_int", "opp_pass_int", "def_int_td", "safeties", "ret_td", "fpts",
    "recorded_td", "recorded_xpm", "recorded_xpa", "recorded_fgm", "score_residual", "opp_pass_att", "opp_passer_gap",
    "sacks_recorded",
]


STAT_PREFIXES = ("passing_", "rushing_", "receiving_", "kick_return_", "punt_return_", "defense_", "point_after_",
                 "field_goal_", "punting_")


def stats_of(r):
    """Every nonzero stat on a source row (punts and 0-for-N passing lines included)."""
    return {k: v for k, v in r[2].items() if k.startswith(STAT_PREFIXES) and num(v)}


def has_stats(r):
    return bool(stats_of(r))


def dropped_entry(r):
    return {"team": r[2]["team"], "opp": r[2]["opponent"], "home_away": r[2]["game_location"],
            "date": r[2]["date"], "season": r[0], "game_number": r[1], "stats": stats_of(r)}


def days_apart(a, b):
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def dedupe(rows, name, log):
    """Keep one row per player per game. The source sometimes lists a player for two teams in the same week:
    on the same date, or under the same game number a day or two apart (a mid-season move). Keep the row with
    stats, else the row whose team matches his games either side, else the team he played for most that
    season. Then drop a row with no stats for a team he played no other game for that season, sitting between
    two games for another team (the source lists him on the wrong roster). Every drop is logged."""
    rows = sorted(rows, key=lambda r: (r[2]["date"], r[1]))
    groups = []
    for r in rows:
        prev = groups[-1][-1] if groups else None
        if prev and (prev[2]["date"] == r[2]["date"]
                     or (prev[0] == r[0] and prev[1] == r[1] and days_apart(prev[2]["date"], r[2]["date"]) <= 3)):
            groups[-1].append(r)
        else:
            groups.append([r])
    out = []
    for i, same in enumerate(groups):
        if len(same) == 1:
            out.append(same[0])
            continue
        neighbours = set()
        for j in (i - 1, i + 1):
            if 0 <= j < len(groups) and groups[j][0][0] == same[0][0]:
                neighbours.update(r[2]["team"] for r in groups[j])
        with_stats = [r for r in same if has_stats(r)]
        matching = [r for r in same if r[2]["team"] in neighbours]
        season_teams = Counter(r[2]["team"] for r in rows if r[0] == same[0][0])
        counts = sorted((season_teams[r[2]["team"]] for r in same), reverse=True)
        if len(with_stats) == 1:
            keep, why = with_stats[0], "only row with stats"
        elif len(matching) == 1:
            keep, why = matching[0], "team he played for in the games either side"
        elif not with_stats and counts[0] == counts[1]:
            # No row has stats and nothing picks a team: drop them all rather than choose by row order.
            log.append({"player": name, "date": same[0][2]["date"], "kept_team": None, "player_id": same[0][2]["player_id"],
                        "dropped": [dropped_entry(r) for r in same],
                        "reason": f"listed for {len(same)} teams in game {same[0][1]} of {same[0][0]} with no stats on any row, "
                                  f"and neither the games either side nor his season ({counts[0]} games for each) "
                                  "says which team he played for; all dropped"})
            continue
        else:
            keep = max(same, key=lambda r: season_teams[r[2]["team"]])
            why = ("team he played for most that season" if counts[0] > counts[1] else
                   f"first-listed row (more than one row has stats and his season is tied, {counts[0]} games each)")
        out.append(keep)
        log.append({"player": name, "date": keep[2]["date"], "kept_team": keep[2]["team"],
                    "player_id": keep[2]["player_id"],
                    "dropped": [dropped_entry(r) for r in same if r is not keep],
                    "reason": f"listed for two teams in game {keep[1]} of {keep[0]}; kept the {why}"})
    kept = []
    for i, r in enumerate(out):
        before, after = out[i - 1] if i else None, out[i + 1] if i + 1 < len(out) else None
        season_teams = Counter(x[2]["team"] for x in out if x[0] == r[0])
        if (before and after and before[0] == r[0] == after[0] and before[2]["team"] == after[2]["team"] != r[2]["team"]
                and season_teams[r[2]["team"]] == 1 and not has_stats(r)):
            log.append({"player": name, "date": r[2]["date"], "kept_team": None, "player_id": r[2]["player_id"],
                        "dropped": [dropped_entry(r)],
                        "reason": f"row with no stats for {r[2]['team']}, his only {r[2]['team']} game in {r[0]}, "
                                  f"between games for {before[2]['team']} ({before[2]['date']}, {after[2]['date']})"})
            continue
        kept.append(r)
    return sorted(kept, key=lambda r: (r[0], r[1]))


def main(games_path, profiles_path, out_dir):
    profiles = json.load(open(profiles_path))
    by_name = defaultdict(list)
    for p in profiles:
        by_name[p["name"].strip()].append(p)

    team_games = {}
    player_rows = defaultdict(list)
    pool_of = {}  # player_id -> pool position, from the first listed position that has a pool
    for p in profiles:
        for tok in (p["position"] or "").split("-"):
            pos = next((k for k, pool in POOLS.items() if tok in pool.get("source_positions", ())), None)
            if pos:
                pool_of[p["player_id"]] = pos
                break

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
                    "sacks": 0, "def_int": 0, "def_int_td": 0, "safeties": 0, "ret_td": 0, "int_thrown": 0,
                    "pass_att": 0, "pass_cmp": 0, "pass_yds": 0, "rec": 0, "rec_yds": 0, "recorded_td": 0, "recorded_xpm": 0, "recorded_xpa": 0, "recorded_fgm": 0,
                }
            t["sacks"] += num(row["defense_sacks"])
            t["def_int"] += num(row["defense_interceptions"])
            t["def_int_td"] += num(row["defense_interception_touchdowns"])
            t["safeties"] += num(row["defense_safeties"])
            t["ret_td"] += num(row["kick_return_touchdowns"]) + num(row["punt_return_touchdowns"])
            t["int_thrown"] += num(row["passing_interceptions"])
            t["pass_att"] += num(row["passing_completions"])  # attempts (swapped in the source)
            t["pass_cmp"] += num(row["passing_attempts"])  # completions (swapped in the source)
            t["pass_yds"] += num(row["passing_yards"])
            t["rec"] += num(row["receiving_receptions"])
            t["rec_yds"] += num(row["receiving_yards"])
            # Every scoring play the source records for this team, summed over all its players, for
            # reconciling against the final score. XP made sits in point_after_attemps and XP attempted in
            # point_after_makes (swapped in the source). Safeties are in `safeties`.
            t["recorded_td"] += (num(row["rushing_touchdowns"]) + num(row["receiving_touchdowns"])
                                 + num(row["kick_return_touchdowns"]) + num(row["punt_return_touchdowns"])
                                 + num(row["defense_interception_touchdowns"]))
            t["recorded_xpm"] += num(row["point_after_attemps"])
            t["recorded_xpa"] += num(row["point_after_makes"])
            t["recorded_fgm"] += num(row["field_goal_makes"])

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
    for pos, pool in POOLS.items():
        if pool.get("any_position"):
            pids = [pid for pid in player_rows if pid in profile_by_id]
        else:
            pids = [pid for pid, p in pool_of.items() if p == pos]
        pool_players = []
        for pid in pids:
            career = sum(num(r[2][pool["stat"]]) for r in player_rows.get(pid, []))
            if pid not in taken and career >= pool["min_career"]:
                p = profile_by_id[pid]
                name = p["name"].strip()
                pool_players.append((-career, (p, name, pos, name in POOL_HALL_OF_FAMERS, False)))
                taken.add(pid)
        selected += [entry for _, entry in sorted(pool_players, key=lambda x: x[0])]

    players, logs, dedup_log = [], [], []
    for p, name, pos, hof, legend in selected:
        rows = dedupe(sorted(player_rows[p["player_id"]], key=lambda r: (r[0], r[1])), name, dedup_log)
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
                # Targets aren't recorded before 1992 (the source shows 0); nonzero values there come from
                # Super Bowl box scores and are kept.
                "targets": num(row["receiving_targets"]) if season >= TARGETS_FIRST_SEASON or num(row["receiving_targets"]) else None,
                "rec": num(row["receiving_receptions"]), "rec_yds": num(row["receiving_yards"]),
                "rec_td": num(row["receiving_touchdowns"]),
                "ret_td": num(row["kick_return_touchdowns"]) + num(row["punt_return_touchdowns"]),
                # Also swapped in the source.
                "xpm": num(row["point_after_attemps"]), "xpa": num(row["point_after_makes"]),
                "fgm": num(row["field_goal_makes"]), "fga": num(row["field_goal_attempts"]),
            }
            g["fpts_std"] = player_fantasy_points(g, 0)
            g["fpts_ppr"] = player_fantasy_points(g, 1)
            logs.append(g)

    # --- team defenses ---
    featured = {(t, s): nick for t, s, nick in FEATURED_DEFENSES}
    dst = []
    by_team_date = {(t["team"], t["date"]): t for t in team_games.values()}
    for key in sorted(team_games, key=lambda k: (k[1], k[0], k[2])):
        d = team_games[key]
        # Interceptions thrown and passes attempted by the opponent's passers in this game, to cross-check def_int.
        opp_game = by_team_date.get((d["opp"], d["date"]))
        d["opp_pass_int"] = opp_game["int_thrown"] if opp_game else None
        d["opp_pass_att"] = opp_game["pass_att"] if opp_game else None
        # The opponent's catches outrunning its passers' completions means a passer is missing from the source.
        d["opp_passer_gap"] = (opp_game["rec"] > opp_game["pass_cmp"] and opp_game["rec_yds"] > opp_game["pass_yds"]
                               if opp_game else None)
        # Final score minus every recorded scoring play. 0 means the recorded plays explain the whole score.
        d["score_residual"] = d["team_score"] - (6 * d["recorded_td"] + d["recorded_xpm"] + 3 * d["recorded_fgm"]
                                                 + 2 * d["safeties"])
        # Before 1982 the source has sacks for only a few players, so a team total would be a partial count.
        d["sacks_recorded"] = d["sacks"]
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
    os.makedirs(os.path.join(out_dir, "enrich"), exist_ok=True)
    with open(os.path.join(out_dir, "enrich", "dedup_log.json"), "w") as f:
        json.dump(dedup_log, f, indent=1)
    with open(os.path.join(out_dir, "featured_defenses.json"), "w") as f:
        json.dump(defenses, f, indent=1)
    write_json(os.path.join(out_dir, "player_gamelogs.json"), PLAYER_COLUMNS, logs)
    write_csv(os.path.join(out_dir, "player_gamelogs.csv"), PLAYER_COLUMNS, logs)
    write_json(os.path.join(out_dir, "dst_gamelogs.json"), DST_COLUMNS, dst)
    write_csv(os.path.join(out_dir, "dst_gamelogs.csv"), DST_COLUMNS, dst)
    print(f"{len(players)} players, {len(logs)} player games, {len(dst)} team-defense games")


if __name__ == "__main__":
    main(*sys.argv[1:4])
