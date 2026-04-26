"""SQL constants and query builders for training and prediction."""
from __future__ import annotations

BASE_CTES = """
    WITH tcg_decks AS (
        SELECT dp.id as deck_profile_id, dp.tournament_id, dp.placement,
               dp.main_deck, dp.extra_deck, dp.side_deck
        FROM deck_profiles dp
        JOIN tournaments t ON t.id = dp.tournament_id
        WHERE t.format = 'TCG' AND t.player_count > 0
    ),
    deck_card_entries AS (
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(main_deck::jsonb)
        UNION ALL
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(extra_deck::jsonb)
        UNION ALL
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(side_deck::jsonb)
    ),
    tournament_card_appearances AS (
        SELECT
            t.id as tournament_id,
            t.event_date,
            t.player_count,
            t.name as tournament_name,
            c.id as card_id,
            c.name as card_name,
            c.archetype as archetype,
            COUNT(DISTINCT dce.deck_profile_id) as decks_with_card,
            MIN(dce.placement) as best_placement,
            COUNT(*) as total_copies
        FROM deck_card_entries dce
        JOIN tournaments t ON t.id = dce.tournament_id
        JOIN cards c ON c.id = dce.card_id
        GROUP BY t.id, t.event_date, t.player_count, t.name, c.id, c.name, c.archetype
    ),
    ranked_printings AS (
        SELECT p.card_name, p.product_id, p.rarity, p.set_code,
               ROW_NUMBER() OVER (
                   PARTITION BY p.card_name
                   ORDER BY snap_count DESC, p.product_id
               ) as rn
        FROM printings p
        LEFT JOIN LATERAL (
            SELECT COUNT(*) as snap_count
            FROM market_snapshots ms
            WHERE ms.product_id = p.product_id
        ) sc ON true
    ),
    printing_counts AS (
        SELECT card_name, COUNT(*) as num_printings
        FROM printings
        GROUP BY card_name
    )
"""

LATERAL_JOINS_TRAINING = """
    JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '31 days'
          AND time < tca.event_date + INTERVAL '1 day'
        ORDER BY ABS(EXTRACT(EPOCH FROM (time - tca.event_date))) LIMIT 1
    ) ms_at ON true

    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '4 days'
          AND time < tca.event_date - INTERVAL '0 days'
        ORDER BY time DESC LIMIT 1
    ) ms_1d ON true

    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '7 days'
          AND time < tca.event_date - INTERVAL '1 day'
        ORDER BY time DESC LIMIT 1
    ) ms_3d ON true

    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '14 days'
          AND time < tca.event_date - INTERVAL '4 days'
        ORDER BY time DESC LIMIT 1
    ) ms_7d ON true

    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '45 days'
          AND time < tca.event_date - INTERVAL '14 days'
        ORDER BY time DESC LIMIT 1
    ) ms_30d ON true

    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '120 days'
          AND time < tca.event_date - INTERVAL '60 days'
        ORDER BY time DESC LIMIT 1
    ) ms_90d ON true

    LEFT JOIN LATERAL (
        SELECT MAX(market_price) as peak_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '30 days'
          AND time < tca.event_date
    ) ms_peak_30d ON true

    LEFT JOIN LATERAL (
        SELECT MAX(market_price) as peak_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '60 days'
          AND time < tca.event_date
    ) ms_peak_60d ON true
"""

LATERAL_JOIN_AFTER = """
    JOIN LATERAL (
        SELECT MAX(market_price) as market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date + INTERVAL '1 day'
          AND time < tca.event_date + INTERVAL '60 days'
    ) ms_after ON true
"""


def lateral_join_after(days: int) -> str:
    if days <= 1:
        return """
    JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date + INTERVAL '1 day'
          AND time < tca.event_date + INTERVAL '2 days'
        ORDER BY time ASC LIMIT 1
    ) ms_after ON true
"""
    return f"""
    JOIN LATERAL (
        SELECT MAX(market_price) as market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date + INTERVAL '1 day'
          AND time < tca.event_date + INTERVAL '{days} days'
    ) ms_after ON true
"""


MOMENTUM_COLUMNS = """
        CASE WHEN ms_1d.market_price > 0
            THEN (ms_at.market_price - ms_1d.market_price) / ms_1d.market_price
            ELSE 0 END as momentum_1d,
        CASE WHEN ms_3d.market_price > 0
            THEN (ms_at.market_price - ms_3d.market_price) / ms_3d.market_price
            ELSE 0 END as momentum_3d,
        CASE WHEN ms_7d.market_price > 0
            THEN (ms_at.market_price - ms_7d.market_price) / ms_7d.market_price
            ELSE 0 END as momentum_7d,
        CASE WHEN ms_30d.market_price > 0
            THEN (ms_at.market_price - ms_30d.market_price) / ms_30d.market_price
            ELSE 0 END as momentum_30d,
        CASE WHEN ms_90d.market_price > 0
            THEN (ms_at.market_price - ms_90d.market_price) / ms_90d.market_price
            ELSE 0 END as momentum_90d"""


def build_training_query(peak_days: int | None = None) -> str:
    after_join = lateral_join_after(peak_days) if peak_days else LATERAL_JOIN_AFTER

    return BASE_CTES + """
    SELECT
        tca.tournament_id,
        tca.event_date,
        tca.card_name,
        tca.archetype,
        p.product_id,
        p.rarity,
        pc.num_printings,
        tca.player_count as tournament_size,
        tca.decks_with_card,
        tca.best_placement,
        tca.total_copies,
        ms_at.market_price as price_at_tournament,
        ms_peak_30d.peak_price as peak_price_30d,
        ms_peak_60d.peak_price as peak_price_60d,
""" + MOMENTUM_COLUMNS + """,
        CASE
            WHEN ms_at.market_price > 0 AND ms_after.market_price > 0
            THEN (ms_after.market_price - ms_at.market_price) / ms_at.market_price * 100
            ELSE NULL
        END as price_change_pct

    FROM tournament_card_appearances tca
    JOIN ranked_printings p ON p.card_name = tca.card_name AND p.rn = 1
    LEFT JOIN printing_counts pc ON pc.card_name = tca.card_name
    """ + LATERAL_JOINS_TRAINING + after_join + """
    WHERE ms_at.market_price > 0
    """


def build_prediction_query(
    tournament_id: int | None = None,
    after_date: str | None = None,
) -> tuple[str, dict]:
    filters = ["ms_at.market_price > 0"]
    params: dict = {}
    if tournament_id is not None:
        filters.append("tca.tournament_id = %(tournament_id)s")
        params['tournament_id'] = tournament_id
    if after_date is not None:
        filters.append("tca.event_date > %(after_date)s")
        params['after_date'] = after_date

    where_clause = " AND ".join(filters)

    query = BASE_CTES + """
    SELECT
        tca.tournament_id,
        tca.event_date,
        tca.card_name,
        tca.archetype,
        tca.tournament_name,
        p.product_id,
        p.rarity,
        p.set_code,
        pc.num_printings,
        tca.player_count as tournament_size,
        tca.decks_with_card,
        tca.best_placement,
        tca.total_copies,
        ms_at.market_price as price_at_tournament,
        ms_peak_30d.peak_price as peak_price_30d,
        ms_peak_60d.peak_price as peak_price_60d,
""" + MOMENTUM_COLUMNS + f"""

    FROM tournament_card_appearances tca
    JOIN ranked_printings p ON p.card_name = tca.card_name AND p.rn = 1
    LEFT JOIN printing_counts pc ON pc.card_name = tca.card_name
    """ + LATERAL_JOINS_TRAINING + f"""
    WHERE {where_clause}
    """

    return query, params
