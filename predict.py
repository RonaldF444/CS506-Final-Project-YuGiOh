"""CLI for running the buy model on upcoming tournaments — no data leakage."""
from __future__ import annotations

import argparse
from typing import Any

import joblib
import numpy as np

from config import (
    MIN_CARD_PRICE,
    MODEL_PATH,
    SELLER_COMMISSION_PCT,
    TRANSACTION_FEE_FLAT,
    TRANSACTION_FEE_PCT,
)
from data_processing.extract import get_prediction_data
from models.predict_helpers import apply_buy_model

TOP_N = 25


def load_model() -> dict[str, Any]:
    return joblib.load(MODEL_PATH)


def main():
    parser = argparse.ArgumentParser(description="Predict post-tournament card price changes")
    parser.add_argument('--tournament-id', type=int, default=None,
                        help="Specific tournament ID to predict for")
    parser.add_argument('--after-date', type=str, default=None,
                        help="Only predict for tournaments after this date (YYYY-MM-DD). "
                             "Defaults to model's training cutoff date.")
    parser.add_argument('--save', type=str, default=None,
                        help="Save predictions to CSV file")
    args = parser.parse_args()

    print("=" * 60)
    print("CardzTzar Price Predictor - Prediction Mode")
    print("=" * 60)
    print()

    print("Loading model...")
    model_data = load_model()
    models = model_data.get('models', [model_data['model']])
    feature_columns = model_data['features']
    train_cutoff_date = model_data.get('train_cutoff_date')
    card_avg_prior_price_changes = model_data.get('card_avg_prior_price_changes', {})
    card_tournament_counts = model_data.get('card_tournament_counts', {})
    card_top_cut_rates = model_data.get('card_top_cut_rates', {})
    card_avg_decks = model_data.get('card_avg_decks', {})
    card_clusters = model_data.get('card_clusters', {})
    cluster_scaler = model_data.get('cluster_scaler')
    cluster_kmeans = model_data.get('cluster_kmeans')
    cooccurrence_matrix = model_data.get('cooccurrence_matrix')
    date_range = model_data.get('training_date_range', {})

    print(f"Model trained on data: {date_range.get('train', ('?', '?'))}")
    print(f"Train cutoff date: {train_cutoff_date}")
    print(f"Features: {len(feature_columns)}")
    print(f"Ensemble: {len(models)} model{'s' if len(models) > 1 else ''}")
    print()

    after_date = args.after_date
    if after_date is None and args.tournament_id is None and train_cutoff_date is not None:
        after_date = train_cutoff_date
        print(f"Auto-filtering to tournaments after training cutoff: {after_date}")
    elif args.tournament_id:
        print(f"Predicting for tournament ID: {args.tournament_id}")
    elif after_date:
        print(f"Predicting for tournaments after: {after_date}")
    print()

    print("Loading prediction data...")
    df = get_prediction_data(
        tournament_id=args.tournament_id,
        after_date=after_date,
        card_avg_prior_price_change=card_avg_prior_price_changes,
        card_tournament_counts=card_tournament_counts,
        card_top_cut_rates=card_top_cut_rates,
        card_avg_decks=card_avg_decks,
        card_clusters=card_clusters,
        cluster_scaler=cluster_scaler,
        cluster_kmeans=cluster_kmeans,
        cooccurrence_matrix=cooccurrence_matrix,
    )

    if len(df) == 0:
        print("No data found for the specified criteria.")
        return

    print(f"Loaded {len(df)} tournament-card appearances")
    print()

    missing = set(feature_columns) - set(df.columns)
    if missing:
        print(f"ERROR: Missing features in data: {missing}")
        return

    X = df[feature_columns]
    predictions = apply_buy_model(model_data, X)

    df = df.copy()
    df['predicted_price_change_pct'] = predictions

    fee_rate = SELLER_COMMISSION_PCT + TRANSACTION_FEE_PCT
    df['break_even_pct'] = (
        (df['price_at_tournament'] + TRANSACTION_FEE_FLAT)
        / ((1 - fee_rate) * df['price_at_tournament'])
        - 1
    ) * 100
    df['expected_sell'] = df['price_at_tournament'] * (1 + df['predicted_price_change_pct'] / 100)
    df['expected_profit'] = (
        df['expected_sell'] - df['expected_sell'] * fee_rate - TRANSACTION_FEE_FLAT - df['price_at_tournament']
    )
    df['clears_fees'] = df['predicted_price_change_pct'] > df['break_even_pct']

    tournaments = df['tournament_id'].nunique()
    print("=" * 60)
    print("PREDICTION SUMMARY")
    print("=" * 60)
    print(f"Tournaments analyzed: {tournaments}")
    print(f"Cards analyzed: {len(df)}")
    print(f"Predicted price change — Mean: {predictions.mean():.2f}%, Median: {np.median(predictions):.2f}%")
    print()

    tradeable = df[(df['price_at_tournament'] >= MIN_CARD_PRICE) & df['clears_fees']]
    print(f"Actionable trades (>= ${MIN_CARD_PRICE:.2f}, clears fees): {len(tradeable)}")
    print()

    top = df.nlargest(TOP_N, 'predicted_price_change_pct')
    print(f"Top {min(TOP_N, len(top))} predicted price increases:")
    print("-" * 120)
    print(f"{'Card Name':<35} {'Set':<13} {'Price':<10} {'Pred Change':<12} {'Exp Profit':<12} {'Trade?':<8}")
    print("-" * 120)
    for _, row in top.iterrows():
        set_code = str(row.get('set_code', ''))[:12]
        trade_flag = 'BUY' if row['clears_fees'] and row['price_at_tournament'] >= MIN_CARD_PRICE else ''
        print(f"{row['card_name']:<35} {set_code:<13} ${row['price_at_tournament']:<9.2f} {row['predicted_price_change_pct']:>+.2f}%      ${row['expected_profit']:>+7.2f}      {trade_flag}")
    print()

    print("=" * 60)
    print("PER-TOURNAMENT TOP PICKS")
    print("=" * 60)
    print()
    for tid, group in df.groupby('tournament_id'):
        t_name = group['tournament_name'].iloc[0] if 'tournament_name' in group.columns else str(tid)
        t_date = group['event_date'].iloc[0]
        n_cards = len(group)
        print(f"  {t_name[:50]} ({t_date}, {n_cards} cards)")

        t_tradeable = group[(group['price_at_tournament'] >= MIN_CARD_PRICE) & group['clears_fees']]
        top3 = t_tradeable.nlargest(3, 'predicted_price_change_pct')
        if len(top3) == 0:
            print("    No tradeable picks")
        for _, row in top3.iterrows():
            print(f"    BUY {row['card_name']:<35} ${row['price_at_tournament']:.2f}  "
                  f"pred: {row['predicted_price_change_pct']:+.2f}%  "
                  f"exp profit: ${row['expected_profit']:+.2f}")
        print()

    if args.save:
        save_cols = ['tournament_id', 'event_date', 'tournament_name', 'card_name',
                     'product_id', 'set_code', 'price_at_tournament',
                     'predicted_price_change_pct', 'break_even_pct',
                     'expected_sell', 'expected_profit', 'clears_fees']
        available_cols = [c for c in save_cols if c in df.columns]
        df[available_cols].sort_values('predicted_price_change_pct', ascending=False).to_csv(args.save, index=False)
        print(f"Predictions saved to {args.save}")
        print()

    print("=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
