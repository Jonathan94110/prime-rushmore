"""1999-present data from nflverse (https://github.com/nflverse/nflverse-data, CC-BY 4.0).

Every loader returns one row per player (or team) per game, in the canonical
columns from common.py, with regular season and playoffs flagged by season_type.
"""

import pandas as pd

from common import (
    DEFENSE_STATS,
    KICKING_STATS,
    OFFENSE_STATS,
    cached_download,
    ensure_columns,
    log,
)

FIRST_SEASON = 1999
RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"

# Team stat files use today's franchise codes; schedules use the code of the day.
FRANCHISE_CODE = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}


def team_of_the_day(code, season):
    """Player stat files use today's franchise codes; show the team as it was."""
    if code == "LV" and season < 2020:
        return "OAK"
    if code == "LAC" and season < 2017:
        return "SD"
    if code == "LA" and 1995 <= season < 2016:
        return "STL"
    return code


POSITION_MAP = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "K": "K"}

OFFENSE_MAP = {
    "completions": ["completions"],
    "attempts": ["attempts"],
    "passing_yards": ["passing_yards"],
    "passing_tds": ["passing_tds"],
    "interceptions": ["passing_interceptions"],
    "carries": ["carries"],
    "rushing_yards": ["rushing_yards"],
    "rushing_tds": ["rushing_tds"],
    "receptions": ["receptions"],
    "receiving_yards": ["receiving_yards"],
    "receiving_tds": ["receiving_tds"],
    "two_point_conversions": [
        "passing_2pt_conversions",
        "rushing_2pt_conversions",
        "receiving_2pt_conversions",
    ],
    "fumbles_lost": ["sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost"],
    # nflverse's own fantasy points skip fumble-recovery TDs; most leagues count them.
    "other_tds": ["special_teams_tds", "fumble_recovery_tds"],
}

KICKING_MAP = {
    "fg_made": ["fg_made"],
    "fg_att": ["fg_att"],
    "fg_made_0_39": ["fg_made_0_19", "fg_made_20_29", "fg_made_30_39"],
    "fg_made_40_49": ["fg_made_40_49"],
    "fg_made_50_plus": ["fg_made_50_59", "fg_made_60_"],
    "xp_made": ["pat_made"],
    "xp_att": ["pat_att"],
}

DEFENSE_MAP = {
    "sacks": ["def_sacks"],
    "interceptions": ["def_interceptions"],
    "fumble_recoveries": ["fumble_recovery_opp"],
    "def_tds": ["def_tds"],
    "st_tds": ["special_teams_tds"],
    "safeties": ["def_safeties"],
    "blocked_kicks": ["def_punt_blocks", "def_fg_blocks", "def_pat_blocks"],
}


def _sum_columns(raw, mapping):
    out = {}
    for ours, theirs in mapping.items():
        present = [c for c in theirs if c in raw.columns]
        out[ours] = raw[present].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1) if present else 0
    return pd.DataFrame(out, index=raw.index)


def _season_file(kind, season, current):
    name = f"{kind}_week_{season}.csv"
    return cached_download(f"{RELEASES}/{kind}/{name}", name, refresh=season >= current)


def load_player_games(seasons, current, force=False):
    frames = []
    for season in seasons:
        path = _season_file("stats_player", season, current if not force else 0)
        if path is None:
            log(f"  nflverse has no player file for {season} yet")
            continue
        raw = pd.read_csv(path, low_memory=False)
        raw = raw[raw["position"].isin(POSITION_MAP)].copy()
        base = pd.DataFrame(
            {
                "player_id": raw["player_id"],
                "pfr_id": None,
                "name": raw["player_display_name"],
                "position": raw["position"].map(POSITION_MAP),
                "headshot_url": raw["headshot_url"],
                "season": raw["season"].astype(int),
                "week": raw["week"].astype(int),
                "season_type": raw["season_type"],
                "game_id": raw["game_id"],
                "team": raw["team"],
                "opponent": raw["opponent_team"],
            }
        )
        for col in ("team", "opponent"):
            base[col] = [team_of_the_day(t, season) for t in base[col]]
        frames.append(pd.concat([base, _sum_columns(raw, OFFENSE_MAP), _sum_columns(raw, KICKING_MAP)], axis=1))
    games = pd.concat(frames, ignore_index=True)
    games = ensure_columns(games, OFFENSE_STATS + KICKING_STATS)
    games["fg_made_unknown"] = 0
    games["source"] = "nflverse"
    return _attach_pfr_ids(games)


def _attach_pfr_ids(games):
    """Add Pro Football Reference ids so pre-1999 seasons can merge with these."""
    path = cached_download(f"{RELEASES}/players/players.csv", "players.csv")
    if path is None:
        return games
    ids = pd.read_csv(path, usecols=["gsis_id", "pfr_id"], low_memory=False).dropna()
    games = games.drop(columns="pfr_id").merge(
        ids.drop_duplicates("gsis_id"), how="left", left_on="player_id", right_on="gsis_id"
    )
    return games.drop(columns="gsis_id")


def team_name(abbr, season, names):
    # nflverse only has Washington's current name.
    if abbr == "WAS" and season < 2020:
        return "Washington Redskins"
    if abbr == "WAS" and season < 2022:
        return "Washington Football Team"
    return names.get(abbr, abbr)


def load_team_names():
    path = cached_download(f"{RELEASES}/teams/teams_colors_logos.csv", "teams_colors_logos.csv")
    teams = pd.read_csv(path)
    return dict(zip(teams["team_abbr"], teams["team_name"]))


def load_defense_games(seasons, current, force=False):
    """One row per team per game: points allowed from schedules, the rest from team stats."""
    sched_path = cached_download(f"{RELEASES}/schedules/games.csv", "games.csv", refresh=True)
    sched = pd.read_csv(sched_path)
    sched = sched[sched["season"].isin(list(seasons))].dropna(subset=["home_score", "away_score"])

    sides = []
    for us, them in (("home", "away"), ("away", "home")):
        sides.append(
            pd.DataFrame(
                {
                    "game_id": sched["game_id"],
                    "season": sched["season"].astype(int),
                    "week": sched["week"].astype(int),
                    "season_type": sched["game_type"].where(sched["game_type"] == "REG", "POST"),
                    "team": sched[f"{us}_team"],
                    "opponent": sched[f"{them}_team"],
                    "points_allowed": sched[f"{them}_score"].astype(int),
                }
            )
        )
    games = pd.concat(sides, ignore_index=True)
    games["franchise"] = games["team"].replace(FRANCHISE_CODE)

    stat_frames = []
    for season in sorted(games["season"].unique()):
        path = _season_file("stats_team", season, current if not force else 0)
        if path is None:
            continue
        raw = pd.read_csv(path, low_memory=False)
        stats = _sum_columns(raw, DEFENSE_MAP)
        stats["game_id"] = raw["game_id"]
        stats["franchise"] = raw["team"]
        stat_frames.append(stats.dropna(subset=["franchise"]))
    stats = pd.concat(stat_frames, ignore_index=True)

    games = games.merge(stats, how="left", on=["game_id", "franchise"])
    missing = games["sacks"].isna().sum()
    if missing:
        log(f"  {missing} team-games have no nflverse defensive stats; counting points allowed only")
    games = ensure_columns(games, DEFENSE_STATS)
    names = load_team_names()
    games["team_name"] = [team_name(t, s, names) for t, s in zip(games["team"], games["season"])]
    games["source"] = "nflverse"
    return games.drop(columns="franchise")
