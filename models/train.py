"""XGBoost regression pipeline with temporal split for price change prediction."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pandas as pd
import numpy as np
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from scipy.stats import spearmanr
from xgboost import XGBRegressor
import joblib

from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

from config import (
    MODEL_PATH, ML_SUMMARY_PATH, CS506_REPORT_PATH, CLUSTER_EXPLORATION_PATH,
    RANDOM_STATE, FEATURES, N_CLUSTERS, CLUSTER_FEATURES,
    MIN_CARD_PRICE,
)
from data_processing.extract import _build_cooccurrence_matrix, _apply_cooccurrence_features


def _fit_card_clusters(
    train_df: pd.DataFrame,
) -> tuple[dict[str, int], StandardScaler, KMeans, pd.DataFrame]:
    """Fit KMeans clustering on per-card profiles from training data."""
    card_profiles = train_df.groupby('card_name').agg(
        price_at_tournament=('price_at_tournament', 'mean'),
        price_volatility_7d=('price_volatility_7d', 'mean'),
        num_printings=('num_printings', 'first'),
        card_tournament_count=('card_tournament_count', 'last'),
        top_cut_rate=('top_cut_rate', 'last'),
        avg_prior_price_change=('avg_prior_price_change', 'last'),
    ).reset_index()

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(card_profiles[CLUSTER_FEATURES])

    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init=10)
    kmeans.fit(X_scaled)

    card_clusters = dict(zip(card_profiles['card_name'], kmeans.labels_.astype(int).tolist()))

    print(f"\n=== Card Clustering (k={N_CLUSTERS}) ===")
    for c in range(N_CLUSTERS):
        n = sum(1 for v in card_clusters.values() if v == c)
        profile = card_profiles.loc[kmeans.labels_ == c, CLUSTER_FEATURES].mean()
        print(f"  Cluster {c}: {n} cards — avg price ${profile['price_at_tournament']:.1f}, "
              f"tournaments {profile['card_tournament_count']:.0f}, "
              f"top-cut {profile['top_cut_rate']:.2f}, "
              f"price change {profile['avg_prior_price_change']:.1f}%")
    print()

    return card_clusters, scaler, kmeans, card_profiles


def _hyperparam_search(
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    n_coarse: int = 200,
    n_fine: int = 150,
) -> dict:
    """Two-stage random search: coarse grid then fine refinement around best."""
    import random as _random

    # Stage 1: Coarse search over wide grid
    coarse_space = {
        'n_estimators': [400, 600, 800, 1000, 1200],
        'max_depth': [2, 3, 4],
        'learning_rate': [0.01, 0.02, 0.03, 0.05, 0.07, 0.1],
        'min_child_weight': [5, 10, 15, 20, 30],
        'subsample': [0.6, 0.7, 0.8, 0.9],
        'colsample_bytree': [0.6, 0.7, 0.8, 0.9],
        'reg_alpha': [0.1, 0.3, 0.5, 1.0, 2.0],
        'reg_lambda': [1.0, 2.0, 3.0, 5.0],
        'gamma': [0.0, 0.1, 0.3, 0.5, 1.0],
    }

    rng = _random.Random(RANDOM_STATE)
    best_spearman = -1.0
    best_params: dict = {}

    print(f"=== Stage 1: Coarse Search ({n_coarse} iterations) ===")
    print()

    for i in range(n_coarse):
        params = {k: rng.choice(v) for k, v in coarse_space.items()}
        corr = _eval_params(params, X_train, y_train, X_val, y_val)

        if corr > best_spearman:
            best_spearman = corr
            best_params = params
            print(f"  [{i+1:>3}/{n_coarse}] New best Spearman={corr:.4f}  "
                  f"depth={params['max_depth']} lr={params['learning_rate']} "
                  f"est={params['n_estimators']} mcw={params['min_child_weight']}")

    print(f"\n  Stage 1 best: Spearman={best_spearman:.4f}")
    print()

    # Stage 2: Fine search around the best params
    fine_space = _build_fine_space(best_params)

    print(f"=== Stage 2: Fine Refinement ({n_fine} iterations) ===")
    print()

    for i in range(n_fine):
        params = {k: rng.choice(v) for k, v in fine_space.items()}
        corr = _eval_params(params, X_train, y_train, X_val, y_val)

        if corr > best_spearman:
            best_spearman = corr
            best_params = params
            print(f"  [{i+1:>3}/{n_fine}] New best Spearman={corr:.4f}  "
                  f"depth={params['max_depth']} lr={params['learning_rate']} "
                  f"est={params['n_estimators']} mcw={params['min_child_weight']}")

    print(f"\n  Final best Spearman: {best_spearman:.4f}")
    print(f"  Best params: {best_params}")
    print()

    return best_params


def _eval_params(
    params: dict,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
) -> float:
    """Train a model with given params and return validation Spearman."""
    model = XGBRegressor(
        **params,
        random_state=RANDOM_STATE,
        eval_metric='rmse',
        early_stopping_rounds=50,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )
    val_pred = model.predict(X_val)
    corr, _ = spearmanr(y_val, val_pred)
    return corr


def _build_fine_space(best: dict) -> dict:
    """Build a fine-grained search space centered on the best params found."""
    fine = {}

    # For n_estimators: +/- 200 in steps of 100
    center = best['n_estimators']
    fine['n_estimators'] = sorted({max(100, center + offset) for offset in [-200, -100, 0, 100, 200]})

    # max_depth: include neighbors (capped at 4 to limit overfitting)
    d = best['max_depth']
    fine['max_depth'] = sorted({v for v in [d - 1, d, d + 1] if 2 <= v <= 4})

    # learning_rate: finer steps around best
    lr = best['learning_rate']
    fine['learning_rate'] = sorted({round(v, 4) for v in [lr * 0.5, lr * 0.75, lr, lr * 1.25, lr * 1.5] if 0.005 <= v <= 0.2})

    # min_child_weight: neighbors
    mcw = best['min_child_weight']
    fine['min_child_weight'] = sorted({max(1, v) for v in [mcw - 3, mcw - 1, mcw, mcw + 1, mcw + 3, mcw + 5]})

    # subsample / colsample: +/- 0.05 steps
    for key in ['subsample', 'colsample_bytree']:
        v = best[key]
        fine[key] = sorted({round(x, 2) for x in [v - 0.1, v - 0.05, v, v + 0.05, v + 0.1] if 0.5 <= x <= 1.0})

    # reg_alpha: finer around best
    a = best['reg_alpha']
    fine['reg_alpha'] = sorted({round(v, 2) for v in [a * 0.5, a * 0.75, a, a * 1.5, a * 2.0] if v >= 0.01})

    # reg_lambda: finer around best
    l = best['reg_lambda']
    fine['reg_lambda'] = sorted({round(v, 1) for v in [l * 0.5, l * 0.75, l, l * 1.5, l * 2.0] if v >= 0.5})

    # gamma: neighbors
    g = best['gamma']
    fine['gamma'] = sorted({round(v, 2) for v in [max(0, g - 0.1), g, g + 0.1, g + 0.2] })

    return fine


def train_model(df: pd.DataFrame) -> dict:
    """Train XGBoost regressor for post-tournament price change prediction."""

    # Use features from config
    feature_columns = FEATURES

    # Sort by tournament date for temporal split
    df = df.sort_values('event_date').reset_index(drop=True)

    # Temporal split: train on older data, test on newer data
    # 70% train, 15% validation, 15% test (in chronological order)
    train_cutoff = int(len(df) * 0.70)
    val_cutoff = int(len(df) * 0.85)

    train_cutoff_date_str = str(df.iloc[train_cutoff - 1]['event_date'])

    # Build cooccurrence using only training-window decks
    cooccurrence_matrix = _build_cooccurrence_matrix(before_date=train_cutoff_date_str)
    df = _apply_cooccurrence_features(df, cooccurrence_matrix)

    card_clusters, cluster_scaler, cluster_kmeans, _ = _fit_card_clusters(df.iloc[:train_cutoff])

    # Assign clusters to all rows
    df['card_cluster'] = df['card_name'].map(card_clusters)
    unknown_mask = df['card_cluster'].isna()
    if unknown_mask.any():
        X_unknown = cluster_scaler.transform(df.loc[unknown_mask, CLUSTER_FEATURES])
        df.loc[unknown_mask, 'card_cluster'] = cluster_kmeans.predict(X_unknown)
    df['card_cluster'] = df['card_cluster'].astype(int)

    X = df[feature_columns]
    y = df['price_change_pct']

    # Log-transform target to reduce skew (improves ranking quality)
    y_log = np.log1p(y / 100)

    X_train = X.iloc[:train_cutoff]
    X_val = X.iloc[train_cutoff:val_cutoff]
    X_test = X.iloc[val_cutoff:]

    # Original-scale targets (for evaluation)
    y_train = y.iloc[:train_cutoff]
    y_val = y.iloc[train_cutoff:val_cutoff]
    y_test = y.iloc[val_cutoff:]

    # Log-scale targets (for training)
    y_train_log = y_log.iloc[:train_cutoff]
    y_val_log = y_log.iloc[train_cutoff:val_cutoff]

    # Show date ranges for each split
    train_dates = df.iloc[:train_cutoff]['event_date']
    val_dates = df.iloc[train_cutoff:val_cutoff]['event_date']
    test_dates = df.iloc[val_cutoff:]['event_date']
    print("=== Temporal Split Info ===")
    print(f"Train: {train_dates.min()} to {train_dates.max()}")
    print(f"Val:   {val_dates.min()} to {val_dates.max()}")
    print(f"Test:  {test_dates.min()} to {test_dates.max()}")
    print()

    print(f"Training set: {len(X_train)} rows")
    print(f"Validation set: {len(X_val)} rows")
    print(f"Test set: {len(X_test)} rows")
    print(f"Price change stats — Mean: {y_train.mean():.2f}%, Median: {y_train.median():.2f}%, Std: {y_train.std():.2f}%")
    print()

    # Hyperparameter search on log-transformed target
    best_params = _hyperparam_search(X_train, y_train_log, X_val, y_val_log)

    # Train ensemble of models with different random seeds
    N_ENSEMBLE = 5
    ensemble_models = []
    print(f"=== Training Ensemble ({N_ENSEMBLE} models) ===")
    for i in range(N_ENSEMBLE):
        seed = RANDOM_STATE + i
        m = XGBRegressor(
            **best_params,
            random_state=seed,
            eval_metric='rmse',
            early_stopping_rounds=50,
        )
        m.fit(
            X_train, y_train_log,
            eval_set=[(X_train, y_train_log), (X_val, y_val_log)],
            verbose=False,
        )
        ensemble_models.append(m)
        print(f"  Model {i+1}/{N_ENSEMBLE} trained (seed={seed})")
    print()

    # Predict by averaging ensemble in log space, then inverse-transform
    def _ensemble_predict(X):
        raw = np.column_stack([m.predict(X) for m in ensemble_models])
        return np.expm1(raw.mean(axis=1)) * 100

    y_train_pred = _ensemble_predict(X_train)
    y_val_pred = _ensemble_predict(X_val)
    y_test_pred = _ensemble_predict(X_test)

    # Average feature importances across ensemble
    avg_importances = np.mean([m.feature_importances_ for m in ensemble_models], axis=0)

    # Evaluate on training, validation, and test sets (original scale)
    print("=== Model Performance (Train vs Validation vs Test) ===")
    print()

    train_rmse = np.sqrt(mean_squared_error(y_train, y_train_pred))
    train_mae = mean_absolute_error(y_train, y_train_pred)
    train_r2 = r2_score(y_train, y_train_pred)
    val_rmse = np.sqrt(mean_squared_error(y_val, y_val_pred))
    val_mae = mean_absolute_error(y_val, y_val_pred)
    val_r2 = r2_score(y_val, y_val_pred)
    test_rmse = np.sqrt(mean_squared_error(y_test, y_test_pred))
    test_mae = mean_absolute_error(y_test, y_test_pred)
    test_r2 = r2_score(y_test, y_test_pred)

    print(f"{'Metric':<20} {'Train':<12} {'Validation':<12} {'Test':<12} {'Gap (Train-Test)':<15}")
    print(f"{'RMSE':<20} {train_rmse:<12.4f} {val_rmse:<12.4f} {test_rmse:<12.4f} {train_rmse - test_rmse:<15.4f}")
    print(f"{'MAE':<20} {train_mae:<12.4f} {val_mae:<12.4f} {test_mae:<12.4f} {train_mae - test_mae:<15.4f}")
    print(f"{'R²':<20} {train_r2:<12.4f} {val_r2:<12.4f} {test_r2:<12.4f} {train_r2 - test_r2:<15.4f}")
    print()

    # Ranking quality (Spearman correlation)
    print("=== Ranking Quality (Spearman Correlation) ===")
    print()
    test_tournament_ids = df.iloc[val_cutoff:]['tournament_id'].values
    for name, yt, yp, tids in [("Train", y_train, y_train_pred, df.iloc[:train_cutoff]['tournament_id'].values),
                                ("Val", y_val, y_val_pred, df.iloc[train_cutoff:val_cutoff]['tournament_id'].values),
                                ("Test", y_test, y_test_pred, test_tournament_ids)]:
        overall_corr, _ = spearmanr(yt, yp)
        per_t_corrs = []
        for tid in np.unique(tids):
            mask = tids == tid
            if mask.sum() < 5:
                continue
            c, _ = spearmanr(yt.values[mask], yp[mask])
            if not np.isnan(c):
                per_t_corrs.append(c)
        avg_per_t = np.mean(per_t_corrs) if per_t_corrs else 0.0
        print(f"  {name:<6} Overall: {overall_corr:.4f}  Avg per-tournament: {avg_per_t:.4f}")
    print()

    # Card-holdout analysis: seen vs unseen cards in test set
    print("=== Card Identity Leakage Analysis ===")
    print()
    train_cards = set(df.iloc[:train_cutoff]['card_name'].unique())
    test_card_names = df.iloc[val_cutoff:]['card_name'].values
    seen_mask = np.array([c in train_cards for c in test_card_names])
    unseen_mask = ~seen_mask

    n_seen = seen_mask.sum()
    n_unseen = unseen_mask.sum()
    n_seen_unique = len(set(test_card_names[seen_mask]))
    n_unseen_unique = len(set(test_card_names[unseen_mask]))
    print(f"  Test cards seen in training:   {n_seen} rows ({n_seen_unique} unique cards)")
    print(f"  Test cards NOT in training:    {n_unseen} rows ({n_unseen_unique} unique cards)")

    if n_seen >= 10:
        seen_spearman, _ = spearmanr(y_test.values[seen_mask], y_test_pred[seen_mask])
        seen_r2 = r2_score(y_test.values[seen_mask], y_test_pred[seen_mask])
        print(f"  Seen cards   — Spearman: {seen_spearman:.4f}  R²: {seen_r2:.4f}")
    if n_unseen >= 10:
        unseen_spearman, _ = spearmanr(y_test.values[unseen_mask], y_test_pred[unseen_mask])
        unseen_r2 = r2_score(y_test.values[unseen_mask], y_test_pred[unseen_mask])
        print(f"  Unseen cards — Spearman: {unseen_spearman:.4f}  R²: {unseen_r2:.4f}")
    elif n_unseen > 0:
        print(f"  Unseen cards — too few rows ({n_unseen}) for reliable metrics")
    else:
        print("  No unseen cards in test set (all test cards appeared in training)")

    if n_seen >= 10 and n_unseen >= 10:
        gap = seen_spearman - unseen_spearman
        if gap > 0.15:
            print(f"  WARNING: Large Spearman gap ({gap:.4f}) — model relies heavily on card identity")
        elif gap > 0.05:
            print(f"  NOTICE: Moderate Spearman gap ({gap:.4f}) — some card identity dependence")
        else:
            print(f"  OK: Small Spearman gap ({gap:.4f}) — model generalizes across cards")
    print()

    # Overfitting/Underfitting diagnosis
    r2_gap = train_r2 - test_r2
    print("=== Overfitting/Underfitting Analysis ===")
    print()
    if r2_gap > 0.10:
        print("WARNING: Potential OVERFITTING detected!")
        print(f"   Large R² gap between train ({train_r2:.4f}) and test ({test_r2:.4f})")
    elif r2_gap < 0.02 and test_r2 < 0.05:
        print("WARNING: Potential UNDERFITTING detected!")
        print(f"   Both train ({train_r2:.4f}) and test ({test_r2:.4f}) R² are low")
    else:
        print("Model appears well-fitted!")
        print(f"   Train-test R² gap is reasonable ({r2_gap:.4f})")
    print()

    # Prediction range analysis (critical for threshold-based trading)
    print("=== Prediction Range Analysis ===")
    print(f"  Train predictions: {y_train_pred.min():.2f}% to {y_train_pred.max():.2f}%")
    print(f"  Test predictions:  {y_test_pred.min():.2f}% to {y_test_pred.max():.2f}%")
    print(f"  Test actuals:      {y_test.min():.2f}% to {y_test.max():.2f}%")
    print(f"  Test pred > +15%:  {(y_test_pred > 15).sum()}")
    print(f"  Test pred > +20%:  {(y_test_pred > 20).sum()}")
    print(f"  Test pred > +25%:  {(y_test_pred > 25).sum()}")
    print()

    # Feature importance
    print("Feature Importance:")
    for feat, imp in sorted(zip(feature_columns, avg_importances), key=lambda x: -x[1]):
        print(f"  {feat}: {imp:.4f}")

    # Compute per-card stats from training data for use in prediction
    train_df = df.iloc[:train_cutoff]
    card_avg_prior_price_changes = train_df.groupby('card_name')['price_change_pct'].mean().to_dict()
    card_tournament_counts = train_df.groupby('card_name').size().to_dict()
    train_topped = (train_df['best_placement'] <= 8).astype(int)
    card_top_cut_rates = train_topped.groupby(train_df['card_name']).mean().to_dict()
    card_avg_decks = train_df.groupby('card_name')['decks_with_card'].mean().to_dict()

    # Save model with metadata
    train_cutoff_date = str(train_dates.max())
    joblib.dump({
        'model': ensemble_models[0],
        'models': ensemble_models,
        'features': feature_columns,
        'model_type': 'regressor',
        'target_transform': 'log',
        'train_cutoff_date': train_cutoff_date,
        'training_date_range': {
            'train': (str(train_dates.min()), str(train_dates.max())),
            'val': (str(val_dates.min()), str(val_dates.max())),
            'test': (str(test_dates.min()), str(test_dates.max())),
        },
        'card_avg_prior_price_changes': card_avg_prior_price_changes,
        'card_tournament_counts': card_tournament_counts,
        'card_top_cut_rates': card_top_cut_rates,
        'card_avg_decks': card_avg_decks,
        'card_clusters': card_clusters,
        'cluster_scaler': cluster_scaler,
        'cluster_kmeans': cluster_kmeans,
        'cooccurrence_matrix': cooccurrence_matrix,
    }, MODEL_PATH)
    print(f"\nModel saved to {MODEL_PATH}")
    print(f"Train cutoff date: {train_cutoff_date}")
    print(f"Card avg prior price changes saved for {len(card_avg_prior_price_changes)} cards")
    print(f"Card tournament counts saved for {len(card_tournament_counts)} cards")
    print(f"Card top-cut rates saved for {len(card_top_cut_rates)} cards")

    # Export ML summary as JSON for the frontend dashboard
    top_price_change_cards = sorted(
        [
            {
                'card_name': name,
                'mean_price_change': round(change, 4),
                'appearances': int(train_df[train_df['card_name'] == name].shape[0]),
            }
            for name, change in card_avg_prior_price_changes.items()
            if train_df[train_df['card_name'] == name].shape[0] >= 10
        ],
        key=lambda x: x['mean_price_change'],
        reverse=True,
    )[:25]

    ml_summary = {
        'training_date': datetime.now(timezone.utc).isoformat(),
        'training_rows': len(df),
        'model_type': 'regressor',
        'mean_price_change': round(float(y_train.mean()), 4),
        'median_price_change': round(float(y_train.median()), 4),
        'price_change_std': round(float(y_train.std()), 4),
        'date_ranges': {
            'train': [str(train_dates.min()), str(train_dates.max())],
            'val': [str(val_dates.min()), str(val_dates.max())],
            'test': [str(test_dates.min()), str(test_dates.max())],
        },
        'metrics': {
            'train': {'rmse': round(train_rmse, 4), 'mae': round(train_mae, 4), 'r2': round(train_r2, 4)},
            'val': {'rmse': round(val_rmse, 4), 'mae': round(val_mae, 4), 'r2': round(val_r2, 4)},
            'test': {'rmse': round(test_rmse, 4), 'mae': round(test_mae, 4), 'r2': round(test_r2, 4)},
        },
        'feature_importance': [
            {'feature': feat, 'importance': round(float(imp), 4)}
            for feat, imp in sorted(zip(feature_columns, avg_importances), key=lambda x: -x[1])
        ],
        'top_price_change_cards': top_price_change_cards,
        'overfitting': {
            'detected': bool(r2_gap > 0.10),
            'r2_gap': round(r2_gap, 4),
        },
    }

    with open(ML_SUMMARY_PATH, 'w') as f:
        json.dump(ml_summary, f, indent=2)
    print(f"ML summary exported to {ML_SUMMARY_PATH}")

    # Export per-card profiles for clustering exploration
    _export_cluster_exploration(df.iloc[:train_cutoff])

    # Export CS 506 report data
    _export_cs506_report(
        y_train=y_train,
        y_test=y_test,
        y_test_pred=y_test_pred,
        test_df=df.iloc[val_cutoff:],
        feature_columns=feature_columns,
        feature_importances=avg_importances,
        metrics={
            'train': {'rmse': round(train_rmse, 4), 'mae': round(train_mae, 4), 'r2': round(train_r2, 4)},
            'val': {'rmse': round(val_rmse, 4), 'mae': round(val_mae, 4), 'r2': round(val_r2, 4)},
            'test': {'rmse': round(test_rmse, 4), 'mae': round(test_mae, 4), 'r2': round(test_r2, 4)},
        },
        date_ranges={
            'train': [str(train_dates.min()), str(train_dates.max())],
            'val': [str(val_dates.min()), str(val_dates.max())],
            'test': [str(test_dates.min()), str(test_dates.max())],
        },
        training_rows=len(df),
        model_params=best_params,
    )

    return {
        'models': ensemble_models,
        'test_df': df.iloc[val_cutoff:].copy(),
        'test_predictions': y_test_pred,
    }


def _export_cluster_exploration(train_df: pd.DataFrame) -> None:
    """Export per-card feature profiles, cluster assignments, and elbow plot data."""
    # Aggregate per-card profiles from training data
    card_profiles = train_df.groupby('card_name').agg(
        price_at_tournament=('price_at_tournament', 'mean'),
        price_volatility_7d=('price_volatility_7d', 'mean'),
        num_printings=('num_printings', 'first'),
        card_tournament_count=('card_tournament_count', 'last'),
        top_cut_rate=('top_cut_rate', 'last'),
        avg_prior_price_change=('avg_prior_price_change', 'last'),
    ).reset_index()

    # Standardize for clustering
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(card_profiles[CLUSTER_FEATURES])

    # Elbow plot: run KMeans for k=2..10
    elbow_data = []
    for k in range(2, 11):
        km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
        km.fit(X_scaled)
        elbow_data.append({'k': k, 'inertia': round(float(km.inertia_), 2)})

    # Chosen k clustering
    chosen_km = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init=10)
    chosen_km.fit(X_scaled)
    card_profiles['cluster'] = chosen_km.labels_.astype(int)

    # Feature stats
    feature_stats = {}
    for feat in CLUSTER_FEATURES:
        vals = card_profiles[feat]
        feature_stats[feat] = {
            'min': round(float(vals.min()), 4),
            'max': round(float(vals.max()), 4),
            'mean': round(float(vals.mean()), 4),
            'std': round(float(vals.std()), 4),
        }

    # Cluster profiles (mean of each feature per cluster)
    cluster_profiles = []
    for c in range(N_CLUSTERS):
        mask = card_profiles['cluster'] == c
        profile = {'cluster': c, 'count': int(mask.sum())}
        for feat in CLUSTER_FEATURES:
            profile[feat] = round(float(card_profiles.loc[mask, feat].mean()), 4)
        cluster_profiles.append(profile)

    cards = [
        {
            'card_name': row['card_name'],
            'cluster': int(row['cluster']),
            **{feat: round(float(row[feat]), 4) for feat in CLUSTER_FEATURES},
        }
        for _, row in card_profiles.iterrows()
    ]

    report = {
        'generated_date': datetime.now(timezone.utc).isoformat(),
        'total_cards': len(cards),
        'features': CLUSTER_FEATURES,
        'feature_stats': feature_stats,
        'n_clusters': N_CLUSTERS,
        'elbow_data': elbow_data,
        'cluster_profiles': cluster_profiles,
        'cards': cards,
    }

    with open(CLUSTER_EXPLORATION_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"Cluster exploration data exported to {CLUSTER_EXPLORATION_PATH} ({len(cards)} cards)")


def _export_cs506_report(
    y_train: pd.Series,
    y_test: pd.Series,
    y_test_pred: np.ndarray,
    test_df: pd.DataFrame,
    feature_columns: list[str],
    feature_importances: np.ndarray,
    metrics: dict,
    date_ranges: dict,
    training_rows: int,
    model_params: dict,
) -> None:
    """Export visualization data for the CS 506 report page."""
    import random as _random

    # 1. Target distribution histogram
    clipped = np.clip(y_train.values, -100, 500)
    counts, bin_edges = np.histogram(clipped, bins=25)
    bins = [
        {'bin_start': round(float(bin_edges[i]), 2), 'bin_end': round(float(bin_edges[i + 1]), 2), 'count': int(counts[i])}
        for i in range(len(counts))
    ]
    target_distribution = {
        'bins': bins,
        'total_samples': int(len(y_train)),
        'split': 'train',
        'mean': round(float(y_train.mean()), 2),
        'median': round(float(y_train.median()), 2),
        'std': round(float(y_train.std()), 2),
        'min': round(float(y_train.min()), 2),
        'max': round(float(y_train.max()), 2),
        'p5': round(float(np.percentile(y_train, 5)), 2),
        'p95': round(float(np.percentile(y_train, 95)), 2),
    }

    # 2. Predicted vs actual (test set, sampled to max 2000 points)
    indices = np.arange(len(y_test))
    if len(indices) > 2000:
        rng = np.random.RandomState(42)
        indices = rng.choice(indices, size=2000, replace=False)
    points = [
        {'predicted': round(float(y_test_pred[i]), 2), 'actual': round(float(y_test.values[i]), 2)}
        for i in indices
    ]
    overall_spearman, _ = spearmanr(y_test, y_test_pred)
    pred_min = min(float(y_test_pred.min()), float(y_test.min()))
    pred_max = max(float(y_test_pred.max()), float(y_test.max()))
    predicted_vs_actual = {
        'points': points,
        'split': 'test',
        'count': int(len(y_test)),
        'r2': metrics['test']['r2'],
        'rmse': metrics['test']['rmse'],
        'spearman': round(float(overall_spearman), 4),
        'perfect_line': {'min': round(pred_min, 2), 'max': round(pred_max, 2)},
    }

    # 3. Rank-based backtest
    eligible = test_df[test_df['price_at_tournament'] >= MIN_CARD_PRICE].copy()
    eligible['predicted_change'] = y_test_pred[test_df['price_at_tournament'].values >= MIN_CARD_PRICE]
    avg_actual_change = float(eligible['price_change_pct'].mean())
    n_tournaments = int(eligible['tournament_id'].nunique())

    # Random baseline
    _random.seed(42)
    rand_rois = []
    for _ in range(20):
        rand_trades = []
        for _, group in eligible.groupby('tournament_id'):
            n_pick = min(5, len(group))
            rand_trades.append(group.sample(n=n_pick, random_state=_random.randint(0, 99999)))
        rdf = pd.concat(rand_trades)
        bp = rdf['price_at_tournament']
        sp = bp * (1 + rdf['price_change_pct'] / 100)
        zf_roi = ((sp - bp).sum() / bp.sum()) * 100
        rand_rois.append(zf_roi)

    rank_results = []
    for n in [1, 2, 3, 5, 10]:
        rank_trades = []
        for _, group in eligible.groupby('tournament_id'):
            rank_trades.append(group.nlargest(n, 'predicted_change'))
        rdf = pd.concat(rank_trades)
        bp = rdf['price_at_tournament']
        sp = bp * (1 + rdf['price_change_pct'] / 100)
        zf_roi = float((sp - bp).sum() / bp.sum() * 100)
        win_rate = float((rdf['price_change_pct'] > 0).mean() * 100)
        avg_act = float(rdf['price_change_pct'].mean())
        rank_results.append({
            'top_n': n,
            'trades': int(len(rdf)),
            'avg_actual_change': round(avg_act, 2),
            'edge_vs_baseline': round(avg_act - avg_actual_change, 2),
            'zero_fee_roi': round(zf_roi, 2),
            'win_rate': round(win_rate, 1),
        })

    backtest = {
        'n_tournaments': n_tournaments,
        'eligible_cards': int(len(eligible)),
        'avg_actual_change': round(avg_actual_change, 2),
        'min_card_price': MIN_CARD_PRICE,
        'rank_results': rank_results,
        'random_baseline': {
            'roi': round(float(np.mean(rand_rois)), 2),
            'std': round(float(np.std(rand_rois)), 2),
            'n_trials': 20,
        },
    }

    # 4. Feature importance
    feature_importance = [
        {'feature': feat, 'importance': round(float(imp), 4)}
        for feat, imp in sorted(zip(feature_columns, feature_importances), key=lambda x: -x[1])
    ]

    report = {
        'generated_date': datetime.now(timezone.utc).isoformat(),
        'target_distribution': target_distribution,
        'predicted_vs_actual': predicted_vs_actual,
        'backtest': backtest,
        'feature_importance': feature_importance,
        'model_info': {
            'model_type': 'XGBRegressor',
            'n_estimators': model_params['n_estimators'],
            'max_depth': model_params['max_depth'],
            'learning_rate': model_params['learning_rate'],
            'training_rows': training_rows,
            'n_features': len(feature_columns),
            'date_ranges': date_ranges,
            'metrics': metrics,
        },
    }

    with open(CS506_REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"CS 506 report exported to {CS506_REPORT_PATH}")


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from data_processing.extract import get_training_data

    print("Loading data...")
    df = get_training_data()
    print(f"Loaded {len(df)} rows")
    print()

    train_model(df)
