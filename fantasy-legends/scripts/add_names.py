"""Add player name and position columns to a game log CSV, matched on player_id.

Usage:
    python add_names.py player_gamelogs.csv players.json output.csv

Works on any CSV with a player_id column. Name and position are inserted right
after player_id (existing name/pos columns are replaced). Uses only the standard library.
"""

import csv
import json
import sys


def main(gamelogs_path, players_path, out_path):
    with open(players_path) as f:
        players = {str(p["player_id"]): p for p in json.load(f)}

    with open(gamelogs_path, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        columns = [c for c in reader.fieldnames if c not in ("name", "pos")]

    if "player_id" not in columns:
        sys.exit(f"{gamelogs_path} has no player_id column")
    i = columns.index("player_id") + 1
    columns[i:i] = ["name", "pos"]

    missing = set()
    for row in rows:
        p = players.get(row["player_id"])
        if p is None:
            missing.add(row["player_id"])
        row["name"] = p["name"] if p else ""
        row["pos"] = p["pos"] if p else ""

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {out_path}")
    if missing:
        print(f"No name found for player_id(s): {', '.join(sorted(missing))}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:4])
