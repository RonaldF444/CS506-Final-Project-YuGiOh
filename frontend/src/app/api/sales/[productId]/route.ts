import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const result = await pool.query(
      `SELECT
        product_id,
        order_date,
        condition,
        variant,
        language,
        quantity,
        purchase_price,
        shipping_price
      FROM sales
      WHERE product_id = $1
      ORDER BY order_date DESC
      LIMIT $2`,
      [productId, limit]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Sales fetch error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
