"""Write small per-position CSVs for Google Sheets (loaded with =IMPORTDATA from GitHub).

Usage: python build_sheets_csv.py ../data ../data/sheets

For each position with a pool (RB, WR), writes:
  <pos>_gamelogs.csv       one row per game, only the columns that position uses
  <pos>_season_totals.csv  one row per player per season (regular season only)
"""

import csv
import json
import os
import sys
from collections import defaultdict

COLUMNS = {
    "RB": ["rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds", "rec_td", "ret_td"],
    "WR": ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td", "ret_td"],
}
INFO = ["name", "season", "week", "date", "playoff", "team", "opp", "home_away", "result", "team_score", "opp_score"]
POINTS = ["fpts_std", "fpts_ppr"]


def main(data_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    players = {p["player_id"]: p for p in json.load(open(os.path.join(data_dir, "players.json")))}
    d = json.load(open(os.path.join(data_dir, "player_gamelogs.json")))
    games = [dict(zip(d["columns"], r)) for r in d["rows"]]

    for pos, stats in COLUMNS.items():
        rows = [g for g in games if g["pos"] == pos]
        cols = INFO + stats + POINTS + ["player_id"]
        with open(os.path.join(out_dir, f"{pos.lower()}_gamelogs.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for g in rows:
                w.writerow(["" if g[c] is None else g[c] for c in cols])

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
                    row[c] = "" if c == "targets" and season < 1992 else round(v, 2) if c in POINTS else int(v)
                w.writerow([row[c] for c in tcols])
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
