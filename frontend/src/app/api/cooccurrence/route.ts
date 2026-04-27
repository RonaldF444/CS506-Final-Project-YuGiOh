import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const card = request.nextUrl.searchParams.get('card');

  if (!card) {
    const result = await pool.query(
      `SELECT DISTINCT c.name FROM cards c
       JOIN deck_profiles dp ON dp.main_deck::text LIKE '%' || c.id::text || '%'
          OR dp.extra_deck::text LIKE '%' || c.id::text || '%'
       LIMIT 500`
    );
    return NextResponse.json({ cards: result.rows.map(r => r.name) });
  }

  try {
    const result = await pool.query(`
      WITH tcg_decks AS (
          SELECT dp.id as dpid, dp.main_deck, dp.extra_deck, dp.side_deck
          FROM deck_profiles dp
          JOIN tournaments t ON t.id = dp.tournament_id
          WHERE t.format = 'TCG' AND t.player_count > 0
      ),
      deck_cards AS (
          SELECT DISTINCT dpid, c.name as card_name
          FROM (
              SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(main_deck::jsonb)
              UNION ALL
              SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(extra_deck::jsonb)
              UNION ALL
              SELECT dpid, value::text::int as card_id FROM tcg_decks, jsonb_array_elements_text(side_deck::jsonb)
          ) raw
          JOIN cards c ON c.id = raw.card_id
      ),
      target_decks AS (
          SELECT dpid FROM deck_cards WHERE card_name = $1
      ),
      target_count AS (
          SELECT COUNT(DISTINCT dpid) as cnt FROM target_decks
      ),
      mates AS (
          SELECT dc.card_name, COUNT(DISTINCT dc.dpid) as pair_count
          FROM deck_cards dc
          JOIN target_decks td ON dc.dpid = td.dpid
          WHERE dc.card_name != $1
          GROUP BY dc.card_name
          HAVING COUNT(DISTINCT dc.dpid) >= 3
      )
      SELECT m.card_name,
             m.pair_count,
             ROUND(m.pair_count::numeric / tc.cnt, 3) as strength,
             tc.cnt as total_decks,
             (SELECT market_price FROM market_snapshots ms
              JOIN printings p ON p.product_id = ms.product_id
              WHERE p.card_name = m.card_name
              ORDER BY ms.time DESC LIMIT 1) as current_price
      FROM mates m, target_count tc
      ORDER BY strength DESC
      LIMIT 15
    `, [card]);

    const cardInfo = await pool.query(
      `SELECT c.name, c.archetype,
              (SELECT market_price FROM market_snapshots ms
               JOIN printings p ON p.product_id = ms.product_id
               WHERE p.card_name = c.name
               ORDER BY ms.time DESC LIMIT 1) as current_price
       FROM cards c WHERE c.name = $1 LIMIT 1`,
      [card]
    );

    const deckCount = result.rows.length > 0 ? result.rows[0].total_decks : 0;

    return NextResponse.json({
      card: cardInfo.rows[0] || { name: card, archetype: null, current_price: null },
      totalDecks: parseInt(deckCount) || 0,
      deckmates: result.rows.map(r => ({
        cardName: r.card_name,
        pairCount: parseInt(r.pair_count),
        strength: parseFloat(r.strength),
        currentPrice: r.current_price ? parseFloat(r.current_price) : null,
      })),
    });
  } catch (error) {
    console.error('Co-occurrence API error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
