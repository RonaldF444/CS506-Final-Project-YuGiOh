"""XGBoost sell-timing model: learns WHEN to sell an open position.

For every card-tournament buy, fetches the daily price curve and emits one
training row per day with features and a binary label. SELL=1 when the card
had a real run-up, momentum has turned negative, and the price never recovers
above its current peak — i.e. the spike is genuinely over.
"""
from __future__ import annotations

from datetime import date, timedelta

import joblib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import classification_report, f1_score, precision_score, recall_score
from xgboost import XGBClassifier

from config import (
    MIN_CARD_APPEARANCES,
    MIN_CARD_PRICE,
    RANDOM_STATE,
    SELL_FEATURES,
    SELL_MODEL_PATH,
    SELLER_COMMISSION_PCT,
    TRANSACTION_FEE_FLAT,
    TRANSACTION_FEE_PCT,
)
from models.predict_helpers import apply_buy_model
from utils.db import get_db_connection


def generate_sell_training_data(
    peak_days: int = 60,
    sell_threshold_pct: float = 5.0,
    min_card_price: float = 8.0,
    cutoff_date: str | None = None,
) -> pd.DataFrame:
    """Generate (position_state, sell/hold) training rows from historical prices.

    cutoff_date prevents data leakage when backtesting — only positions from
    tournaments on or before this date are used.
    """
    from data_processing.extract import get_training_data

    print("Loading base training data...")
    df = get_training_data(peak_days=peak_days)

    counts = df['card_name'].value_counts()
    keep = counts[counts >= MIN_CARD_APPEARANCES].index
    df = df[df['card_name'].isin(keep)].copy()
    df = df[df['price_at_tournament'] >= min_card_price].copy()
    df = df.dropna(subset=['price_change_pct']).reset_index(drop=True)

    if cutoff_date:
        cutoff = date.fromisoformat(cutoff_date) if isinstance(cutoff_date, str) else cutoff_date
        before = len(df)
        df = df[df['event_date'].apply(
            lambda d: (d.date() if hasattr(d, 'date') else d) <= cutoff
        )].copy()
        print(f"Cutoff {cutoff_date}: {before:,} -> {len(df):,} rows")

    print(f"Base data: {len(df):,} card-tournament pairs")

    if 'product_id' not in df.columns or 'event_date' not in df.columns:
        print("ERROR: missing product_id or event_date in training data")
        return pd.DataFrame()

    # Use the buy model's noisy prediction so the sell model sees the same
    # signal at training time that it'll see at inference time.
    print("Loading buy model to generate predictions for training rows...")
    try:
        from config import MODEL_PATH
        buy_artifact = joblib.load(MODEL_PATH)
        buy_features = buy_artifact['features']

        missing = set(buy_features) - set(df.columns)
        if missing:
            print(f"  WARNING: missing features {missing}; using price_change_pct as fallback")
            df['buy_model_prediction'] = df['price_change_pct']
        else:
            X = df[buy_features].astype(float)
            df['buy_model_prediction'] = apply_buy_model(buy_artifact, X)
            print(f"  Generated predictions for {len(df):,} rows "
                  f"(mean={df['buy_model_prediction'].mean():.1f}%, "
                  f"std={df['buy_model_prediction'].std():.1f}%)")
    except Exception as e:
        print(f"  Could not load buy model ({e}); falling back to actual price_change_pct")
        df['buy_model_prediction'] = df['price_change_pct']

    conn = get_db_connection()
    cur = conn.cursor()

    all_rows = []
    processed = 0
    skipped = 0

    for _, row in df.iterrows():
        product_id = int(row['product_id'])
        buy_price = float(row['price_at_tournament'])
        predicted_change = float(row.get('buy_model_prediction', 15.0))
        event_date = row['event_date']

        if hasattr(event_date, 'date'):
            buy_date = event_date.date()
        elif isinstance(event_date, str):
            buy_date = date.fromisoformat(event_date[:10])
        else:
            buy_date = event_date

        expiry_date = buy_date + timedelta(days=peak_days)

        cur.execute(
            "SELECT time::date as day, market_price "
            "FROM market_snapshots "
            "WHERE product_id = %s AND time::date > %s AND time::date <= %s "
            "ORDER BY time::date",
            (product_id, str(buy_date), str(expiry_date)),
        )
        prices = cur.fetchall()

        if len(prices) < 5:
            skipped += 1
            continue

        days = [r[0] for r in prices]
        price_values = [float(r[1]) for r in prices]
        eventual_peak = max(price_values)
        total_hold_days = (expiry_date - buy_date).days

        peak_so_far = buy_price
        last_new_high_day = 0
        for i, (day, price) in enumerate(zip(days, price_values)):
            if price >= peak_so_far:
                last_new_high_day = i
            peak_so_far = max(peak_so_far, price)

            day_d = date.fromisoformat(day[:10]) if isinstance(day, str) else day

            days_held = (day_d - buy_date).days
            days_remaining = (expiry_date - day_d).days

            gross_return = (price - buy_price) / buy_price * 100 if buy_price > 0 else 0
            peak_gain = (peak_so_far - buy_price) / buy_price * 100 if buy_price > 0 else 0
            drawdown = (peak_so_far - price) / peak_so_far * 100 if peak_so_far > 0 else 0
            pct_target = min(200.0, (gross_return / predicted_change * 100) if predicted_change != 0 else 0)

            mom_3d = (price - price_values[max(0, i - 3)]) / price_values[max(0, i - 3)] if i > 0 and price_values[max(0, i - 3)] > 0 else 0
            mom_7d = (price - price_values[max(0, i - 7)]) / price_values[max(0, i - 7)] if i > 0 and price_values[max(0, i - 7)] > 0 else 0

            if i >= 2:
                daily_returns = [
                    (price_values[j] - price_values[j - 1]) / price_values[j - 1]
                    for j in range(1, i + 1)
                    if price_values[j - 1] > 0
                ]
                vol = float(np.std(daily_returns)) if daily_returns else 0
            else:
                vol = 0

            hold_pct = days_held / total_hold_days if total_hold_days > 0 else 1.0

            # Label: spike is genuinely over
            had_runup = peak_gain > 15.0
            declining = mom_3d < 0
            best_future = max(price_values[i:])
            never_recovers = best_future < peak_so_far * 0.99

            sell_label = 1 if (had_runup and declining and never_recovers) else 0

            all_rows.append({
                'gross_return_pct': gross_return,
                'peak_gain_pct': peak_gain,
                'drawdown_from_peak_pct': drawdown,
                'pct_of_target_reached': pct_target,
                'days_held': days_held,
                'days_remaining': days_remaining,
                'hold_pct_elapsed': hold_pct,
                'price_momentum_3d': mom_3d,
                'price_momentum_7d': mom_7d,
                'volatility_since_buy': vol,
                'predicted_change_pct': predicted_change,
                'buy_price': buy_price,
                'days_since_last_new_high': i - last_new_high_day,
                'sell_label': sell_label,
                'tournament_date': buy_date,
                'actual_price': price,
                'eventual_peak': eventual_peak,
            })

        processed += 1
        if processed % 500 == 0:
            print(f"  Processed {processed:,} positions ({len(all_rows):,} day-rows)")

    cur.close()
    conn.close()

    result = pd.DataFrame(all_rows)
    n_sell = (result['sell_label'] == 1).sum()
    n_hold = (result['sell_label'] == 0).sum()
    print(f"\nGenerated {len(result):,} day-rows from {processed:,} positions ({skipped:,} skipped)")
    print(f"Labels: SELL={n_sell:,} ({n_sell / len(result) * 100:.1f}%), HOLD={n_hold:,} ({n_hold / len(result) * 100:.1f}%)")

    return result


def train_sell_model(
    df: pd.DataFrame,
    features: list[str] | None = None,
    probability_threshold: float = 0.5,
) -> dict:
    """Train binary classifier with temporal split + class-imbalance weighting."""
    if features is None:
        features = SELL_FEATURES

    df = df.sort_values('tournament_date').reset_index(drop=True)
    train_cutoff = int(len(df) * 0.70)
    val_cutoff = int(len(df) * 0.85)

    train = df.iloc[:train_cutoff]
    val = df.iloc[train_cutoff:val_cutoff]
    test = df.iloc[val_cutoff:]

    X_train, y_train = train[features], train['sell_label']
    X_val, y_val = val[features], val['sell_label']
    X_test, y_test = test[features], test['sell_label']

    n_hold = (y_train == 0).sum()
    n_sell = (y_train == 1).sum()
    scale_weight = n_hold / max(1, n_sell)

    print("\n=== Training Sell Model ===")
    print(f"Train: {len(train):,} rows (SELL={n_sell:,}, HOLD={n_hold:,}, ratio={scale_weight:.1f})")
    print(f"Val:   {len(val):,} rows")
    print(f"Test:  {len(test):,} rows")
    print(f"Features: {len(features)}")

    model = XGBClassifier(
        n_estimators=500,
        max_depth=4,
        learning_rate=0.05,
        min_child_weight=10,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.5,
        reg_lambda=2.0,
        gamma=0.3,
        scale_pos_weight=scale_weight,
        random_state=RANDOM_STATE,
        eval_metric='logloss',
        early_stopping_rounds=50,
    )

    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    val_probs = model.predict_proba(X_val)[:, 1]
    test_probs = model.predict_proba(X_test)[:, 1]

    print("\n=== Threshold Analysis (Validation Set) ===")
    print(f"{'Threshold':<12} {'Precision':>10} {'Recall':>10} {'F1':>10} {'Sells':>8}")
    print("-" * 55)
    for thresh in [0.3, 0.4, 0.5, 0.6, 0.7]:
        preds = (val_probs >= thresh).astype(int)
        if preds.sum() > 0:
            p = precision_score(y_val, preds, zero_division=0)
            r = recall_score(y_val, preds, zero_division=0)
            f = f1_score(y_val, preds, zero_division=0)
            print(f"{thresh:<12.1f} {p:>10.3f} {r:>10.3f} {f:>10.3f} {preds.sum():>8,}")
        else:
            print(f"{thresh:<12.1f}    (no sells predicted)")

    test_preds = (test_probs >= probability_threshold).astype(int)
    print(f"\n=== Test Set (threshold={probability_threshold}) ===")
    if test_preds.sum() > 0:
        print(classification_report(y_test, test_preds, target_names=['HOLD', 'SELL']))
    else:
        print("No sells predicted at this threshold")

    importances = model.feature_importances_
    print("\n=== Feature Importance ===")
    for feat, imp in sorted(zip(features, importances), key=lambda x: -x[1]):
        print(f"  {feat:<30} {imp:.4f}")

    print("\n=== Simulated Sell Backtest (test set) ===")
    _run_sell_backtest(test, model, features, probability_threshold)

    artifact = {
        'model': model,
        'features': features,
        'model_type': 'classifier',
        'sell_probability_threshold': probability_threshold,
        'class_balance': {'hold': int(n_hold), 'sell': int(n_sell)},
        'scale_pos_weight': scale_weight,
    }

    joblib.dump(artifact, SELL_MODEL_PATH)
    print(f"\nSell model saved to {SELL_MODEL_PATH}")

    return artifact


def _run_sell_backtest(
    test_df: pd.DataFrame,
    model: XGBClassifier,
    features: list[str],
    threshold: float,
) -> None:
    """Walk each position day-by-day, sell on first SELL signal, score capture."""
    test_df = test_df.copy()
    test_df['position_key'] = (
        test_df['tournament_date'].astype(str) + '_' + test_df['buy_price'].astype(str)
    )

    positions = test_df.groupby('position_key')
    total_positions = 0
    model_sells = 0
    expiry_sells = 0
    total_capture_pct = 0
    total_profit_model = 0
    total_profit_perfect = 0

    for _, group in positions:
        group = group.sort_values('days_held')
        if len(group) < 3:
            continue

        total_positions += 1
        buy_price = group.iloc[0]['buy_price']
        eventual_peak = group.iloc[0]['eventual_peak']

        sell_price_model = None
        for _, row in group.iterrows():
            prob = model.predict_proba(row[features].values.reshape(1, -1))[0][1]
            if prob >= threshold:
                sell_price_model = row['actual_price']
                model_sells += 1
                break

        if sell_price_model is None:
            sell_price_model = group.iloc[-1]['actual_price']
            expiry_sells += 1

        if eventual_peak > buy_price:
            peak_move = eventual_peak - buy_price
            model_move = sell_price_model - buy_price
            total_capture_pct += model_move / peak_move * 100
        else:
            total_capture_pct += 100

        def net_profit(sell_p):
            fees = sell_p * (SELLER_COMMISSION_PCT + TRANSACTION_FEE_PCT) + TRANSACTION_FEE_FLAT
            return sell_p - fees - buy_price

        total_profit_model += net_profit(sell_price_model)
        total_profit_perfect += net_profit(eventual_peak)

    if total_positions == 0:
        print("  No positions to backtest")
        return

    avg_capture = total_capture_pct / total_positions
    print(f"  Positions tested:  {total_positions}")
    print(f"  Model sold:        {model_sells} ({model_sells / total_positions * 100:.1f}%)")
    print(f"  Expired (no sell): {expiry_sells} ({expiry_sells / total_positions * 100:.1f}%)")
    print(f"  Avg peak capture:  {avg_capture:.1f}% of theoretical peak move")
    print(f"  Model total P&L:   ${total_profit_model:+,.2f} (per copy)")
    print(f"  Perfect P&L:       ${total_profit_perfect:+,.2f} (per copy)")
    print(f"  Gap:               ${total_profit_perfect - total_profit_model:+,.2f}")
