#!/usr/bin/env python3
"""Build the prototype's compact game data (SPEC.md section 1).

Reads the repaired decade CSVs in fantasy-legends/data/sheets and writes:
  data/players.json
  data/games_{qb,rb,wr,te,k,def}.json

players.json also carries `dataVersion`: the first 12 hex digits of a SHA-256 over every games
file and the players list, so a saved league can tell when the data has been rebuilt since it
was played.

Rules (from SPEC.md):
  * decade files only (*_gamelogs_1960s..1990s.csv); the full *_gamelogs.csv files repeat the same rows
  * regular season only (playoff == "False"), seasons 1960-1999
  * a blank CSV cell is unknown and becomes null; unknowns are never turned into 0
  * numbers stay numbers; `source` is copied as-is
  * DEF players are franchises keyed by team code and season

Usage: python3 build_data.py [SHEETS_DIR] [OUT_DIR]
"""
import csv
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.normpath(os.path.join(HERE, "..", "data", "sheets"))
DEFAULT_OUT = os.path.join(HERE, "data")

DECADES = ["1960s", "1970s", "1980s", "1990s"]
FIRST_SEASON, LAST_SEASON = 1960, 1999
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]

COMMON = ["pid", "game_id", "season", "date", "team", "opp", "home_away", "result",
          "team_score", "opp_score", "team_game", "source"]
OFFENSE = ["pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "rush_att", "rush_yds", "rush_td",
           "rec", "rec_yds", "rec_td", "ret_td", "two_pt", "fum_rec_td"]
KICKER = ["fgm", "fga", "fg_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "xpm", "xpa"]
DEFENSE = ["team_name", "pts_allowed", "sacks", "def_int", "int_verified", "fum_rec", "safeties", "blk_punt",
           "blk_fg", "blk_xp", "def_int_td", "def_fum_td", "ret_td"]

COLUMNS = {
    "QB": COMMON + OFFENSE, "RB": COMMON + OFFENSE, "WR": COMMON + OFFENSE, "TE": COMMON + OFFENSE,
    "K": COMMON + KICKER, "DEF": COMMON + DEFENSE,
}

# Output columns that hold text; every other column (except pid and int_verified) is numeric.
TEXT_COLUMNS = {"game_id", "date", "team", "opp", "home_away", "result", "source", "team_name"}

# Output column -> CSV column, where the names differ.
#   team_game: the CSV `week` column is the team's game number that season, not the NFL week.
#   DEF opp_score: the DEF CSVs have no opp_score column; their pts_allowed is the opponent's final score
#   (data/README.md). The check script confirms it equals the opponent's own team_score for every game.
RENAMES = {"team_game": "week"}
DEF_RENAMES = {"team_game": "week", "opp_score": "pts_allowed"}

INT_RE = re.compile(r"^-?\d+$")
FLOAT_RE = re.compile(r"^-?(\d+\.\d*|\.\d+)$")


class DataError(Exception):
    pass


def parse_number(text, where):
    """Blank -> None (unknown). Integer text -> int. Decimal text -> float, written as an int when whole."""
    if text == "":
        return None
    if INT_RE.match(text):
        return int(text)
    if FLOAT_RE.match(text):
        value = float(text)
        return int(value) if value.is_integer() else value
    raise DataError(f"{where}: expected a number, got {text!r}")


def franchise_key(code, season):
    """DEF franchise key from team code and season (SPEC.md section 1 table)."""
    if code == "BAL":
        if season <= 1983:
            return "colts"
        if season >= 1996:
            return "ravens"
        raise DataError(f"BAL in {season}: no franchise rule covers it")
    if code == "STL":
        if season <= 1987:
            return "cardinals"
        if season >= 1995:
            return "rams"
        raise DataError(f"STL in {season}: no franchise rule covers it")
    fixed = {
        "IND": "colts",
        "PHO": "cardinals", "ARI": "cardinals",
        "RAM": "rams",
        "OAK": "raiders", "RAI": "raiders",
        "HOU": "oilers", "TEN": "oilers",
        "BOS": "patriots", "NWE": "patriots",
        "NYT": "jets", "NYJ": "jets",
        "DTX": "chiefs", "KAN": "chiefs",
        "LAC": "chargers", "SDG": "chargers",
    }
    if code in fixed:
        return fixed[code]
    if not re.match(r"^[A-Z]{2,3}$", code):
        raise DataError(f"unexpected team code {code!r}")
    return code.lower()


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames
        rows = list(reader)
    return header, rows


def load_flags(src, pos):
    """player_id -> (hof, legend) from <pos>_season_totals.csv. DEF totals have no such columns."""
    path = os.path.join(src, f"{pos.lower()}_season_totals.csv")
    _, rows = read_csv(path)
    flags = {}
    for r in rows:
        pid = r["player_id"]
        pair = []
        for col in ("hof", "legend"):
            if r[col] not in ("True", "False"):
                raise DataError(f"{path}: player {pid} has {col}={r[col]!r}")
            pair.append(r[col] == "True")
        pair = tuple(pair)
        if pid in flags and flags[pid] != pair:
            raise DataError(f"{path}: player {pid} has inconsistent hof/legend flags across seasons")
        flags[pid] = pair
    return flags


def build_position(src, pos):
    """Return (columns, rows, player_info) for one position."""
    columns = COLUMNS[pos]
    renames = DEF_RENAMES if pos == "DEF" else RENAMES
    out_rows = []
    seen = set()
    for decade in DECADES:
        path = os.path.join(src, f"{pos.lower()}_gamelogs_{decade}.csv")
        header, rows = read_csv(path)
        present = set(header)
        for line_no, r in enumerate(rows, start=2):
            where = f"{os.path.basename(path)}:{line_no}"
            if r["playoff"] not in ("True", "False"):
                raise DataError(f"{where}: playoff={r['playoff']!r}")
            if r["playoff"] != "False":
                continue
            season = parse_number(r["season"], where)
            if season is None or not (FIRST_SEASON <= season <= LAST_SEASON):
                continue
            if pos == "DEF":
                pid = f"DEF-{franchise_key(r['team'], season)}"
            else:
                if r["player_id"] == "":
                    raise DataError(f"{where}: blank player_id")
                pid = f"{pos}-{r['player_id']}"
            key = (pid, r["game_id"])
            if key in seen:
                raise DataError(f"{where}: duplicate game {key}")
            seen.add(key)

            row = []
            for col in columns:
                if col == "pid":
                    row.append(pid)
                    continue
                if col == "int_verified":
                    if "int_check" not in present:
                        raise DataError(f"{path}: no int_check column")
                    row.append(r["int_check"] == "match")
                    continue
                csv_col = renames.get(col, col)
                if csv_col not in present:
                    if col in COMMON:
                        raise DataError(f"{path}: missing common column {csv_col}")
                    row.append(None)  # the position's CSV has no such column: unknown
                    continue
                text = r[csv_col]
                if col in TEXT_COLUMNS:
                    row.append(text if text != "" else None)
                else:
                    row.append(parse_number(text, f"{where} {csv_col}"))
            out_rows.append((row, r))

    # Chronological per player: sort by pid, then date, then game_id.
    ci = {c: i for i, c in enumerate(columns)}
    out_rows.sort(key=lambda t: (t[0][ci["pid"]], t[0][ci["date"]], t[0][ci["game_id"]]))

    flags = load_flags(src, pos) if pos != "DEF" else None
    players = {}
    for row, raw in out_rows:
        pid = row[ci["pid"]]
        season = row[ci["season"]]
        team = row[ci["team"]]
        p = players.get(pid)
        if p is None:
            if pos == "DEF":
                hof, legend = False, False
            else:
                if raw["player_id"] not in flags:
                    raise DataError(f"{pos} player {raw['player_id']} ({raw['name']}) not in season totals")
                hof, legend = flags[raw["player_id"]]
            p = players[pid] = {"id": pid, "name": None, "pos": pos, "hof": hof, "legend": legend,
                                "first": season, "last": season, "teams": []}
        # Rows are in date order, so the last name seen is the most recent one.
        p["name"] = raw["team_name"] if pos == "DEF" else raw["name"]
        p["first"] = min(p["first"], season)
        p["last"] = max(p["last"], season)
        if team not in p["teams"]:
            p["teams"].append(team)
    return columns, [row for row, _ in out_rows], players


def to_json(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def dump(obj, path):
    text = to_json(obj)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    return len(text.encode("utf-8"))


def main(argv):
    src = argv[1] if len(argv) > 1 else DEFAULT_SRC
    out = argv[2] if len(argv) > 2 else DEFAULT_OUT
    os.makedirs(out, exist_ok=True)

    all_players = []
    summary = []
    fingerprint = hashlib.sha256()
    for pos in POSITIONS:
        columns, rows, players = build_position(src, pos)
        name = f"games_{pos.lower()}.json"
        games = {"columns": columns, "rows": rows}
        size = dump(games, os.path.join(out, name))
        fingerprint.update((name + "\n" + to_json(games) + "\n").encode("utf-8"))
        plist = sorted(players.values(), key=lambda p: (p["name"], p["id"]))
        all_players.extend(plist)
        summary.append((pos, len(rows), len(plist), size))

    fingerprint.update(("players\n" + to_json(all_players) + "\n").encode("utf-8"))
    data_version = fingerprint.hexdigest()[:12]
    size = dump({"version": 1, "dataVersion": data_version, "seasons": [FIRST_SEASON, LAST_SEASON],
                 "players": all_players},
                os.path.join(out, "players.json"))
    for pos, n_rows, n_players, fsize in summary:
        print(f"games_{pos.lower()}.json: {n_rows} games, {n_players} players, {fsize} bytes")
    print(f"players.json: {len(all_players)} players, {size} bytes, dataVersion {data_version}")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except DataError as e:
        sys.exit(f"build_data.py: {e}")
