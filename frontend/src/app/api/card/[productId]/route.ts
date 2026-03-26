import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;

  try {
    const result = await pool.query(
      `SELECT
        p.product_id,
        p.card_name,
        p.set_code,
        p.set_name,
        p.rarity,
        (SELECT market_price FROM market_snapshots ms
         WHERE ms.product_id = p.product_id
         ORDER BY ms.time DESC LIMIT 1) as latest_price,
        (SELECT lowest_price FROM market_snapshots ms
         WHERE ms.product_id = p.product_id
         ORDER BY ms.time DESC LIMIT 1) as lowest_price,
        (SELECT total_listings FROM market_snapshots ms
         WHERE ms.product_id = p.product_id
         ORDER BY ms.time DESC LIMIT 1) as total_listings
      FROM printings p
      WHERE p.product_id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Card fetch error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
