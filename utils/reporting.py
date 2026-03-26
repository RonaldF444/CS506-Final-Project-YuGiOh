"""Diagnostic output and spike analysis formatting."""
from __future__ import annotations

import pandas as pd
import psycopg2.extensions


def print_diagnostics(conn: psycopg2.extensions.connection) -> None:
    """Print diagnostic info about data coverage before running the main query."""
    print("Data Diagnostics:")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*), MIN(event_date), MAX(event_date)
            FROM tournaments WHERE format = 'TCG' AND player_count > 0
        """)
        t_count, t_min, t_max = cur.fetchone()
        print(f"Tournaments: {t_count} ({t_min} to {t_max})")

        cur.execute("""
            SELECT COUNT(*), MIN(time), MAX(time)
            FROM market_snapshots
        """)
        ms_count, ms_min, ms_max = cur.fetchone()
        print(f"Market snapshots: {ms_count} ({ms_min} to {ms_max})")

        cur.execute("""
            SELECT AVG(gap_hours) FROM (
                SELECT EXTRACT(EPOCH FROM (time - LAG(time) OVER (PARTITION BY product_id ORDER BY time))) / 3600.0 AS gap_hours
                FROM market_snapshots
            ) sub WHERE gap_hours IS NOT NULL AND gap_hours > 0
        """)
        avg_gap = cur.fetchone()[0]
        if avg_gap is not None:
            print(f"Average snapshot gap: {avg_gap:.1f} hours")

    print()


def print_price_change_analysis(df: pd.DataFrame, min_appearances: int) -> None:
    """Print card price change pattern analysis (top cards by mean change and volatility)."""
    print("Step 1.5: Analyzing card price change patterns...")
    print()

    card_stats = df.groupby('card_name').agg({
        'price_change_pct': ['mean', 'median', 'count', 'std']
    }).reset_index()
    card_stats.columns = ['card_name', 'mean_change', 'median_change', 'appearances', 'std_change']
    card_stats['std_change'] = card_stats['std_change'].fillna(0)
    card_stats = card_stats.sort_values('mean_change', ascending=False)

    print(f"Top 15 Cards by Mean Price Change (min {min_appearances} appearances):")
    print()
    print(f"{'Card Name':<40} {'Mean Change':<15} {'Median Change':<15} {'Appearances':<10}")
    print()
    for _, row in card_stats.head(15).iterrows():
        print(f"{row['card_name']:<40} {row['mean_change']:>10.2f}%     {row['median_change']:>10.2f}%     {int(row['appearances']):<10}")
    print()

    volatile_cards = card_stats.sort_values('std_change', ascending=False).head(15)
    print("Top 15 Cards by Price Change Volatility:")
    print()
    print(f"{'Card Name':<40} {'Mean Change':<15} {'Std Dev':<15} {'Appearances':<10}")
    print()
    for _, row in volatile_cards.iterrows():
        print(f"{row['card_name']:<40} {row['mean_change']:>10.2f}%     {row['std_change']:>10.2f}%     {int(row['appearances']):<10}")
    print()
