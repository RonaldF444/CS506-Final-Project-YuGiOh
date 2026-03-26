import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  const summaryPath = process.env.ML_SUMMARY_PATH
    || path.resolve(process.cwd(), '..', 'CardzTzar-price-predictor', 'models', 'ml_summary.json');

  try {
    const data = await readFile(summaryPath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Failed to read ML summary:', error);
    return NextResponse.json(
      { error: 'ML summary not found. Run the training pipeline first.' },
      { status: 404 }
    );
  }
}
