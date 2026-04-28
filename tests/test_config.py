"""Sanity checks on the FEATURES list."""
from config import FEATURES, CLUSTER_FEATURES


def test_features_count_is_22():
    assert len(FEATURES) == 22


def test_features_unique():
    assert len(FEATURES) == len(set(FEATURES))


def test_cluster_features_unique():
    assert len(CLUSTER_FEATURES) == len(set(CLUSTER_FEATURES))


def test_no_target_column_in_features():
    # price_change_pct is the target — never a feature
    assert "price_change_pct" not in FEATURES
