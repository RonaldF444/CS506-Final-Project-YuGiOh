'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { PricePoint } from '@/lib/types';

interface PriceChartProps {
  productId: number;
  cardName: string;
}

const TIME_RANGES = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'All', value: 'all' },
];

export default function PriceChart({ productId, cardName }: PriceChartProps) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [range, setRange] = useState('24h');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPrices = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/prices/${productId}?range=${range}`);
        const prices = await res.json();
        // Handle error responses or non-array data
        if (Array.isArray(prices)) {
          // Convert string prices to numbers
          const normalized = prices.map(p => ({
            ...p,
            market_price: Number(p.market_price),
            lowest_price: Number(p.lowest_price),
            median_price: Number(p.median_price),
          }));
          setData(normalized);
        } else {
          console.error('Prices API error:', prices);
          setData([]);
        }
      } catch (error) {
        console.error('Price fetch error:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
  }, [productId, range]);

  const formatXAxis = (time: string) => {
    const date = new Date(time);
    if (range === '1h' || range === '6h') {
      return format(date, 'HH:mm');
    } else if (range === '24h') {
      return format(date, 'HH:mm');
    } else if (range === '7d') {
      return format(date, 'EEE HH:mm');
    } else {
      return format(date, 'MMM d');
    }
  };

  const formatTooltip = (value: number | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">{cardName} - Price History</h2>
        <div className="flex gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setRange(tr.value)}
              className={`px-3 py-1 rounded text-sm ${
                range === tr.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          No price data available for this time range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              tickFormatter={formatXAxis}
              stroke="#9CA3AF"
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              stroke="#9CA3AF"
              fontSize={12}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={formatTooltip}
              labelFormatter={(label) => format(new Date(label), 'PPpp')}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="market_price"
              name="Market"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="lowest_price"
              name="Lowest"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="median_price"
              name="Median"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
