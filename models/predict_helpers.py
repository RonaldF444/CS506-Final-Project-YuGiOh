"""Single source of truth for inverting the buy-model's target transform.

Every consumer of the saved buy-model artifact (predict.py, paper trader,
sell-model training) must call this so a "predicted %" means the same thing
everywhere.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def apply_buy_model(model_data: dict, X: pd.DataFrame, with_std: bool = False):
    """Run the ensemble and return predictions in % space.

    Supports the three target transforms shipped: 'log', 'box_cox', or none.
    """
    models = model_data.get('models', [model_data['model']])
    target_transform = model_data.get('target_transform')

    raw_preds = np.column_stack([m.predict(X) for m in models])
    raw_avg = raw_preds.mean(axis=1)
    raw_std = raw_preds.std(axis=1)

    if target_transform == 'log':
        predictions = np.expm1(raw_avg) * 100
        std_pct = (np.expm1(raw_avg + raw_std) - np.expm1(raw_avg - raw_std)) / 2 * 100
    elif target_transform == 'box_cox':
        lambda_param = model_data.get('transform_lambda', 1.0)
        # Floor base so negative-lambda inverse stays in domain
        base = np.maximum(lambda_param * raw_avg + 1.0, 1e-6)
        predictions = (np.power(base, 1 / lambda_param) - 1) * 100
        predictions = np.clip(predictions, -100, 500)
        std_pct = raw_std * 100
    else:
        predictions = raw_avg
        std_pct = raw_std

    if with_std:
        return predictions, std_pct
    return predictions
