import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, tournament_id, player_name, created_at
       FROM deck_profiles
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT 50`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unprocessed decks query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
