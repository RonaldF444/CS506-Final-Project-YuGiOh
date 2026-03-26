import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get('range') || '24h';

  // Calculate time range
  let interval: string;
  switch (range) {
    case '1h':
      interval = '1 hour';
      break;
    case '6h':
      interval = '6 hours';
      break;
    case '24h':
      interval = '24 hours';
      break;
    case '7d':
      interval = '7 days';
      break;
    case '30d':
      interval = '30 days';
      break;
    case 'all':
      interval = '10 years';
      break;
    default:
      interval = '24 hours';
  }

  try {
    const result = await pool.query(
      `SELECT
        time,
        market_price,
        lowest_price,
        median_price,
        total_listings
      FROM market_snapshots
      WHERE product_id = $1
        AND time >= NOW() - INTERVAL '${interval}'
      ORDER BY time ASC`,
      [productId]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Price fetch error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
