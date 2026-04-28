"""Train the XGBoost sell-timing model.

Usage:
    python scripts/train_sell_model.py --cutoff 2025-08-03
    python scripts/train_sell_model.py --threshold 0.6 --peak-days 60
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.sell_model import generate_sell_training_data, train_sell_model


def main():
    parser = argparse.ArgumentParser(description="Train the sell-timing model")
    parser.add_argument('--peak-days', type=int, default=60)
    parser.add_argument('--sell-threshold', type=float, default=5.0,
                        help='Percent within peak to label SELL')
    parser.add_argument('--threshold', type=float, default=0.5,
                        help='Probability threshold for sell decisions')
    parser.add_argument('--cutoff', type=str, default=None,
                        help='Only train on positions before this date (YYYY-MM-DD)')
    args = parser.parse_args()

    print("=" * 70)
    print("SELL MODEL TRAINING")
    if args.cutoff:
        print(f"Cutoff: {args.cutoff} (no data leakage past this date)")
    print("=" * 70)

    t0 = time.time()

    df = generate_sell_training_data(
        peak_days=args.peak_days,
        sell_threshold_pct=args.sell_threshold,
        cutoff_date=args.cutoff,
    )

    if len(df) == 0:
        print("No training data generated. Check database connectivity.")
        return

    train_sell_model(df, probability_threshold=args.threshold)

    elapsed = time.time() - t0
    print(f"\nTotal time: {elapsed:.0f}s")
    print("=" * 70)


if __name__ == "__main__":
    main()
