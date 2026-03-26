import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  const dataPath = process.env.CLUSTER_EXPLORATION_PATH
    || path.resolve(process.cwd(), '..', 'CardzTzar-price-predictor', 'models', 'cluster_exploration.json');

  try {
    const data = await readFile(dataPath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Failed to read cluster exploration data:', error);
    return NextResponse.json(
      { error: 'Cluster data not found. Run the training pipeline first.' },
      { status: 404 }
    );
  }
}
