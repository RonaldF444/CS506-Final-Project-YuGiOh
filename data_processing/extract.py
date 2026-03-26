"""Data extraction and feature engineering for CardzTzar spike prediction."""
from __future__ import annotations

import numpy as np
import pandas as pd

from data_processing.queries import BASE_CTES, LATERAL_JOINS_TRAINING, LATERAL_JOIN_AFTER
from utils.db import get_db_connection
from utils.reporting import print_diagnostics


def _apply_feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    """
    Shared post-processing for both training and prediction data.
    Adds price_tier, volatility, meta_share, relative_placement, and fills NaN momentum.
    """
    # Price tier feature
    df['price_tier'] = pd.cut(
        df['price_at_tournament'],
        bins=[0, 1, 5, 10, 50, float('inf')],
        labels=[1, 2, 3, 4, 5]
    ).astype(float).fillna(1)

    # Price volatility proxy from momentum spread
    df['price_volatility_7d'] = df[['momentum_1d', 'momentum_3d', 'momentum_7d']].abs().std(axis=1).fillna(0)

    # Fill NaN momentum values
    df['momentum_1d'] = df['momentum_1d'].fillna(0)
    df['momentum_3d'] = df['momentum_3d'].fillna(0)
    df['momentum_7d'] = df['momentum_7d'].fillna(0)

    # Rarity encoding (ordinal - higher = rarer = potentially more volatile)
    rarity_map = {
        'Common': 1, 'Short Print': 1,
        'Rare': 2,
        'Super Rare': 3,
        'Ultra Rare': 4,
        'Secret Rare': 5, "Collector's Rare": 5,
        'Ultimate Rare': 6, 'Prismatic Secret Rare': 6, 'Ghost Rare': 6,
        'Starlight Rare': 7, 'Quarter Century Secret Rare': 7,
    }
    if 'rarity' in df.columns:
        df['rarity_encoded'] = df['rarity'].map(rarity_map).fillna(3)
    else:
        df['rarity_encoded'] = 3

    # Log player count: continuous tournament size signal
    df['log_player_count'] = np.log1p(df['tournament_size']).fillna(0)

    # Meta share: fraction of tournament field running this card
    df['meta_share'] = np.where(
        df['tournament_size'] > 0,
        df['decks_with_card'] / df['tournament_size'],
        0.0
    )

    # Copies per deck: average copies of this card per deck that runs it
    df['copies_per_deck'] = np.where(
        df['decks_with_card'] > 0,
        df['total_copies'] / df['decks_with_card'],
        0.0
    )

    # Relative placement: best finish normalized by field size (lower = better)
    df['relative_placement'] = np.where(
        df['tournament_size'] > 0,
        df['best_placement'] / df['tournament_size'],
        1.0
    )

    return df


def get_training_data() -> pd.DataFrame:
    """
    Load training data for post-tournament spike prediction.

    Base unit: A card appearing at a specific tournament
    Target: What is the card's percent price change within 5 days?
    """

    query = BASE_CTES + """
    SELECT
        tca.tournament_id,
        tca.event_date,
        tca.card_name,
        p.product_id,
        p.rarity,
        pc.num_printings,

        -- Tournament features
        tca.player_count as tournament_size,
        tca.decks_with_card,
        tca.best_placement,
        tca.total_copies,

        -- Price at tournament time
        ms_at.market_price as price_at_tournament,

        -- Momentum windows
        CASE WHEN ms_1d.market_price > 0
            THEN (ms_at.market_price - ms_1d.market_price) / ms_1d.market_price
            ELSE 0 END as momentum_1d,
        CASE WHEN ms_3d.market_price > 0
            THEN (ms_at.market_price - ms_3d.market_price) / ms_3d.market_price
            ELSE 0 END as momentum_3d,
        CASE WHEN ms_7d.market_price > 0
            THEN (ms_at.market_price - ms_7d.market_price) / ms_7d.market_price
            ELSE 0 END as momentum_7d,


        -- Target: percent price change 5 days after tournament
        CASE
            WHEN ms_at.market_price > 0 AND ms_after.market_price > 0
            THEN (ms_after.market_price - ms_at.market_price) / ms_at.market_price * 100
            ELSE NULL
        END as price_change_pct

    FROM tournament_card_appearances tca
    JOIN ranked_printings p ON p.card_name = tca.card_name AND p.rn = 1
    LEFT JOIN printing_counts pc ON pc.card_name = tca.card_name
    """ + LATERAL_JOINS_TRAINING + LATERAL_JOIN_AFTER + """
    WHERE ms_at.market_price > 0
    """

    conn = get_db_connection()
    try:
        print_diagnostics(conn)
        print("Executing training query (this may take a while for large datasets)...")
        df = pd.read_sql(query, conn)
    finally:
        conn.close()

    # Fill num_printings NaN
    df['num_printings'] = df['num_printings'].fillna(1).astype(int)

    # Deduplicate
    df = df.groupby(['tournament_id', 'product_id', 'event_date']).agg({
        'card_name': 'first',
        'rarity': 'first',
        'num_printings': 'first',
        'tournament_size': 'first',
        'decks_with_card': 'first',
        'best_placement': 'first',
        'total_copies': 'first',
        'price_at_tournament': 'mean',
        'momentum_1d': 'mean',
        'momentum_3d': 'mean',
        'momentum_7d': 'mean',
        'price_change_pct': 'mean'
    }).reset_index()

    # Apply shared feature engineering
    df = _apply_feature_engineering(df)

    # Cumulative per-card features (sorted chronologically, excludes current row via shift)
    df = df.sort_values('event_date').reset_index(drop=True)
    df['cum_price_change_pct'] = df.groupby('card_name')['price_change_pct'].transform(lambda x: x.cumsum().shift(1, fill_value=0))
    df['cum_appearances'] = df.groupby('card_name').cumcount()  # 0-indexed = prior appearances

    # Average prior price change: historical price change for this card
    df['avg_prior_price_change'] = (df['cum_price_change_pct'] / df['cum_appearances']).fillna(0)
    df.loc[df['cum_appearances'] == 0, 'avg_prior_price_change'] = 0

    # Card tournament count: number of prior tournament appearances (meta novelty)
    df['card_tournament_count'] = df['cum_appearances']

    # Top-cut rate: cumulative fraction of prior appearances with top-8 finish
    df['topped'] = (df['best_placement'] <= 8).astype(int)
    df['cum_tops'] = df.groupby('card_name')['topped'].transform(lambda x: x.cumsum().shift(1, fill_value=0))
    df['top_cut_rate'] = (df['cum_tops'] / df['cum_appearances']).fillna(0)
    df.loc[df['cum_appearances'] == 0, 'top_cut_rate'] = 0

    df = df.drop(columns=['cum_price_change_pct', 'cum_appearances', 'topped', 'cum_tops'])

    # Drop nulls
    df = df.dropna(subset=['price_at_tournament', 'price_change_pct'])

    return df


def get_prediction_data(
    tournament_id: int | None = None,
    after_date: str | None = None,
    card_avg_prior_price_change: dict[str, float] | None = None,
    card_tournament_counts: dict[str, int] | None = None,
    card_top_cut_rates: dict[str, float] | None = None,
    card_clusters: dict[str, int] | None = None,
    cluster_scaler: object | None = None,
    cluster_kmeans: object | None = None,
) -> pd.DataFrame:
    """
    Load data for prediction (no future price / no data leakage).

    Args:
        tournament_id: Specific tournament ID to predict for.
        after_date: Only include tournaments after this date (e.g. model's train_cutoff_date).
        card_avg_prior_price_change: Dict of {card_name: mean_pct_change} from training for avg_prior_price_change feature.
        card_tournament_counts: Dict of {card_name: count} from training for card_tournament_count feature.
        card_top_cut_rates: Dict of {card_name: rate} from training for top_cut_rate feature.
        card_clusters: Dict of {card_name: cluster_id} from training for card_cluster feature.
        cluster_scaler: Fitted StandardScaler for clustering (used for unknown cards).
        cluster_kmeans: Fitted KMeans model for clustering (used for unknown cards).
    """

    # Build WHERE filter for tournament selection
    filters = ["ms_at.market_price > 0"]
    params = {}
    if tournament_id is not None:
        filters.append("tca.tournament_id = %(tournament_id)s")
        params['tournament_id'] = tournament_id
    if after_date is not None:
        filters.append("tca.event_date > %(after_date)s")
        params['after_date'] = after_date

    where_clause = " AND ".join(filters)

    query = BASE_CTES + """
    SELECT
        tca.tournament_id,
        tca.event_date,
        tca.card_name,
        tca.tournament_name,
        p.product_id,
        p.rarity,
        p.set_code,
        pc.num_printings,

        -- Tournament features
        tca.player_count as tournament_size,
        tca.decks_with_card,
        tca.best_placement,
        tca.total_copies,

        -- Price at tournament time
        ms_at.market_price as price_at_tournament,

        -- Momentum windows
        CASE WHEN ms_1d.market_price > 0
            THEN (ms_at.market_price - ms_1d.market_price) / ms_1d.market_price
            ELSE 0 END as momentum_1d,
        CASE WHEN ms_3d.market_price > 0
            THEN (ms_at.market_price - ms_3d.market_price) / ms_3d.market_price
            ELSE 0 END as momentum_3d,
        CASE WHEN ms_7d.market_price > 0
            THEN (ms_at.market_price - ms_7d.market_price) / ms_7d.market_price
            ELSE 0 END as momentum_7d

    FROM tournament_card_appearances tca
    JOIN ranked_printings p ON p.card_name = tca.card_name AND p.rn = 1
    LEFT JOIN printing_counts pc ON pc.card_name = tca.card_name
    """ + LATERAL_JOINS_TRAINING + f"""
    WHERE {where_clause}
    """

    conn = get_db_connection()
    try:
        print_diagnostics(conn)
        print("Executing prediction query...")
        df = pd.read_sql(query, conn, params=params)
    finally:
        conn.close()

    if len(df) == 0:
        print("WARNING: No data returned from prediction query.")
        return df

    # Fill num_printings NaN
    df['num_printings'] = df['num_printings'].fillna(1).astype(int)

    # Deduplicate
    df = df.groupby(['tournament_id', 'product_id', 'event_date']).agg({
        'card_name': 'first',
        'tournament_name': 'first',
        'rarity': 'first',
        'set_code': 'first',
        'num_printings': 'first',
        'tournament_size': 'first',
        'decks_with_card': 'first',
        'best_placement': 'first',
        'total_copies': 'first',
        'price_at_tournament': 'mean',
        'momentum_1d': 'mean',
        'momentum_3d': 'mean',
        'momentum_7d': 'mean',
    }).reset_index()

    # Apply shared feature engineering
    df = _apply_feature_engineering(df)

    # Use historical avg price changes from training instead of computing from future data
    if card_avg_prior_price_change is not None:
        df['avg_prior_price_change'] = df['card_name'].map(card_avg_prior_price_change).fillna(0)
    else:
        df['avg_prior_price_change'] = 0

    # Use historical tournament counts from training
    if card_tournament_counts is not None:
        df['card_tournament_count'] = df['card_name'].map(card_tournament_counts).fillna(0)
    else:
        df['card_tournament_count'] = 0

    # Use historical top-cut rates from training
    if card_top_cut_rates is not None:
        df['top_cut_rate'] = df['card_name'].map(card_top_cut_rates).fillna(0)
    else:
        df['top_cut_rate'] = 0

    # Assign card clusters from training
    if card_clusters is not None:
        from config import CLUSTER_FEATURES
        df['card_cluster'] = df['card_name'].map(card_clusters)
        unknown_mask = df['card_cluster'].isna()
        if unknown_mask.any() and cluster_scaler is not None and cluster_kmeans is not None:
            X_unknown = cluster_scaler.transform(df.loc[unknown_mask, CLUSTER_FEATURES])
            df.loc[unknown_mask, 'card_cluster'] = cluster_kmeans.predict(X_unknown)
        df['card_cluster'] = df['card_cluster'].fillna(0).astype(int)
    else:
        df['card_cluster'] = 0

    # Drop rows missing price
    df = df.dropna(subset=['price_at_tournament'])

    return df


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    df = get_training_data()
    print(f"Loaded {len(df)} rows")
    print()
    print("Sample data:")
    print(df.head(10))
    print()
    print("Price change distribution:")
    print(df['price_change_pct'].describe())
    print()
    print(f"Avg price change: {df['price_change_pct'].mean():.1f}%")
