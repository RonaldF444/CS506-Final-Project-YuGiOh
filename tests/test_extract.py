"""Feature engineering produces every column the model expects."""
from datetime import date

import pandas as pd

from config import FEATURES
from data_processing.extract import (
    _apply_archetype_features,
    _apply_cooccurrence_features,
    _apply_feature_engineering,
)


def _synthetic_df() -> pd.DataFrame:
    return pd.DataFrame({
        "tournament_id": [1, 1, 2, 2],
        "card_name": ["A", "B", "A", "B"],
        "archetype": ["X", "X", "X", None],
        "event_date": [date(2024, 6, 1)] * 2 + [date(2025, 6, 1)] * 2,
        "price_at_tournament": [10.0, 5.0, 12.0, 4.5],
        "peak_price_30d": [11.0, 6.0, 13.0, 5.0],
        "peak_price_60d": [12.0, 6.5, 14.0, 5.5],
        "momentum_1d": [0.05, -0.02, 0.0, 0.01],
        "momentum_3d": [0.10, -0.01, 0.05, 0.0],
        "momentum_7d": [0.15, 0.03, 0.10, 0.02],
        "momentum_30d": [0.20, 0.05, 0.15, 0.04],
        "momentum_90d": [0.25, 0.08, 0.20, 0.06],
        "decks_with_card": [10, 5, 12, 4],
        "best_placement": [1, 16, 4, 9],
        "tournament_size": [100, 100, 120, 120],
        "total_copies": [30, 12, 36, 8],
    })


def test_feature_engineering_emits_all_columns():
    df = _apply_feature_engineering(_synthetic_df())
    assert "price_tier" in df.columns
    assert "price_volatility_7d" in df.columns
    assert "is_monthly_data" in df.columns
    assert "distance_from_high" in df.columns
    assert "is_new_high" in df.columns
    assert "distance_from_30d_high" in df.columns
    assert "is_new_30d_high" in df.columns
    assert "distance_from_60d_high" in df.columns
    assert "is_new_60d_high" in df.columns


def test_is_monthly_data_uses_2024_cutoff():
    df = _apply_feature_engineering(_synthetic_df())
    rows_2024 = df[df["event_date"] == date(2024, 6, 1)]
    rows_2025 = df[df["event_date"] == date(2025, 6, 1)]
    assert (rows_2024["is_monthly_data"] == 0.0).all()
    assert (rows_2025["is_monthly_data"] == 0.0).all()


def test_archetype_features_handle_missing_archetype():
    df = _apply_feature_engineering(_synthetic_df())
    df["top_cut_rate"] = [0.5, 0.0, 0.6, 0.1]
    df = _apply_archetype_features(df, bucket_col="tournament_id")
    assert "archetype_avg_top_cut_rate" in df.columns
    assert "archetype_momentum_7d" in df.columns
    assert "archetype_card_count" in df.columns
    # Card with NULL archetype must not be NaN
    assert df["archetype_avg_top_cut_rate"].notna().all()


def test_cooccurrence_with_empty_matrix_is_zero():
    df = _apply_feature_engineering(_synthetic_df())
    df = _apply_cooccurrence_features(df, cooccurrence_matrix=None)
    assert (df["deckmate_momentum_avg"] == 0.0).all()


def test_cooccurrence_with_real_matrix_uses_deckmate_momentum():
    df = _apply_feature_engineering(_synthetic_df())
    matrix = {"A": [("B", 0.8)], "B": [("A", 0.8)]}
    df = _apply_cooccurrence_features(df, matrix)
    # Card A's deckmate B has momentum_7d=0.03 in tournament 1, so A's value should match
    a_t1 = df[(df["card_name"] == "A") & (df["tournament_id"] == 1)]["deckmate_momentum_avg"].iloc[0]
    assert a_t1 == 0.03


def test_features_list_subset_of_engineered_columns():
    """Every entry in config.FEATURES must be producible by the pipeline."""
    df = _apply_feature_engineering(_synthetic_df())
    df["top_cut_rate"] = 0.0
    df = _apply_archetype_features(df, bucket_col="tournament_id")
    df = _apply_cooccurrence_features(df, None)
    for col in [
        "banlist_status", "is_banned", "days_since_ban_change",
        "deck_trend", "num_printings",
    ]:
        df[col] = 0
    missing = [f for f in FEATURES if f not in df.columns]
    assert missing == [], f"FEATURES not produced by extract: {missing}"
