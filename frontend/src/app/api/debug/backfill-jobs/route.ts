import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, status, triggered_by, products_processed, products_total,
              error_message, created_at, started_at, completed_at
       FROM backfill_queue
       ORDER BY created_at DESC
       LIMIT 20`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Backfill jobs query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
