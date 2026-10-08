"""Extract 1999 scoring events from nflverse: two-point conversions, fumble recoveries, defensive and
special-teams TDs, safeties, blocked kicks and kicking by distance.

nflverse (github.com/nflverse/nflverse-data) starts in 1999, the last season of this dataset.

Usage:
    curl -L -o ps1999.csv https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_1999.csv
    curl -L -o pbp1999.csv.gz https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.csv.gz
    curl -L -o players.csv https://github.com/nflverse/nflverse-data/releases/download/players/players.csv
    python nflverse_1999.py ps1999.csv pbp1999.csv.gz players.csv ../data/enrich/nflverse_1999.json

Every play is classified from the play-by-play's own flags and team columns (td_team, fumbled_1_team,
fumble_recovery_1_team, interception, punt_blocked, ...), never from play_type, which is blank on plays
with an accepted penalty and doesn't separate a kick return from a fumble return.

Output:
  team_games: {"<date>|<team>": successful two-point conversions by that team in that game}
  players:    {"<gsis id>|<date>": {"two_pt": n, "fum_rec_td": n}} (only players with a nonzero value)
  kickers:    {"<gsis id>|<date>": field goals made by distance, misses, extra points}
  people:     {"<gsis id>": {"name", "birth_date", "teams"}} for everyone in the 1999 data, to match players by
              birth date and name rather than name alone (nflverse writes "Raghib Ismail" for "Rocket Ismail")
  defense:    {"<date>|<team>": counts for that team in that game}
      fum_rec      opponent fumbles recovered (scrimmage and kick plays)
      fum_rec_disputed  lost fumbles nobody recovered (out of the end zone for a touchback): the play-by-play
                   marks them lost but names no recovering team, and player stats don't count them lost
      safeties     safeties scored (the team whose score rose by 2)
      blk_punt/blk_fg/blk_xp   kicks blocked
      def_int_td   interception-return TDs
      def_fum_td   fumble-return TDs after the opponent fumbled on a scrimmage play
      st_other_td  special-teams TDs that aren't kick or punt returns: blocked punt/FG returns and
                   recoveries in the end zone, and the kicking team scoring on the returner's fumble
      ret_td       kick and punt return TDs (the main source records these; used to cross-check it)
      off_fum_rec_td   offense recovers its own fumble and scores
      two_pt, td_total, xpm, xpa, fgm   for reconciling against the final score
  evidence:   play-by-play descriptions behind every counted event (player and kicker keys as above);
              nflverse_game_ids: "<date>|<team>" -> game id
Team codes are converted to Pro-Football-Reference codes.
"""

import csv
import gzip
import json
import os
import re
import sys
from collections import defaultdict

NFLVERSE_TO_PFR = {"GB": "GNB", "KC": "KAN", "NE": "NWE", "NO": "NOR", "SD": "SDG", "LAC": "SDG",
                   "SF": "SFO", "TB": "TAM", "LA": "STL", "LV": "OAK"}

DEFENSE_FIELDS = ("fum_rec", "fum_rec_disputed", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td", "st_other_td",
                  "ret_td", "off_fum_rec_td", "two_pt", "td_total", "xpm", "xpa", "fgm")


def pfr(team):
    return NFLVERSE_TO_PFR.get(team, team)


def on(row, col):
    return row.get(col) == "1"


EVENT = re.compile(r"FUMBLES|MUFFS|INTERCEPTED by|RECOVERED by ([A-Z]{2,3})-|recovered by ([A-Z]{2,3})-|and recovers")


def recoveries_from_desc(desc, possessor, other):
    """Opponent fumble recoveries on a play with more than one fumble, read from the description in order.
    Returns the list of recovering teams (nflverse codes as written in the description)."""
    out, fumbling = [], None
    for m in EVENT.finditer(desc):
        tok = m.group(0)
        if tok.startswith("INTERCEPTED"):
            possessor, other = other, possessor
        elif tok in ("FUMBLES", "MUFFS"):
            fumbling = possessor
        elif tok == "and recovers":
            fumbling = None
        elif fumbling:
            team = m.group(1) or m.group(2)
            if pfr(team) != pfr(fumbling):
                out.append(team)
                possessor, other = team, fumbling
            fumbling = None
    return out


def main(ps_path, pbp_path, players_path, out_path):
    roster = {p["gsis_id"]: p for p in csv.DictReader(open(players_path)) if p["gsis_id"]}
    ids_to_name = {g: p["display_name"] for g, p in roster.items()}
    people = defaultdict(set)  # gsis -> teams in 1999
    kickers = defaultdict(lambda: defaultdict(int))
    defense = defaultdict(lambda: dict.fromkeys(DEFENSE_FIELDS, 0))
    # Supporting evidence: the play-by-play description of every event counted, plus nflverse game ids.
    evidence = {"players": defaultdict(list), "kickers": defaultdict(list), "defense": defaultdict(list)}
    nflv_game = {}
    week_date = {}  # (season_type, week, team) -> date
    team_two_pt = defaultdict(int)
    fum_rec_td = defaultdict(int)  # (gsis id, date)
    unclassified = []

    for p in csv.DictReader(open(ps_path)):
        ids_to_name[p["player_id"]] = p["player_display_name"]
        people[p["player_id"]].add(pfr(p["recent_team"]))

    for row in csv.DictReader(gzip.open(pbp_path, "rt")):
        if not row["game_date"] or not row["home_team"]:
            continue
        date = row["game_date"]
        play = f"{row['game_id']} play {row['play_id']}: {row['desc']}"
        for side in ("home_team", "away_team"):
            key = f"{date}|{pfr(row[side])}"
            week_date[(row["season_type"], row["week"], pfr(row[side]))] = date
            team_two_pt.setdefault(key, 0)
            defense[key]  # every team-game appears, even with all zeros
            nflv_game[key] = row["game_id"]
        pos, dfn = row["posteam"], row["defteam"]
        if not pos or not dfn:
            continue
        tkey = lambda team: f"{date}|{pfr(team)}"
        for col in ("passer_player_id", "rusher_player_id", "receiver_player_id", "kicker_player_id", "td_player_id"):
            if row[col]:
                people[row[col]].add(pfr(row["td_team"] if col == "td_player_id" else pos))

        def count(team, field, n=1):
            defense[tkey(team)][field] += n
            evidence["defense"][tkey(team)].append(f"{field}: {play}")

        if row["play_type"] == "no_play":
            # Nullified by a penalty: nothing on the play counts, though the penalty itself can still score
            # (an offensive foul in the end zone is a safety), which the score columns show.
            if on(row, "safety") and row["posteam_score_post"] and row["defteam_score_post"]:
                if float(row["defteam_score_post"]) - float(row["defteam_score"] or 0) == 2:
                    count(dfn, "safeties")
                elif float(row["posteam_score_post"]) - float(row["posteam_score"] or 0) == 2:
                    count(pos, "safeties")
            continue

        # --- kicking ---
        if on(row, "field_goal_attempt") and row["kicker_player_id"]:
            kkey = f"{row['kicker_player_id']}|{date}"
            k = kickers[kkey]
            k["fga"] += 1
            if row["field_goal_result"] == "made":
                dist = int(float(row["kick_distance"]))
                k["fgm"] += 1
                k["fgm_0_39" if dist < 40 else "fgm_40_49" if dist < 50 else "fgm_50p"] += 1
                defense[tkey(pos)]["fgm"] += 1
            else:
                k["fg_missed"] += 1
            evidence["kickers"][kkey].append(play)
        if on(row, "extra_point_attempt") and row["kicker_player_id"]:
            kkey = f"{row['kicker_player_id']}|{date}"
            k = kickers[kkey]
            k["xpa"] += 1
            k["xpm"] += row["extra_point_result"] == "good"
            defense[tkey(pos)]["xpa"] += 1
            defense[tkey(pos)]["xpm"] += row["extra_point_result"] == "good"
            if row["extra_point_result"] != "good":
                evidence["kickers"][kkey].append(play)

        # --- blocked kicks (the kicking team is posteam on punts, field goals and PATs) ---
        if on(row, "punt_blocked"):
            count(dfn, "blk_punt")
        if row["field_goal_result"] == "blocked":
            count(dfn, "blk_fg")
        if row["extra_point_result"] == "blocked":
            count(dfn, "blk_xp")

        if row["two_point_conv_result"] == "success":
            team_two_pt[tkey(pos)] += 1
            defense[tkey(pos)]["two_pt"] += 1
            for pid_col in ("passer_player_id", "rusher_player_id", "receiver_player_id"):
                if row.get(pid_col):
                    evidence["players"][f"{row[pid_col]}|{date}"].append(f"two_pt: {play}")

        # --- who had the ball: on kickoffs posteam is the receiving team, on punts the kicking team ---
        kickoff, punt = on(row, "kickoff_attempt"), on(row, "punt_attempt")
        kicking = dfn if kickoff else pos if (punt or on(row, "field_goal_attempt")) else None
        receiving = pos if kickoff else dfn if punt else None

        # --- fumble recoveries: a fumble by one team recovered by the other, on any kind of play ---
        if row["fumble_recovery_2_team"]:
            carrier, other = (receiving, kicking) if receiving else (pos, dfn)
            for team in recoveries_from_desc(row["desc"], carrier, other):
                count(team, "fum_rec")
        else:
            f1, r1 = row["fumbled_1_team"], row["fumble_recovery_1_team"]
            if f1 and r1 and pfr(f1) != pfr(r1):
                count(r1, "fum_rec")
            elif f1 and not r1 and on(row, "fumble_lost"):
                count(dfn if pfr(f1) == pfr(pos) else pos, "fum_rec_disputed")

        # --- safeties: credit the team whose score rose by 2 ---
        if on(row, "safety"):
            if row["defteam_score_post"] and float(row["defteam_score_post"]) - float(row["defteam_score"] or 0) == 2:
                count(dfn, "safeties")
            elif row["posteam_score_post"] and float(row["posteam_score_post"]) - float(row["posteam_score"] or 0) == 2:
                count(pos, "safeties")
            else:
                unclassified.append(f"safety, no score change: {play}")

        # --- touchdowns ---
        if not on(row, "touchdown") or not row["td_team"]:
            continue
        td = row["td_team"]
        defense[tkey(td)]["td_total"] += 1
        if on(row, "pass_touchdown") or on(row, "rush_touchdown"):
            continue  # offensive TDs: recorded in the main source as rushing or receiving TDs
        if on(row, "interception") and pfr(td) == pfr(dfn):
            count(td, "def_int_td")
        elif kickoff or punt:
            if pfr(td) == pfr(receiving) and not on(row, "punt_blocked"):
                count(td, "ret_td")  # kick or punt return, including a returner who recovers his own muff
            else:
                count(td, "st_other_td")  # blocked punt, or the kicking team recovers the returner's fumble
        elif on(row, "field_goal_attempt") and pfr(td) == pfr(dfn):
            count(td, "st_other_td")  # blocked or missed field goal returned
        elif on(row, "fumble") and pfr(td) == pfr(dfn):
            count(td, "def_fum_td")
        elif on(row, "fumble") and pfr(td) == pfr(pos) and row["td_player_id"]:
            # The offense recovers its own fumble and that player scores.
            count(td, "off_fum_rec_td")
            fum_rec_td[(row["td_player_id"], date)] += 1
            evidence["players"][f"{row['td_player_id']}|{date}"].append(f"fum_rec_td: {play}")
        else:
            unclassified.append(f"touchdown: {play}")

    players = defaultdict(lambda: {"two_pt": 0, "fum_rec_td": 0})
    for p in csv.DictReader(open(ps_path)):
        n = sum(int(float(p[k] or 0)) for k in
                ("passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions"))
        if n:
            date = week_date[(p["season_type"], p["week"], pfr(p["recent_team"]))]
            players[f"{p['player_id']}|{date}"]["two_pt"] += n
    for (gsis, date), n in fum_rec_td.items():
        players[f"{gsis}|{date}"]["fum_rec_td"] += n
    people = {g: {"name": ids_to_name.get(g, ""), "birth_date": roster.get(g, {}).get("birth_date", ""),
                  "teams": sorted(t for t in teams if t)} for g, teams in people.items()}

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"source": "nflverse-data player_stats_1999 and play_by_play_1999",
                   "team_games": team_two_pt, "players": players, "kickers": kickers, "defense": defense, "people": people,
                   "nflverse_game_ids": nflv_game, "evidence": evidence, "unclassified": unclassified},
                  f, indent=1, sort_keys=True)
    print(f"{len(team_two_pt)} team-games, {len(players)} player-games with 2-pt or fumble-recovery TDs, "
          f"{len(unclassified)} unclassified plays")
    for u in unclassified:
        print("  UNCLASSIFIED", u[:160])


if __name__ == "__main__":
    main(*sys.argv[1:5])
