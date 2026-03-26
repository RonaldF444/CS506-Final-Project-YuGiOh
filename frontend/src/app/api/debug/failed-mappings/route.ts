import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT ygoprodeck_id, card_name, set_code, mapping_confidence, updated_at
       FROM card_mapping
       WHERE tcgplayer_product_id IS NULL
       ORDER BY updated_at DESC
       LIMIT 100`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed mappings query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
