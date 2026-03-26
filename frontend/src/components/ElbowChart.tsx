'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ElbowPoint } from '@/lib/types';

interface ElbowChartProps {
  data: ElbowPoint[];
  chosenK: number;
}

export default function ElbowChart({ data, chosenK }: ElbowChartProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Elbow Method — Optimal k</h2>
      <p className="text-sm text-gray-400 mb-4">
        Inertia (within-cluster sum of squares) vs number of clusters. The &quot;elbow&quot; suggests the best k.
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="k"
            stroke="#9CA3AF"
            fontSize={12}
            label={{ value: 'Number of Clusters (k)', position: 'bottom', fill: '#9CA3AF', fontSize: 12, offset: 5 }}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            label={{ value: 'Inertia', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            formatter={(value: number) => [value.toFixed(0), 'Inertia']}
            labelFormatter={(label) => `k = ${label}`}
          />
          <ReferenceLine
            x={chosenK}
            stroke="#10B981"
            strokeDasharray="5 5"
            label={{ value: `k=${chosenK}`, fill: '#10B981', fontSize: 12, position: 'top' }}
          />
          <Line
            type="monotone"
            dataKey="inertia"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ fill: '#3B82F6', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
