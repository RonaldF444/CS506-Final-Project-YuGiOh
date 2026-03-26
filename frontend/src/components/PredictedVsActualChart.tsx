'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { PredictedVsActual } from '@/lib/types';

interface PredictedVsActualChartProps {
  data: PredictedVsActual;
}

export default function PredictedVsActualChart({ data }: PredictedVsActualChartProps) {
  // Clamp axis range for readability (avoid extreme outliers stretching the chart)
  const axisMin = Math.max(data.perfect_line.min, -50);
  const axisMax = Math.min(data.perfect_line.max, 300);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Predicted vs Actual (Test Set)</h2>
      <p className="text-sm text-gray-400 mb-4">
        {data.count.toLocaleString()} predictions | R² = {data.r2.toFixed(4)} | Spearman = {data.spearman.toFixed(3)} | RMSE = {data.rmse.toFixed(2)}
      </p>

      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            type="number"
            dataKey="predicted"
            name="Predicted"
            stroke="#9CA3AF"
            fontSize={12}
            domain={[axisMin, axisMax]}
            tickFormatter={(v) => `${v}%`}
            label={{ value: 'Predicted Change (%)', position: 'bottom', fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="actual"
            name="Actual"
            stroke="#9CA3AF"
            fontSize={12}
            domain={[axisMin, axisMax]}
            tickFormatter={(v) => `${v}%`}
            label={{ value: 'Actual Change (%)', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(2)}%`}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
          />
          {/* Perfect prediction diagonal */}
          <ReferenceLine
            segment={[
              { x: axisMin, y: axisMin },
              { x: axisMax, y: axisMax },
            ]}
            stroke="#6B7280"
            strokeDasharray="5 5"
            label={{ value: 'y = x', fill: '#6B7280', fontSize: 11 }}
          />
          <Scatter data={data.points} fill="#10B981" opacity={0.35} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
