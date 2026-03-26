"""Generate exploratory data analysis plots.

These plots show the raw data before modeling:
- Price trajectories for example cards around tournament dates
- Feature correlation heatmap

Requires database connection (reads from .env).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd

# Setup paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FIGURES_DIR = SCRIPT_DIR / "figures"

sys.path.insert(0, str(PROJECT_ROOT))

from utils.db import get_db_connection
from data_processing.extract import get_training_data
from config import FEATURES


def plot_price_trajectories() -> None:
    """Plot price over time for example cards around tournament appearances."""
    conn = get_db_connection()
    cur = conn.cursor()

    # Pick cards with interesting stories: one big spike, one moderate, one flat
    cards = [
        ("Lacrima the Crimson Tears", "Large spike after tournament"),
        ("Ash Blossom & Joyous Spring", "Established staple, stable price"),
        ("Fiendsmith's Tract", "New meta card, volatile"),
    ]

    fig, axes = plt.subplots(len(cards), 1, figsize=(12, 4 * len(cards)))

    for idx, (card_name, description) in enumerate(cards):
        ax = axes[idx]

        # Get the printing with most snapshots
        cur.execute("""
            SELECT p.product_id, p.set_code
            FROM printings p
            LEFT JOIN LATERAL (
                SELECT COUNT(*) as cnt FROM market_snapshots ms
                WHERE ms.product_id = p.product_id
            ) sc ON true
            WHERE p.card_name = %s
            ORDER BY sc.cnt DESC LIMIT 1
        """, (card_name,))
        row = cur.fetchone()
        if not row:
            ax.text(0.5, 0.5, f"No data for {card_name}", transform=ax.transAxes, ha='center')
            continue
        product_id, set_code = row

        # Get price history
        cur.execute("""
            SELECT time::date as date, AVG(market_price) as price
            FROM market_snapshots
            WHERE product_id = %s
            GROUP BY time::date
            ORDER BY date
        """, (product_id,))
        rows = cur.fetchall()
        if not rows:
            continue

        dates = [r[0] for r in rows]
        prices = [float(r[1]) for r in rows]

        ax.plot(dates, prices, color='steelblue', linewidth=1.5)

        # Get tournament dates for this card
        cur.execute("""
            SELECT DISTINCT t.event_date
            FROM tournaments t
            JOIN deck_profiles dp ON dp.tournament_id = t.id
            JOIN LATERAL jsonb_array_elements_text(dp.main_deck::jsonb) AS card_id ON true
            JOIN cards c ON c.id = card_id::int
            WHERE c.name = %s AND t.format = 'TCG' AND t.player_count > 0
            ORDER BY t.event_date
        """, (card_name,))
        tournament_dates = [r[0] for r in cur.fetchall()]

        # Draw vertical lines for tournament appearances
        for td in tournament_dates:
            if dates[0] <= td <= dates[-1]:
                ax.axvline(td, color='red', alpha=0.3, linewidth=0.8)

        # Label
        ax.set_title(f"{card_name} ({set_code}) - {description}")
        ax.set_ylabel("Market Price ($)")
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
        ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)

        # Add legend for first plot only
        if idx == 0:
            ax.axvline(dates[0], color='red', alpha=0.3, linewidth=0.8, label='Tournament appearance')
            ax.legend(loc='upper left')

    axes[-1].set_xlabel("Date")
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "price_trajectories.png", dpi=150)
    plt.close(fig)
    print("Saved price_trajectories.png")

    cur.close()
    conn.close()


def plot_correlation_heatmap() -> None:
    """Plot correlation heatmap of features and target."""
    print("Loading training data for correlation analysis...")
    df = get_training_data()

    # Select features + target
    cols = [f for f in FEATURES if f in df.columns] + ['price_change_pct']
    corr_df = df[cols].copy()

    # Rename for readability
    rename_map = {
        'price_at_tournament': 'price',
        'price_volatility_7d': 'volatility',
        'card_tournament_count': 'tourney_count',
        'avg_prior_price_change': 'avg_prior_change',
        'log_player_count': 'log_players',
        'price_change_pct': 'target',
    }
    corr_df = corr_df.rename(columns=rename_map)

    corr = corr_df.corr()

    fig, ax = plt.subplots(figsize=(10, 8))
    im = ax.imshow(corr.values, cmap='RdBu_r', vmin=-1, vmax=1, aspect='auto')

    # Labels
    labels = list(corr.columns)
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right', fontsize=9)
    ax.set_yticklabels(labels, fontsize=9)

    # Annotate cells with correlation values
    for i in range(len(labels)):
        for j in range(len(labels)):
            val = corr.values[i, j]
            color = 'white' if abs(val) > 0.5 else 'black'
            ax.text(j, i, f'{val:.2f}', ha='center', va='center', fontsize=8, color=color)

    fig.colorbar(im, ax=ax, label='Pearson Correlation')
    ax.set_title("Feature Correlation Heatmap")
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "correlation_heatmap.png", dpi=150)
    plt.close(fig)
    print("Saved correlation_heatmap.png")


def main():
    os.makedirs(FIGURES_DIR, exist_ok=True)

    plot_price_trajectories()
    plot_correlation_heatmap()

    print(f"\nEDA figures saved to {FIGURES_DIR}/")


if __name__ == "__main__":
    main()
