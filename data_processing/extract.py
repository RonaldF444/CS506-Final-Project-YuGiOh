"""Data extraction and feature engineering."""
from __future__ import annotations

from collections import defaultdict
from datetime import date as _date

import numpy as np
import pandas as pd

from data_processing.queries import build_training_query, build_prediction_query
from utils.db import get_db_connection
from utils.reporting import print_diagnostics


def _build_cooccurrence_matrix(
    before_date: str | None = None,
    top_k: int = 10,
) -> dict[str, list[tuple[str, float]]]:
    """Build card co-occurrence matrix from deck lists.

    Returns dict mapping card_name -> [(deckmate, P(deckmate|card)), ...].
    `before_date` enforces temporal safety so prediction never sees future decks.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    date_filter = ""
    params: tuple = ()
    if before_date:
        date_filter = "AND t.event_date <= %s"
        params = (before_date,)

    cur.execute(f"""
        WITH tcg_decks AS (
            SELECT dp.id as dpid, dp.main_deck, dp.extra_deck, dp.side_deck
            FROM deck_profiles dp
            JOIN tournaments t ON t.id = dp.tournament_id
            WHERE t.format = 'TCG' AND t.player_count > 0 {date_filter}
        ),
        deck_cards AS (
            SELECT DISTINCT dpid, c.name as card_name
            FROM (
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(main_deck::jsonb)
                UNION ALL
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(extra_deck::jsonb)
                UNION ALL
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(side_deck::jsonb)
            ) raw
            JOIN cards c ON c.id = raw.card_id
        )
        SELECT a.card_name as card_a, b.card_name as card_b,
               COUNT(DISTINCT a.dpid) as pair_count
        FROM deck_cards a
        JOIN deck_cards b ON a.dpid = b.dpid AND a.card_name < b.card_name
        GROUP BY a.card_name, b.card_name
        HAVING COUNT(DISTINCT a.dpid) >= 3
    """, params)
    pairs = cur.fetchall()

    cur.execute(f"""
        WITH tcg_decks AS (
            SELECT dp.id as dpid, dp.main_deck, dp.extra_deck, dp.side_deck
            FROM deck_profiles dp
            JOIN tournaments t ON t.id = dp.tournament_id
            WHERE t.format = 'TCG' AND t.player_count > 0 {date_filter}
        ),
        deck_cards AS (
            SELECT DISTINCT dpid, c.name as card_name
            FROM (
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(main_deck::jsonb)
                UNION ALL
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(extra_deck::jsonb)
                UNION ALL
                SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(side_deck::jsonb)
            ) raw
            JOIN cards c ON c.id = raw.card_id
        )
        SELECT card_name, COUNT(DISTINCT dpid) as deck_count
        FROM deck_cards
        GROUP BY card_name
    """, params)
    deck_counts = {row[0]: row[1] for row in cur.fetchall()}

    cur.close()
    conn.close()

    card_mates: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for card_a, card_b, pair_count in pairs:
        count_a = deck_counts.get(card_a, 1)
        count_b = deck_counts.get(card_b, 1)
        card_mates[card_a].append((card_b, pair_count / count_a))
        card_mates[card_b].append((card_a, pair_count / count_b))

    result = {}
    for card, mates in card_mates.items():
        mates.sort(key=lambda x: -x[1])
        result[card] = mates[:top_k]

    print(f"Co-occurrence matrix: {len(result)} cards with deckmate data")
    return result


def _apply_cooccurrence_features(
    df: pd.DataFrame,
    cooccurrence_matrix: dict[str, list[tuple[str, float]]] | None = None,
) -> pd.DataFrame:
    """Add deckmate_momentum_avg: weighted-avg momentum_7d of co-occurring cards."""
    if cooccurrence_matrix is None or len(cooccurrence_matrix) == 0 or len(df) == 0:
        df['deckmate_momentum_avg'] = 0.0
        return df

    group_col = 'tournament_id' if 'tournament_id' in df.columns else None

    if group_col:
        group_momentum: dict[object, dict[str, float]] = {}
        for group_val, group_df in df.groupby(group_col):
            group_momentum[group_val] = dict(zip(
                group_df['card_name'].values,
                group_df['momentum_7d'].values,
            ))
    else:
        single_lookup = dict(zip(df['card_name'].values, df['momentum_7d'].values))

    results = []
    for _, row in df.iterrows():
        mates = cooccurrence_matrix.get(row['card_name'])
        if not mates:
            results.append(0.0)
            continue
        lookup = group_momentum.get(row[group_col], {}) if group_col else single_lookup

        weighted_sum = 0.0
        weight_total = 0.0
        for mate_name, strength in mates:
            mate_mom = lookup.get(mate_name)
            if mate_mom is not None:
                weighted_sum += mate_mom * strength
                weight_total += strength
        results.append(weighted_sum / weight_total if weight_total > 0 else 0.0)

    df['deckmate_momentum_avg'] = results
    return df


def _load_banlist_data() -> pd.DataFrame:
    conn = get_db_connection()
    try:
        bl = pd.read_sql(
            "SELECT b.effective_date, be.card_name, be.status "
            "FROM banlist_entries be "
            "JOIN banlists b ON b.id = be.banlist_id "
            "WHERE b.format = 'TCG' "
            "ORDER BY b.effective_date",
            conn,
        )
    finally:
        conn.close()
    return bl


def _apply_banlist_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add banlist_status (0-3), is_banned, days_since_ban_change."""
    if 'event_date' not in df.columns or len(df) == 0:
        df['banlist_status'] = 0.0
        df['is_banned'] = 0.0
        df['days_since_ban_change'] = 999.0
        return df

    bl = _load_banlist_data()
    if len(bl) == 0:
        df['banlist_status'] = 0.0
        df['is_banned'] = 0.0
        df['days_since_ban_change'] = 999.0
        return df

    status_map = {'Semi-Limited': 1, 'Limited': 2, 'Forbidden': 3}
    bl['status_code'] = bl['status'].map(status_map)
    bl['effective_date'] = pd.to_datetime(bl['effective_date']).dt.date

    banlist_dates = np.array(sorted(bl['effective_date'].unique()))
    bl_lookup = bl.set_index(['effective_date', 'card_name'])['status_code'].to_dict()
    card_bl_dates = bl.groupby('card_name')['effective_date'].apply(lambda x: sorted(x.unique())).to_dict()

    edates = df['event_date'].apply(lambda d: d.date() if hasattr(d, 'date') else d)
    edate_vals = edates.values

    active_dates = []
    for ed in edate_vals:
        idx = np.searchsorted(banlist_dates, ed, side='right') - 1
        active_dates.append(banlist_dates[idx] if idx >= 0 else None)

    ban_status, is_banned, days_since = [], [], []
    for ad, card, ed in zip(active_dates, df['card_name'].values, edate_vals):
        if ad is None:
            ban_status.append(0.0)
            is_banned.append(0.0)
            days_since.append(999.0)
            continue
        sc = bl_lookup.get((ad, card), 0)
        ban_status.append(float(sc))
        is_banned.append(1.0 if sc > 0 else 0.0)
        hist = card_bl_dates.get(card)
        if hist:
            idx = np.searchsorted(hist, ed, side='right') - 1
            days_since.append(float((ed - hist[idx]).days) if idx >= 0 else 999.0)
        else:
            days_since.append(999.0)

    df['banlist_status'] = ban_status
    df['is_banned'] = is_banned
    df['days_since_ban_change'] = days_since
    return df


def _apply_feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    """Shared post-processing: price_tier, volatility, peak distances, momentum NaN fill."""
    df['price_tier'] = pd.cut(
        df['price_at_tournament'],
        bins=[0, 1, 5, 10, 50, float('inf')],
        labels=[1, 2, 3, 4, 5]
    ).astype(float).fillna(1)

    df['price_volatility_7d'] = df[['momentum_1d', 'momentum_3d', 'momentum_7d']].abs().std(axis=1).fillna(0)

    df['momentum_1d'] = df['momentum_1d'].fillna(0)
    df['momentum_3d'] = df['momentum_3d'].fillna(0)
    df['momentum_7d'] = df['momentum_7d'].fillna(0)
    df['momentum_30d'] = df.get('momentum_30d', pd.Series(0, index=df.index)).fillna(0)
    df['momentum_90d'] = df.get('momentum_90d', pd.Series(0, index=df.index)).fillna(0)

    if 'event_date' in df.columns:
        cutoff = _date(2024, 2, 1)
        df['is_monthly_data'] = df['event_date'].apply(
            lambda d: 1.0 if (d.date() if hasattr(d, 'date') else d) < cutoff else 0.0
        )
    else:
        df['is_monthly_data'] = 0.0

    price = df['price_at_tournament']
    m1d = df['momentum_1d'].clip(lower=-0.99)
    m3d = df['momentum_3d'].clip(lower=-0.99)
    m7d = df['momentum_7d'].clip(lower=-0.99)
    m30d = df['momentum_30d'].clip(lower=-0.99)
    m90d = df['momentum_90d'].clip(lower=-0.99)

    recent_peak = pd.concat([
        price,
        price / (1 + m1d),
        price / (1 + m3d),
        price / (1 + m7d),
        price / (1 + m30d),
        price / (1 + m90d),
    ], axis=1).max(axis=1)
    df['distance_from_high'] = np.where(recent_peak > 0, (price - recent_peak) / recent_peak, 0.0)
    df['is_new_high'] = (price >= recent_peak).astype(float)

    if 'peak_price_30d' in df.columns:
        peak30 = df['peak_price_30d'].fillna(price)
        df['distance_from_30d_high'] = np.where(peak30 > 0, (price - peak30) / peak30, 0.0)
        df['is_new_30d_high'] = (price >= peak30 * 0.99).astype(float)
    else:
        df['distance_from_30d_high'] = 0.0
        df['is_new_30d_high'] = 0.0

    if 'peak_price_60d' in df.columns:
        peak60 = df['peak_price_60d'].fillna(price)
        df['distance_from_60d_high'] = np.where(peak60 > 0, (price - peak60) / peak60, 0.0)
        df['is_new_60d_high'] = (price >= peak60 * 0.99).astype(float)
    else:
        df['distance_from_60d_high'] = 0.0
        df['is_new_60d_high'] = 0.0

    return df


def _apply_archetype_features(df: pd.DataFrame, bucket_col: str | None = None) -> pd.DataFrame:
    """Aggregate top_cut_rate / momentum_7d / card_count by (tournament, archetype)."""
    if bucket_col and bucket_col in df.columns:
        bucket = df[bucket_col]
    elif 'tournament_id' in df.columns:
        bucket = df['tournament_id']
    else:
        bucket = pd.Series(0, index=df.index)

    # Cards without an archetype get their own group
    if 'archetype' not in df.columns:
        arch_key = df['card_name'].astype(str)
    else:
        has_arch = df['archetype'].notna() & (df['archetype'].astype(str).str.len() > 0)
        arch_key = df['archetype'].where(has_arch, df['card_name']).astype(str)

    grp = df.groupby([bucket, arch_key], sort=False)

    if 'top_cut_rate' in df.columns:
        df['archetype_avg_top_cut_rate'] = grp['top_cut_rate'].transform('mean').fillna(df['top_cut_rate']).fillna(0)
    else:
        df['archetype_avg_top_cut_rate'] = 0.0
    df['archetype_momentum_7d'] = grp['momentum_7d'].transform('mean').fillna(df.get('momentum_7d', 0)).fillna(0)
    df['archetype_card_count'] = grp['card_name'].transform('nunique').fillna(1).astype(int)
    return df


def get_training_data(peak_days: int | None = None) -> pd.DataFrame:
    """Load training data: card-at-tournament rows with peak-price target."""
    query = build_training_query(peak_days)

    conn = get_db_connection()
    try:
        print_diagnostics(conn)
        print("Executing training query (this may take a while for large datasets)...")
        df = pd.read_sql(query, conn)
    finally:
        conn.close()

    df['num_printings'] = df['num_printings'].fillna(1).astype(int)

    df = df.groupby(['tournament_id', 'product_id', 'event_date']).agg({
        'card_name': 'first',
        'archetype': 'first',
        'rarity': 'first',
        'num_printings': 'first',
        'tournament_size': 'first',
        'decks_with_card': 'first',
        'best_placement': 'first',
        'total_copies': 'first',
        'price_at_tournament': 'mean',
        'peak_price_30d': 'max',
        'peak_price_60d': 'max',
        'momentum_1d': 'mean',
        'momentum_3d': 'mean',
        'momentum_7d': 'mean',
        'momentum_30d': 'mean',
        'momentum_90d': 'mean',
        'price_change_pct': 'mean'
    }).reset_index()

    df = _apply_feature_engineering(df)
    df = _apply_banlist_features(df)

    df = df.sort_values('event_date').reset_index(drop=True)
    # shift(1) excludes current row — required for temporal safety
    df['cum_price_change_pct'] = df.groupby('card_name')['price_change_pct'].transform(lambda x: x.cumsum().shift(1, fill_value=0))
    df['cum_appearances'] = df.groupby('card_name').cumcount()

    df['avg_prior_price_change'] = (df['cum_price_change_pct'] / df['cum_appearances']).fillna(0)
    df.loc[df['cum_appearances'] == 0, 'avg_prior_price_change'] = 0

    df['card_tournament_count'] = df['cum_appearances']

    df['topped'] = (df['best_placement'] <= 8).astype(int)
    df['cum_tops'] = df.groupby('card_name')['topped'].transform(lambda x: x.cumsum().shift(1, fill_value=0))
    df['top_cut_rate'] = (df['cum_tops'] / df['cum_appearances']).fillna(0)
    df.loc[df['cum_appearances'] == 0, 'top_cut_rate'] = 0

    df['cum_decks'] = df.groupby('card_name')['decks_with_card'].transform(lambda x: x.cumsum().shift(1, fill_value=0))
    df['avg_prior_decks'] = (df['cum_decks'] / df.groupby('card_name').cumcount().replace(0, 1)).fillna(0)
    df['deck_trend'] = np.where(df['avg_prior_decks'] > 0, df['decks_with_card'] / df['avg_prior_decks'], 1.0)
    df.loc[df.groupby('card_name').cumcount() == 0, 'deck_trend'] = 1.0

    df = df.drop(columns=['cum_price_change_pct', 'cum_appearances', 'topped', 'cum_tops', 'cum_decks', 'avg_prior_decks'])

    df = _apply_archetype_features(df, bucket_col='tournament_id')

    df = df.dropna(subset=['price_at_tournament', 'price_change_pct'])
    return df


def get_prediction_data(
    tournament_id: int | None = None,
    after_date: str | None = None,
    card_avg_prior_price_change: dict[str, float] | None = None,
    card_tournament_counts: dict[str, int] | None = None,
    card_top_cut_rates: dict[str, float] | None = None,
    card_avg_decks: dict[str, float] | None = None,
    card_clusters: dict[str, int] | None = None,
    cluster_scaler: object | None = None,
    cluster_kmeans: object | None = None,
    cooccurrence_matrix: dict | None = None,
) -> pd.DataFrame:
    """Load prediction data with no future-price leakage.

    Historical per-card stats come from the saved training dicts, never from data
    after the model's train_cutoff_date.
    """
    query, params = build_prediction_query(tournament_id, after_date)

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

    df['num_printings'] = df['num_printings'].fillna(1).astype(int)

    df = df.groupby(['tournament_id', 'product_id', 'event_date']).agg({
        'card_name': 'first',
        'archetype': 'first',
        'tournament_name': 'first',
        'rarity': 'first',
        'set_code': 'first',
        'num_printings': 'first',
        'tournament_size': 'first',
        'decks_with_card': 'first',
        'best_placement': 'first',
        'total_copies': 'first',
        'price_at_tournament': 'mean',
        'peak_price_30d': 'max',
        'peak_price_60d': 'max',
        'momentum_1d': 'mean',
        'momentum_3d': 'mean',
        'momentum_7d': 'mean',
        'momentum_30d': 'mean',
        'momentum_90d': 'mean',
    }).reset_index()

    df = _apply_feature_engineering(df)
    df = _apply_banlist_features(df)

    if card_avg_prior_price_change is not None:
        df['avg_prior_price_change'] = df['card_name'].map(card_avg_prior_price_change).fillna(0)
    else:
        df['avg_prior_price_change'] = 0

    if card_tournament_counts is not None:
        df['card_tournament_count'] = df['card_name'].map(card_tournament_counts).fillna(0)
    else:
        df['card_tournament_count'] = 0

    if card_top_cut_rates is not None:
        df['top_cut_rate'] = df['card_name'].map(card_top_cut_rates).fillna(0)
    else:
        df['top_cut_rate'] = 0

    if card_avg_decks is not None:
        avg_decks = df['card_name'].map(card_avg_decks)
        df['deck_trend'] = np.where(avg_decks > 0, df['decks_with_card'] / avg_decks, 1.0).astype(float)
        df['deck_trend'] = df['deck_trend'].fillna(1.0)
    else:
        df['deck_trend'] = 1.0

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

    df = _apply_archetype_features(df, bucket_col='tournament_id')
    df = _apply_cooccurrence_features(df, cooccurrence_matrix)

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
