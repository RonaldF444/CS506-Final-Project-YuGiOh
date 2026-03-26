'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TargetDistribution } from '@/lib/types';

interface TargetDistributionChartProps {
  data: TargetDistribution;
}

export default function TargetDistributionChart({ data }: TargetDistributionChartProps) {
  const chartData = data.bins.map(bin => ({
    label: `${bin.bin_start}% to ${bin.bin_end}%`,
    midpoint: (bin.bin_start + bin.bin_end) / 2,
    count: bin.count,
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Target Distribution (price_change_pct)</h2>
      <p className="text-sm text-gray-400 mb-4">
        Distribution across {data.total_samples.toLocaleString()} {data.split} samples (clipped to [-100%, 500%])
      </p>

      <div className="grid grid-cols-5 gap-2 mb-4 text-center text-sm">
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-400">Mean</div>
          <div className="text-white font-medium">{data.mean}%</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-400">Median</div>
          <div className="text-white font-medium">{data.median}%</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-400">Std Dev</div>
          <div className="text-white font-medium">{data.std}%</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-400">P5</div>
          <div className="text-white font-medium">{data.p5}%</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-400">P95</div>
          <div className="text-white font-medium">{data.p95}%</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="midpoint"
            stroke="#9CA3AF"
            fontSize={11}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis stroke="#9CA3AF" fontSize={12} />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), 'Count']}
            labelFormatter={(label: number) => {
              const bin = chartData.find(d => d.midpoint === label);
              return bin ? bin.label : `${label}%`;
            }}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
          />
          <ReferenceLine
            x={data.mean}
            stroke="#F59E0B"
            strokeDasharray="5 5"
            label={{ value: `Mean: ${data.mean}%`, fill: '#F59E0B', fontSize: 11, position: 'top' }}
          />
          <Bar dataKey="count">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.midpoint < 0 ? '#EF4444' : '#10B981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
