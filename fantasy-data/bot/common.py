"""Shared paths, column lists, download cache and JSON helpers."""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

BOT_DIR = Path(__file__).resolve().parent
ROOT = BOT_DIR.parent
CACHE_DIR = ROOT / ".cache"
DATA_DIR = ROOT / "data"
SOURCES_DIR = ROOT / "sources"

POSITIONS = ["QB", "RB", "WR", "K", "DEF"]

OFFENSE_STATS = [
    "completions",
    "attempts",
    "passing_yards",
    "passing_tds",
    "interceptions",
    "carries",
    "rushing_yards",
    "rushing_tds",
    "receptions",
    "receiving_yards",
    "receiving_tds",
    "two_point_conversions",
    "fumbles_lost",
    "other_tds",
]

# fg_made_unknown counts made field goals whose distance the source doesn't give.
KICKING_STATS = [
    "fg_made",
    "fg_att",
    "fg_made_0_39",
    "fg_made_40_49",
    "fg_made_50_plus",
    "fg_made_unknown",
    "xp_made",
    "xp_att",
]

DEFENSE_STATS = [
    "points_allowed",
    "sacks",
    "interceptions",
    "fumble_recoveries",
    "def_tds",
    "st_tds",
    "safeties",
    "blocked_kicks",
]


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def cached_download(url, name, refresh=False):
    """Download url into .cache/name unless it's already there.

    Returns the path, or None if the server says the file doesn't exist (404).
    """
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / name
    if path.exists() and not refresh:
        return path
    log(f"  downloading {name} ...")
    try:
        with urllib.request.urlopen(url, timeout=180) as resp:
            body = resp.read()
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(body)
    tmp.replace(path)
    return path


def ensure_columns(df, columns, fill=0):
    for col in columns:
        if col not in df.columns:
            df[col] = fill
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(fill)
    return df


def clean(val, keep_float=False):
    """Make a pandas/numpy scalar JSON-friendly; whole floats become ints."""
    if val is None:
        return None
    if isinstance(val, (list, dict, str, bool)):
        return val
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(val, "item"):
        val = val.item()
    if isinstance(val, float):
        if keep_float:
            return round(val, 2)
        return int(val) if val.is_integer() else round(val, 2)
    return val


def records(df, columns):
    out = []
    for row in df[columns].itertuples(index=False):
        out.append({c: clean(v, keep_float=c.startswith("fp")) for c, v in zip(columns, row)})
    return out


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
