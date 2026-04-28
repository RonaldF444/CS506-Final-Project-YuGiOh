"""Data-leakage guardrails for SQL query builders."""
from data_processing.queries import build_training_query, build_prediction_query


def test_training_query_includes_post_tournament_join():
    q = build_training_query()
    assert "ms_after" in q, "training query must read post-tournament price for the target"
    assert "price_change_pct" in q


def test_prediction_query_excludes_post_tournament_join():
    q, _ = build_prediction_query(tournament_id=1)
    # Prediction must NEVER read future prices
    assert "ms_after" not in q
    assert "price_change_pct" not in q


def test_prediction_query_parameterized():
    q, params = build_prediction_query(tournament_id=42, after_date="2024-01-01")
    assert params == {"tournament_id": 42, "after_date": "2024-01-01"}
    assert "%(tournament_id)s" in q
    assert "%(after_date)s" in q


def test_prediction_query_no_filter_when_args_omitted():
    _, params = build_prediction_query()
    assert params == {}


def test_both_queries_share_archetype_column():
    train_q = build_training_query()
    pred_q, _ = build_prediction_query()
    assert "tca.archetype" in train_q
    assert "tca.archetype" in pred_q


def test_custom_peak_days_changes_after_window():
    default_q = build_training_query()
    custom_q = build_training_query(peak_days=14)
    assert "INTERVAL '60 days'" in default_q
    assert "INTERVAL '14 days'" in custom_q
