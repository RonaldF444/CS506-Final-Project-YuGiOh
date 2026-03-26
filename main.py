"""
Yu-Gi-Oh Post-Tournament Price Change Predictor

Predicts the percent price change of a Yu-Gi-Oh card within 60 days
of a tournament appearance using XGBoost regression.
"""

import pandas as pd
import numpy as np

from data_processing.extract import get_training_data
from models.train import train_model
from config import MIN_CARD_APPEARANCES, MIN_CARD_PRICE
from utils.reporting import print_price_change_analysis


def main():
    print("Yu-Gi-Oh Post-Tournament Price Change Predictor")
    print("Target: Predict peak % price change within 60 days of a tournament")
    print()

    # Load data
    print("Step 1: Loading training data...")
    df = get_training_data()
    print(f"Loaded {len(df)} tournament-card appearances")
    print()

    # Show price change stats
    mean_change = df['price_change_pct'].mean()
    median_change = df['price_change_pct'].median()
    print(f"Price changes — Mean: {mean_change:.2f}%, Median: {median_change:.2f}%")
    print()

    # Filter out cards with too few appearances (noise reduction)
    print(f"Filtering cards with < {MIN_CARD_APPEARANCES} appearances...")
    card_counts = df['card_name'].value_counts()
    valid_cards = card_counts[card_counts >= MIN_CARD_APPEARANCES].index
    df_filtered = df[df['card_name'].isin(valid_cards)].copy()

    removed_count = len(df) - len(df_filtered)
    removed_cards = len(card_counts) - len(valid_cards)

    print(f"Removed {removed_count} rows from {removed_cards} cards with < {MIN_CARD_APPEARANCES} appearances")
    print(f"Remaining: {len(df_filtered)} rows from {len(valid_cards)} cards")
    print()

    # Use filtered data for training
    df = df_filtered

    # Filter to meaningful price range
    before_price = len(df)
    df = df[df['price_at_tournament'] >= MIN_CARD_PRICE].copy()
    print(f"Filtering cards below ${MIN_CARD_PRICE:.2f}: removed {before_price - len(df)} rows")
    print(f"Remaining: {len(df)} rows")
    print()

    # Analyze price change patterns
    print_price_change_analysis(df, MIN_CARD_APPEARANCES)

    # Train model
    print("Step 2: Training model...")
    print()
    result = train_model(df)

    # Print summary
    print()
    print("Results:")
    print()

    test_df = result['test_df'].copy()
    test_df['predicted_change'] = result['test_predictions']

    print(f"Test set size: {len(test_df)} samples")
    print(f"Actual mean change: {test_df['price_change_pct'].mean():+.2f}%")
    print(f"Predicted mean change: {test_df['predicted_change'].mean():+.2f}%")
    print()

    # Directional accuracy: did the model get the direction right?
    correct_direction = (
        (test_df['predicted_change'] > 0) & (test_df['price_change_pct'] > 0) |
        (test_df['predicted_change'] <= 0) & (test_df['price_change_pct'] <= 0)
    ).mean() * 100
    print(f"Directional accuracy: {correct_direction:.1f}%")
    print()

    print("Done.")


if __name__ == "__main__":
    main()
