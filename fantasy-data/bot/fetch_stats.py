#!/usr/bin/env python3
"""Fantasy stats bot: the top players of every NFL decade.

Ranks the top N (default 100) QBs, RBs, WRs, kickers and team defenses (D/ST)
for each decade by regular-season fantasy points (scoring in bot/scoring.json),
and writes static JSON the site can fetch:

  data/top100/index.json           decades, counts, scoring, data coverage notes
  data/top100/<decade>.json        ranked lists per position, with season lines
  data/top100/games/<decade>.json  game logs (regular season + playoffs) for the
                                   ranked players and defenses, where they exist

Players are ranked on fantasy points scored inside the decade, so a career that
spans two decades is ranked in both. Team defenses are ranked as team-seasons
("1985 Chicago Bears"), since there are only ~30 franchises per decade.

Sources: nflverse for 1999 onward, legacy.py for earlier seasons.

Usage:
  python bot/fetch_stats.py               # every decade, list_size from scoring.json
  python bot/fetch_stats.py --top 50      # override the list size
  python bot/fetch_stats.py --force       # re-download everything
"""

import argparse
import datetime as dt
import shutil

import pandas as pd

import legacy
import nflverse
from common import (
    DATA_DIR,
    DEFENSE_STATS,
    KICKING_STATS,
    OFFENSE_STATS,
    POSITIONS,
    ensure_columns,
    log,
    records,
    write_json,
)
from scoring import OFFENSE_FP, SCORING, score_defense_games, score_kicking, score_offense

OUT_DIR = DATA_DIR / "top100"
OFFENSE_POSITIONS = ["QB", "RB", "WR"]


def latest_season(today=None):
    """NFL seasons start in September; Jan-Aug still belongs to last season."""
    today = today or dt.date.today()
    return today.year if today.month >= 9 else today.year - 1


def decade_of(season):
    return season // 10 * 10


def join_unique(values):
    return "/".join(dict.fromkeys(v for v in values if isinstance(v, str) and v))


# --- players -----------------------------------------------------------------


def player_key(df):
    """Pro Football Reference id when known, so 1990s careers merge across sources."""
    pfr = df["pfr_id"] if "pfr_id" in df.columns else pd.Series(None, index=df.index)
    return pfr.where(pfr.notna(), df["player_id"])


def seasons_from_games(games):
    reg = games[games["season_type"] == "REG"].copy()
    reg["key"] = player_key(reg)
    stats = OFFENSE_STATS + KICKING_STATS
    return reg.groupby(["key", "season"], as_index=False, sort=False).agg(
        player_id=("player_id", "last"),
        name=("name", "last"),
        position=("position", "last"),
        headshot_url=("headshot_url", "last"),
        team=("team", join_unique),
        games=("game_id", "nunique"),
        source=("source", "last"),
        **{c: (c, "sum") for c in stats},
    )


def rank_players(seasons, position, top):
    """Rank player-decades for one position; returns (ranked rows, their season rows)."""
    df = seasons[seasons["position"] == position].copy()
    if df.empty:
        return pd.DataFrame(), df
    if position == "K":
        df = score_kicking(df)
        stats, fp_cols = KICKING_STATS, ["fp"]
    else:
        df = score_offense(df)
        stats, fp_cols = OFFENSE_STATS, OFFENSE_FP + ["fp"]

    df = df.sort_values("season").reset_index(drop=True)
    best = df.loc[df.groupby(["key", "decade"])["fp"].idxmax(), ["key", "decade", "season", "fp"]]
    best = best.rename(columns={"season": "best_season", "fp": "best_season_fp"})
    totals = df.groupby(["key", "decade"], as_index=False).agg(
        player_id=("player_id", "last"),
        name=("name", "last"),
        position=("position", "last"),
        headshot_url=("headshot_url", lambda s: s.dropna().iloc[-1] if s.notna().any() else None),
        teams=("team", lambda t: join_unique("/".join(t.dropna()).split("/"))),
        first_season=("season", "min"),
        last_season=("season", "max"),
        seasons_played=("season", "nunique"),
        games=("games", "sum"),
        **{c: (c, "sum") for c in stats + fp_cols},
    )
    totals = totals.merge(best, on=["key", "decade"])
    totals["fp_per_game"] = (totals["fp"] / totals["games"].where(totals["games"] > 0)).round(2)
    totals[fp_cols] = totals[fp_cols].round(2)

    ranked = (
        totals.sort_values(["decade", "fp"], ascending=[True, False])
        .groupby("decade", group_keys=False)
        .head(top)
        .copy()
    )
    ranked["rank"] = ranked.groupby("decade").cumcount() + 1
    lines = df.merge(ranked[["key", "decade"]], on=["key", "decade"])
    return ranked, lines


def player_entries(ranked, lines, position):
    stats = KICKING_STATS if position == "K" else OFFENSE_STATS
    fp_cols = ["fp"] if position == "K" else OFFENSE_FP + ["fp"]
    line_cols = ["season", "team", "games", *stats, *fp_cols]
    by_key = {k: g.sort_values("season") for k, g in lines.groupby(["key", "decade"])}
    cols = [
        "rank", "key", "decade", "player_id", "name", "position", "headshot_url", "teams",
        "first_season", "last_season", "seasons_played", "games", *stats, *fp_cols,
        "fp_per_game", "best_season", "best_season_fp",
    ]
    out = []
    for rec in records(ranked, cols):
        rec["id"] = rec.pop("key")
        rec["season_lines"] = records(by_key[(rec["id"], rec.pop("decade"))], line_cols)
        out.append(rec)
    return out


# --- defenses ----------------------------------------------------------------


def rank_defenses(def_games, top):
    reg = def_games[def_games["season_type"] == "REG"]
    seasons = reg.groupby(["team", "season"], as_index=False).agg(
        team_name=("team_name", "last"),
        games=("game_id", "nunique"),
        source=("source", "last"),
        **{c: (c, "sum") for c in DEFENSE_STATS + ["fp_points_allowed", "fp"]},
    )
    seasons["decade"] = seasons["season"].map(decade_of)
    seasons["id"] = seasons["team"] + "-" + seasons["season"].astype(str)
    seasons["fp_per_game"] = (seasons["fp"] / seasons["games"]).round(2)
    seasons["fp"] = seasons["fp"].round(2)
    ranked = (
        seasons.sort_values(["decade", "fp"], ascending=[True, False])
        .groupby("decade", group_keys=False)
        .head(top)
        .copy()
    )
    ranked["rank"] = ranked.groupby("decade").cumcount() + 1
    return ranked


DEF_COLS = ["rank", "id", "team", "team_name", "season", "games", *DEFENSE_STATS, "fp_points_allowed", "fp", "fp_per_game"]


# --- game logs ---------------------------------------------------------------


def columnar(df, columns):
    rows = [list(r.values()) for r in records(df, columns)]
    return {"columns": columns, "rows": rows}


def player_game_logs(games, ranked, position):
    if games.empty or ranked.empty:
        return None
    g = games[games["position"] == position].copy()
    g["key"] = player_key(g)
    g["decade"] = g["season"].map(decade_of)
    g = g.merge(ranked[["key", "decade"]], on=["key", "decade"])
    if g.empty:
        return None
    if position == "K":
        g = score_kicking(g)
        stats, fp_cols = KICKING_STATS, ["fp"]
    else:
        g = score_offense(g)
        stats, fp_cols = OFFENSE_STATS, OFFENSE_FP + ["fp"]
    g = g.rename(columns={"key": "id"}).sort_values(["season", "week", "id"])
    cols = ["id", "season", "week", "season_type", "game_id", "team", "opponent", *stats, *fp_cols]
    return columnar(g, cols)


def defense_game_logs(def_games, ranked):
    g = def_games.copy()
    g["id"] = g["team"] + "-" + g["season"].astype(str)
    g = g[g["id"].isin(set(ranked["id"]))].sort_values(["season", "week", "id"])
    if g.empty:
        return None
    cols = ["id", "season", "week", "season_type", "game_id", "team", "opponent", *DEFENSE_STATS, "fp_points_allowed", "fp"]
    return columnar(g, cols)


# --- build -------------------------------------------------------------------


def build(top, force):
    current = latest_season()
    log(f"nflverse {nflverse.FIRST_SEASON}-{current}")
    nfl_seasons = range(nflverse.FIRST_SEASON, current + 1)

    player_games = pd.concat(
        [nflverse.load_player_games(nfl_seasons, current, force), legacy.load_player_games()],
        ignore_index=True,
    )
    player_games = ensure_columns(player_games, OFFENSE_STATS + KICKING_STATS)

    # Seasons with game logs roll up from them; legacy seasons without logs come
    # from the season table (skipping any season the logs already cover).
    seasons = seasons_from_games(player_games)
    old_seasons = legacy.load_player_seasons()
    if not old_seasons.empty:
        old_seasons = ensure_columns(old_seasons.copy(), OFFENSE_STATS + KICKING_STATS)
        old_seasons["key"] = player_key(old_seasons)
        if "headshot_url" not in old_seasons.columns:
            old_seasons["headshot_url"] = None
        covered = set(zip(seasons["key"], seasons["season"]))
        keep = [(k, s) not in covered for k, s in zip(old_seasons["key"], old_seasons["season"])]
        seasons = pd.concat([seasons, old_seasons[keep]], ignore_index=True)
    seasons["decade"] = seasons["season"].map(decade_of)

    def_games = pd.concat(
        [nflverse.load_defense_games(nfl_seasons, current, force), legacy.load_defense_games()],
        ignore_index=True,
    )
    def_games = score_defense_games(ensure_columns(def_games, DEFENSE_STATS))

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    def_decades = def_games["season"].map(decade_of)
    decades = sorted(set(seasons["decade"]) | set(def_decades))
    lists = {d: {} for d in decades}
    logs = {d: {} for d in decades}

    for pos in OFFENSE_POSITIONS + ["K"]:
        ranked, lines = rank_players(seasons, pos, top)
        for d in decades:
            r = ranked[ranked["decade"] == d] if not ranked.empty else ranked
            lists[d][pos] = player_entries(r, lines, pos) if not r.empty else []
            logs[d][pos] = player_game_logs(player_games, r, pos)

    def_ranked = rank_defenses(def_games, top)
    for d in decades:
        r = def_ranked[def_ranked["decade"] == d]
        lists[d]["DEF"] = records(r, DEF_COLS)
        logs[d]["DEF"] = defense_game_logs(def_games, r)

    index = []
    for d in decades:
        label = f"{d}s"
        present = sorted(
            set(seasons.loc[seasons["decade"] == d, "season"]) | set(def_games.loc[def_decades == d, "season"])
        )
        span = [int(present[0]), int(present[-1])]
        write_json(OUT_DIR / f"{label}.json", {"decade": label, "seasons": span, "positions": lists[d]})
        game_logs = {p: v for p, v in logs[d].items() if v}
        if game_logs:
            write_json(OUT_DIR / "games" / f"{label}.json", game_logs)
        index.append(
            {
                "decade": label,
                "seasons": span,
                "counts": {p: len(lists[d][p]) for p in POSITIONS},
                "game_logs": sorted(game_logs),
            }
        )
        log(f"  {label}: " + ", ".join(f"{p} {len(lists[d][p])}" for p in POSITIONS))

    offense_rank = f"fp_{SCORING['rank_by']}"
    write_json(
        OUT_DIR / "index.json",
        {
            "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "top": top,
            "rank_by": {"QB": offense_rank, "RB": offense_rank, "WR": offense_rank, "K": "fp", "DEF": "fp"},
            "current_season": current,
            "decades": index,
            "scoring": SCORING,
            "coverage_notes": [
                f"{current} is in progress; the {decade_of(current)}s lists include games played so far.",
                *legacy.COVERAGE_NOTES,
            ],
            "sources": {
                "nflverse": "https://github.com/nflverse/nflverse-data (CC-BY 4.0), 1999-present",
                **getattr(legacy, "SOURCES", {}),
            },
        },
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--top", type=int, default=SCORING.get("list_size", 100), help="players per position per decade"
    )
    parser.add_argument("--force", action="store_true", help="re-download every file")
    args = parser.parse_args()
    build(args.top, args.force)


if __name__ == "__main__":
    main()
