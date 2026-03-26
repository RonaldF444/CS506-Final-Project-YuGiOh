import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  const reportPath = process.env.CS506_REPORT_PATH
    || path.resolve(process.cwd(), '..', 'CardzTzar-price-predictor', 'models', 'cs506_report.json');

  try {
    const data = await readFile(reportPath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Failed to read CS506 report:', error);
    return NextResponse.json(
      { error: 'Report data not found. Run the training pipeline first.' },
      { status: 404 }
    );
  }
}
