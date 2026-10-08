"""Pre-1999 data. Filled in once a verified bulk source is chosen.

Each loader returns a DataFrame in the canonical columns from common.py
(or an empty DataFrame when no source covers it).
"""

import pandas as pd

LAST_SEASON = 1998


def load_player_seasons():
    return pd.DataFrame()


def load_player_games():
    return pd.DataFrame()


def load_defense_games():
    return pd.DataFrame()


def load_defense_seasons():
    return pd.DataFrame()


COVERAGE_NOTES = []
