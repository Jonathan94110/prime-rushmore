#!/usr/bin/env python3
"""Fantasy stats bot.

Pulls weekly NFL player stats from nflverse (1999 to now), merges in hand-entered
pre-1999 "legend" seasons, scores everything with bot/scoring.json, and writes
static JSON files the site can fetch:

  data/players.json         one entry per player, with career totals
  data/seasons.json         one row per player per season (regular season)
  data/weekly/<season>.json one row per player per game (regular + postseason),
                            as {"columns": [...], "rows": [[...], ...]}
  data/meta.json            when the data was built and what it covers

Past seasons are cached in .cache/ and never re-downloaded unless --force is
passed. The newest season is always re-fetched so in-season weeks stay current.

Usage:
  python bot/fetch_stats.py                 # 1999 through the latest season
  python bot/fetch_stats.py --start 2015    # narrower range
  python bot/fetch_stats.py --force         # ignore the download cache
"""

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / ".cache"
DATA_DIR = ROOT / "data"
LEGENDS_CSV = ROOT / "sources" / "legends_seasons.csv"
SCORING_JSON = Path(__file__).resolve().parent / "scoring.json"

NFLVERSE_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{season}.csv"
)
FIRST_NFLVERSE_SEASON = 1999
FANTASY_POSITIONS = {"QB", "RB", "FB", "WR", "TE"}

# Stat columns kept in the output, in output order.
STAT_COLUMNS = [
    "completions",
    "attempts",
    "passing_yards",
    "passing_tds",
    "interceptions",
    "carries",
    "rushing_yards",
    "rushing_tds",
    "receptions",
    "targets",
    "receiving_yards",
    "receiving_tds",
    "two_point_conversions",
    "fumbles_lost",
    "other_tds",
]

# nflverse column -> our column (summed when several map to one).
NFLVERSE_STAT_MAP = {
    "completions": ["completions"],
    "attempts": ["attempts"],
    "passing_yards": ["passing_yards"],
    "passing_tds": ["passing_tds"],
    "interceptions": ["passing_interceptions"],
    "carries": ["carries"],
    "rushing_yards": ["rushing_yards"],
    "rushing_tds": ["rushing_tds"],
    "receptions": ["receptions"],
    "targets": ["targets"],
    "receiving_yards": ["receiving_yards"],
    "receiving_tds": ["receiving_tds"],
    "two_point_conversions": [
        "passing_2pt_conversions",
        "rushing_2pt_conversions",
        "receiving_2pt_conversions",
    ],
    "fumbles_lost": [
        "sack_fumbles_lost",
        "rushing_fumbles_lost",
        "receiving_fumbles_lost",
    ],
    "other_tds": ["special_teams_tds", "fumble_recovery_tds"],
}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def latest_season(today=None):
    """NFL seasons start in September; Jan-Aug still belongs to last season."""
    today = today or dt.date.today()
    return today.year if today.month >= 9 else today.year - 1


def download_season(season, force):
    """Return the cached CSV path for a season, downloading if needed.

    Returns None when nflverse has no file for that season yet.
    """
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / f"stats_player_week_{season}.csv"
    is_current = season >= latest_season()
    if path.exists() and not force and not is_current:
        return path

    url = NFLVERSE_URL.format(season=season)
    log(f"  downloading {season} ...")
    try:
        with urllib.request.urlopen(url, timeout=120) as resp:
            body = resp.read()
    except urllib.error.HTTPError as err:
        if err.code == 404:
            log(f"  no nflverse file for {season} yet, skipping")
            return None
        raise
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(body)
    tmp.replace(path)
    return path


def load_nflverse(seasons, force):
    frames = []
    for season in seasons:
        path = download_season(season, force)
        if path is None:
            continue
        raw = pd.read_csv(path, low_memory=False)
        raw = raw[raw["position"].isin(FANTASY_POSITIONS)]
        out = pd.DataFrame(
            {
                "player_id": raw["player_id"],
                "name": raw["player_display_name"],
                "position": raw["position"],
                "headshot_url": raw["headshot_url"],
                "season": raw["season"].astype(int),
                "week": raw["week"].astype(int),
                "season_type": raw["season_type"],
                "game_id": raw["game_id"],
                "team": raw["team"],
                "opponent": raw["opponent_team"],
            }
        )
        for ours, theirs in NFLVERSE_STAT_MAP.items():
            present = [c for c in theirs if c in raw.columns]
            out[ours] = raw[present].fillna(0).sum(axis=1) if present else 0
        frames.append(out)
    if not frames:
        raise SystemExit("No nflverse data downloaded; check the season range.")
    return pd.concat(frames, ignore_index=True)


def load_legends():
    if not LEGENDS_CSV.exists():
        return pd.DataFrame()
    df = pd.read_csv(LEGENDS_CSV, dtype={"nflverse_id": "string"})
    too_new = df["season"] >= FIRST_NFLVERSE_SEASON
    if too_new.any():
        log(
            f"  ignoring {int(too_new.sum())} legend rows from {FIRST_NFLVERSE_SEASON}+ "
            "(nflverse already covers those seasons)"
        )
        df = df[~too_new]
    # A legend whose career runs into 1999+ can point at their nflverse id so
    # both eras land under one player.
    df["player_id"] = df["nflverse_id"].fillna(df["player_id"])
    for col in STAT_COLUMNS:
        if col not in df.columns:
            df[col] = 0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["games"] = pd.to_numeric(df["games"], errors="coerce").fillna(0).astype(int)
    df["headshot_url"] = None
    return df


def add_fantasy_points(df, scoring):
    base = sum(
        df[stat] * pts
        for stat, pts in scoring.items()
        if stat in df.columns and isinstance(pts, (int, float))
    )
    for fmt, per_rec in scoring["reception_formats"].items():
        df[f"fp_{fmt}"] = (base + df["receptions"] * per_rec).round(2)
    return df


def to_records(df, columns):
    """DataFrame -> list of dicts with ints where the value is whole."""
    records = []
    for row in df[columns].itertuples(index=False):
        rec = {}
        for col, val in zip(columns, row):
            if pd.isna(val):
                val = None
            elif isinstance(val, float) and val.is_integer() and not col.startswith("fp_"):
                val = int(val)
            elif hasattr(val, "item"):
                val = val.item()
            rec[col] = val
        records.append(rec)
    return records


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")


def build(start, end, force):
    scoring = json.loads(SCORING_JSON.read_text())
    fp_cols = [f"fp_{fmt}" for fmt in scoring["reception_formats"]]

    log(f"nflverse seasons {start}-{end}")
    weekly = add_fantasy_points(load_nflverse(range(start, end + 1), force), scoring)

    # Weekly game logs, one file per season.
    weekly_cols = [
        "player_id", "name", "position", "season", "week", "season_type",
        "game_id", "team", "opponent", *STAT_COLUMNS, *fp_cols,
    ]
    # Stored column-wise ({"columns": [...], "rows": [[...]]}) because repeating
    # every key on ~6k rows per season quadruples the file size. Games where a
    # player recorded no stat at all are dropped.
    touched = weekly[STAT_COLUMNS].ne(0).any(axis=1)
    seasons_written = []
    for season, group in weekly[touched].groupby("season"):
        group = group.sort_values(["week", "player_id"])
        rows = [list(r.values()) for r in to_records(group, weekly_cols)]
        write_json(DATA_DIR / "weekly" / f"{season}.json", {"columns": weekly_cols, "rows": rows})
        seasons_written.append(int(season))

    # Regular-season totals from the weekly logs.
    reg = weekly[weekly["season_type"] == "REG"]
    modern = (
        reg.groupby(["player_id", "season"], as_index=False)
        .agg(
            name=("name", "last"),
            position=("position", "last"),
            headshot_url=("headshot_url", "last"),
            team=("team", lambda t: "/".join(dict.fromkeys(t.dropna()))),
            games=("game_id", "nunique"),
            **{c: (c, "sum") for c in STAT_COLUMNS},
        )
    )
    modern["era"] = "nflverse"

    legends = load_legends()
    if not legends.empty:
        legends = legends.copy()
        legends["era"] = "legend"
        log(f"legend seasons: {len(legends)}")

    seasons = pd.concat([modern, legends], ignore_index=True)
    seasons = add_fantasy_points(seasons, scoring)
    seasons = seasons.sort_values(["season", "fp_ppr"], ascending=[True, False])
    season_cols = [
        "player_id", "name", "position", "season", "team", "games", "era",
        *STAT_COLUMNS, *fp_cols,
    ]
    write_json(DATA_DIR / "seasons.json", to_records(seasons, season_cols))

    # Player index with career totals.
    ordered = seasons.sort_values("season")
    players = ordered.groupby("player_id", as_index=False).agg(
        name=("name", "last"),
        position=("position", "last"),
        headshot_url=("headshot_url", lambda s: s.dropna().iloc[-1] if s.notna().any() else None),
        first_season=("season", "min"),
        last_season=("season", "max"),
        seasons=("season", "nunique"),
        games=("games", "sum"),
        **{c: (c, "sum") for c in STAT_COLUMNS + fp_cols},
    )
    players[fp_cols] = players[fp_cols].round(2)
    best = ordered.loc[ordered.groupby("player_id")["fp_ppr"].idxmax(), ["player_id", "season"]]
    players = players.merge(best.rename(columns={"season": "best_season_ppr"}), on="player_id")
    players = players.sort_values("fp_ppr", ascending=False)
    player_cols = [
        "player_id", "name", "position", "headshot_url", "first_season",
        "last_season", "seasons", "games", "best_season_ppr", *STAT_COLUMNS, *fp_cols,
    ]
    write_json(DATA_DIR / "players.json", to_records(players, player_cols))

    meta = {
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "weekly_seasons": seasons_written,
        "legend_seasons": int(len(legends)),
        "players": int(len(players)),
        "season_rows": int(len(seasons)),
        "scoring": scoring,
        "sources": {
            "nflverse": "https://github.com/nflverse/nflverse-data (CC-BY 4.0)",
            "legends": "sources/legends_seasons.csv (hand-entered)",
        },
    }
    write_json(DATA_DIR / "meta.json", meta)
    log(
        f"done: {len(players)} players, {len(seasons)} player-seasons, "
        f"weekly files for {seasons_written[0]}-{seasons_written[-1]}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--start", type=int, default=FIRST_NFLVERSE_SEASON)
    parser.add_argument("--end", type=int, default=latest_season())
    parser.add_argument("--force", action="store_true", help="re-download every season")
    args = parser.parse_args()
    if args.start < FIRST_NFLVERSE_SEASON:
        parser.error(
            f"nflverse starts in {FIRST_NFLVERSE_SEASON}; add older seasons to {LEGENDS_CSV.name}"
        )
    build(args.start, args.end, args.force)


if __name__ == "__main__":
    main()
