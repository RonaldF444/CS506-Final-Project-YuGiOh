import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(added_by, 'unknown') as added_by,
         COUNT(*)::int as count,
         COUNT(CASE WHEN is_active THEN 1 END)::int as active
       FROM watched_printings
       GROUP BY added_by
       ORDER BY count DESC`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Watch sources query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
