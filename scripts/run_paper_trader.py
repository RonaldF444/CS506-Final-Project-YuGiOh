"""Offline paper-trader replay with periodic retraining."""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    MIN_CARD_PRICE,
    MODEL_PATH,
    SELL_MODEL_PATH,
    SELLER_COMMISSION_PCT,
    TRANSACTION_FEE_FLAT,
    TRANSACTION_FEE_PCT,
)
from data_processing.extract import get_prediction_data, get_training_data
from models.predict_helpers import apply_buy_model
from models.sell_model import generate_sell_training_data, train_sell_model
from models.train import train_model
from utils.db import get_db_connection

FEE_RATE = SELLER_COMMISSION_PCT + TRANSACTION_FEE_PCT


def load_models() -> tuple[dict, dict]:
    buy = joblib.load(MODEL_PATH)
    sell = joblib.load(SELL_MODEL_PATH)
    return buy, sell


def retrain_both(cutoff: date) -> tuple[dict, dict]:
    print(f"\n>>> RETRAIN @ {cutoff} <<<\n")
    df = get_training_data()
    df = df[df['event_date'].apply(
        lambda d: (d.date() if hasattr(d, 'date') else d) <= cutoff
    )]
    train_model(df)

    sell_df = generate_sell_training_data(cutoff_date=cutoff.isoformat())
    if len(sell_df) > 0:
        train_sell_model(sell_df)
    else:
        print("  Sell model: no training rows produced; keeping previous artifact")

    return load_models()


def fee_adjusted_break_even(price: float, fee_rate: float, fee_flat: float) -> float:
    if fee_rate == 0 and fee_flat == 0:
        return 0.0
    return ((price + fee_flat) / ((1 - fee_rate) * price) - 1) * 100


def buy_for_tournament(
    conn,
    buy_artifact: dict,
    tournament_id: int,
    strategy_id: str,
    top_n: int,
    hold_days: int,
    fee_rate: float,
    fee_flat: float,
) -> int:
    feature_columns = buy_artifact['features']
    df = get_prediction_data(
        tournament_id=tournament_id,
        card_avg_prior_price_change=buy_artifact.get('card_avg_prior_price_changes', {}),
        card_tournament_counts=buy_artifact.get('card_tournament_counts', {}),
        card_top_cut_rates=buy_artifact.get('card_top_cut_rates', {}),
        card_avg_decks=buy_artifact.get('card_avg_decks', {}),
        card_clusters=buy_artifact.get('card_clusters', {}),
        cluster_scaler=buy_artifact.get('cluster_scaler'),
        cluster_kmeans=buy_artifact.get('cluster_kmeans'),
        cooccurrence_matrix=buy_artifact.get('cooccurrence_matrix'),
    )
    if len(df) == 0:
        return 0

    missing = set(feature_columns) - set(df.columns)
    if missing:
        print(f"  Tournament {tournament_id}: missing features {missing}; skipping")
        return 0

    X = df[feature_columns]
    preds, stds = apply_buy_model(buy_artifact, X, with_std=True)
    df = df.copy()
    df['pred_pct'] = preds
    df['std_pct'] = stds
    df['break_even_pct'] = df['price_at_tournament'].apply(
        lambda p: fee_adjusted_break_even(p, fee_rate, fee_flat)
    )
    df['clears_fees'] = df['pred_pct'] > df['break_even_pct']

    eligible = df[
        (df['price_at_tournament'] >= MIN_CARD_PRICE) & df['clears_fees']
    ].nlargest(top_n, 'pred_pct')
    if len(eligible) == 0:
        return 0

    cur = conn.cursor()
    bought = 0
    for _, row in eligible.iterrows():
        t_date = row['event_date']
        if hasattr(t_date, 'date'):
            t_date = t_date.date()
        expiry = t_date + timedelta(days=hold_days)
        confidence = max(0.0, 1.0 - (row['std_pct'] / max(abs(row['pred_pct']), 1.0))) if row['pred_pct'] != 0 else 0.0

        # Skip if already holding this card from a recent weekend
        cur.execute("""
            SELECT 1 FROM paper_positions
            WHERE strategy_id=%s AND product_id=%s AND status='open'
              AND tournament_date >= %s
            LIMIT 1
        """, (strategy_id, int(row['product_id']), t_date - timedelta(days=7)))
        if cur.fetchone():
            continue

        try:
            cur.execute("""
                INSERT INTO paper_positions (
                    strategy_id, tournament_id, card_name, product_id,
                    buy_price, predicted_change_pct, quantity,
                    bought_at, tournament_date, expiry_date, status,
                    prediction_std_pct, confidence
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open', %s, %s)
                ON CONFLICT (strategy_id, tournament_id, product_id) DO NOTHING
            """, (
                strategy_id, int(tournament_id), row['card_name'], int(row['product_id']),
                float(row['price_at_tournament']), float(row['pred_pct']), 1,
                t_date, t_date, expiry,
                float(row['std_pct']), float(confidence),
            ))
            cur.execute("""
                INSERT INTO paper_trades_log (
                    strategy_id, action, tournament_id, card_name, product_id,
                    price, quantity, predicted_change_pct, reason
                ) VALUES (%s, 'BUY', %s, %s, %s, %s, 1, %s, 'model_pick')
            """, (
                strategy_id, int(tournament_id), row['card_name'], int(row['product_id']),
                float(row['price_at_tournament']), float(row['pred_pct']),
            ))
            bought += 1
        except Exception as e:
            print(f"    BUY skip {row['card_name']}: {e}")

    conn.commit()
    cur.close()
    return bought


def _sell_features_for_day(
    buy_price: float,
    predicted_change: float,
    prices: list[float],
    days: list[date],
    i: int,
    buy_date: date,
    expiry: date,
) -> dict:
    price = prices[i]
    peak_so_far = max(prices[: i + 1])
    last_new_high_day = max(j for j in range(i + 1) if prices[j] >= peak_so_far)

    days_held = (days[i] - buy_date).days
    days_remaining = (expiry - days[i]).days
    total_hold = (expiry - buy_date).days
    hold_pct = days_held / total_hold if total_hold > 0 else 1.0

    peak_gain = (peak_so_far - buy_price) / buy_price * 100 if buy_price > 0 else 0
    drawdown = (peak_so_far - price) / peak_so_far * 100 if peak_so_far > 0 else 0

    p3 = prices[max(0, i - 3)]
    p7 = prices[max(0, i - 7)]
    mom_3d = (price - p3) / p3 if i > 0 and p3 > 0 else 0
    mom_7d = (price - p7) / p7 if i > 0 and p7 > 0 else 0

    if i >= 2:
        rets = [
            (prices[j] - prices[j - 1]) / prices[j - 1]
            for j in range(1, i + 1)
            if prices[j - 1] > 0
        ]
        vol = float(pd.Series(rets).std()) if rets else 0.0
    else:
        vol = 0.0

    return {
        'peak_gain_pct': peak_gain,
        'drawdown_from_peak_pct': drawdown,
        'days_held': days_held,
        'days_remaining': days_remaining,
        'hold_pct_elapsed': hold_pct,
        'price_momentum_3d': mom_3d,
        'price_momentum_7d': mom_7d,
        'volatility_since_buy': vol,
        'predicted_change_pct': predicted_change,
        'days_since_last_new_high': i - last_new_high_day,
    }


def close_due_positions(
    conn,
    sell_artifact: dict,
    strategy_id: str,
    as_of: date,
    fee_rate: float,
    fee_flat: float,
) -> int:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, tournament_id, card_name, product_id, buy_price,
               predicted_change_pct, tournament_date, expiry_date
        FROM paper_positions
        WHERE strategy_id = %s AND status = 'open' AND expiry_date <= %s
    """, (strategy_id, as_of))
    rows = cur.fetchall()
    if not rows:
        cur.close()
        return 0

    sell_features = sell_artifact['features']
    sell_threshold = sell_artifact.get('sell_probability_threshold', 0.5)
    sell_model = sell_artifact['model']

    closed = 0
    for pos_id, t_id, card, prod_id, buy_price, pred_pct, t_date, expiry in rows:
        cur.execute("""
            SELECT time::date as day, market_price
            FROM market_snapshots
            WHERE product_id = %s AND time::date > %s AND time::date <= %s
            ORDER BY time::date
        """, (prod_id, str(t_date), str(expiry)))
        curve = cur.fetchall()
        if len(curve) < 3:
            continue

        days = [r[0] for r in curve]
        prices = [float(r[1]) for r in curve]

        sell_price = None
        sell_day = None
        sell_prob = None
        sell_reason = None
        for i in range(len(prices)):
            feats = _sell_features_for_day(
                float(buy_price), float(pred_pct), prices, days, i,
                t_date if isinstance(t_date, date) else date.fromisoformat(str(t_date)[:10]),
                expiry if isinstance(expiry, date) else date.fromisoformat(str(expiry)[:10]),
            )
            X = pd.DataFrame([feats])[sell_features]
            prob = float(sell_model.predict_proba(X)[0][1])
            if prob >= sell_threshold:
                sell_price = prices[i]
                sell_day = days[i]
                sell_prob = prob
                sell_reason = 'model_signal'
                break

        if sell_price is None:
            sell_price = prices[-1]
            sell_day = days[-1]
            sell_prob = None
            sell_reason = 'expiry'

        gross = sell_price - float(buy_price)
        fees = sell_price * fee_rate + fee_flat
        profit = gross - fees

        cur.execute("""
            UPDATE paper_positions
            SET status='sold', sell_price=%s, sold_at=%s, sell_reason=%s,
                profit=%s, fees=%s, sell_probability=%s
            WHERE id=%s
        """, (
            float(sell_price), sell_day, sell_reason,
            float(profit), float(fees),
            sell_prob, pos_id,
        ))
        cur.execute("""
            INSERT INTO paper_trades_log (
                strategy_id, action, tournament_id, card_name, product_id,
                price, quantity, predicted_change_pct, reason
            ) VALUES (%s, 'SELL', %s, %s, %s, %s, 1, %s, %s)
        """, (strategy_id, int(t_id), card, int(prod_id),
              float(sell_price), float(pred_pct), sell_reason))
        closed += 1

    conn.commit()
    cur.close()
    return closed


def reset_strategy(conn, strategy_id: str) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM paper_trades_log WHERE strategy_id=%s", (strategy_id,))
    cur.execute("DELETE FROM paper_positions WHERE strategy_id=%s", (strategy_id,))
    cur.execute("DELETE FROM paper_portfolio WHERE strategy_id=%s", (strategy_id,))
    conn.commit()
    cur.close()


def init_portfolio(conn, strategy_id: str, starting_cash: float, hold_days: int) -> None:
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO paper_portfolio (strategy_id, starting_cash, current_cash, hold_days)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (strategy_id) DO NOTHING
    """, (strategy_id, starting_cash, starting_cash, hold_days))
    conn.commit()
    cur.close()


def fetch_tournaments(conn, start: date, end: date) -> list[tuple[int, date]]:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, event_date FROM tournaments
        WHERE format='TCG' AND player_count > 0
          AND event_date >= %s AND event_date <= %s
        ORDER BY event_date, id
    """, (start, end))
    rows = [(r[0], r[1]) for r in cur.fetchall()]
    cur.close()
    return rows


def print_summary(conn, strategy_id: str) -> None:
    cur = conn.cursor()
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE status='sold') AS closed,
            COALESCE(SUM(profit) FILTER (WHERE status='sold'), 0) AS total_profit,
            COALESCE(SUM(buy_price) FILTER (WHERE status='sold'), 0) AS total_bought,
            COUNT(*) FILTER (WHERE status='sold' AND profit > 0) AS wins
        FROM paper_positions
        WHERE strategy_id=%s
    """, (strategy_id,))
    closed, total_profit, total_bought, wins = cur.fetchone()
    cur.close()

    print()
    print(f"PAPER TRADER SUMMARY — strategy_id={strategy_id}")
    if closed == 0:
        print("No closed positions.")
        return
    roi = total_profit / total_bought * 100 if total_bought > 0 else 0
    win_rate = wins / closed * 100
    print(f"  Closed positions: {closed}")
    print(f"  Total bought:     ${float(total_bought):,.2f}")
    print(f"  Total profit:     ${float(total_profit):+,.2f}")
    print(f"  ROI:              {roi:+.2f}%")
    print(f"  Win rate:         {win_rate:.1f}% ({wins}/{closed})")


def main():
    parser = argparse.ArgumentParser(description="Replay paper trader with periodic retraining")
    parser.add_argument('--strategy-id', default='default',
                        help="Base strategy id; the script writes both '{base}' (with fees) "
                             "and '{base}_nofee' (zero-fee) under this name")
    parser.add_argument('--start-date', type=str, default=None,
                        help="YYYY-MM-DD; defaults to current model's train_cutoff_date")
    parser.add_argument('--end-date', type=str, default=None,
                        help="YYYY-MM-DD; defaults to today")
    parser.add_argument('--retrain-interval-days', type=int, default=90)
    parser.add_argument('--top-n-per-tournament', type=int, default=5)
    parser.add_argument('--starting-cash', type=float, default=50000.0)
    parser.add_argument('--hold-days', type=int, default=60)
    parser.add_argument('--reset', action='store_true',
                        help="Wipe paper_* rows for both strategies before starting")
    args = parser.parse_args()

    buy_artifact, sell_artifact = load_models()

    start = (date.fromisoformat(args.start_date) if args.start_date
             else date.fromisoformat(str(buy_artifact['train_cutoff_date'])[:10]))
    end = date.fromisoformat(args.end_date) if args.end_date else date.today()

    # Two strategies in one pass; same model, same picks (modulo fee filter), different P&L math
    strategies = [
        (args.strategy_id, FEE_RATE, TRANSACTION_FEE_FLAT),
        (f"{args.strategy_id}_nofee", 0.0, 0.0),
    ]

    print(f"Replay window: {start} → {end}")
    print(f"Retrain every: {args.retrain_interval_days} days")
    print(f"Strategies:    {[s[0] for s in strategies]}")

    conn = get_db_connection()
    try:
        for strat_id, _, _ in strategies:
            if args.reset:
                print(f"Wiping prior rows for {strat_id}...")
                reset_strategy(conn, strat_id)
            init_portfolio(conn, strat_id, args.starting_cash, args.hold_days)

        tournaments = fetch_tournaments(conn, start, end)
        print(f"Found {len(tournaments)} tournaments to replay")

        last_retrain = start
        for t_id, t_date in tournaments:
            if (t_date - last_retrain).days >= args.retrain_interval_days:
                cutoff = t_date - timedelta(days=1)
                buy_artifact, sell_artifact = retrain_both(cutoff)
                last_retrain = t_date

            for strat_id, fee_rate, fee_flat in strategies:
                bought = buy_for_tournament(
                    conn, buy_artifact, t_id, strat_id,
                    args.top_n_per_tournament, args.hold_days,
                    fee_rate, fee_flat,
                )
                closed = close_due_positions(
                    conn, sell_artifact, strat_id, t_date, fee_rate, fee_flat,
                )
                if bought or closed:
                    print(f"  {t_date} t={t_id} [{strat_id}]: bought={bought} closed={closed}")

        for strat_id, fee_rate, fee_flat in strategies:
            close_due_positions(conn, sell_artifact, strat_id, end, fee_rate, fee_flat)
            print_summary(conn, strat_id)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
