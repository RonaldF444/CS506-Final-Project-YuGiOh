'use client';

import { useState, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';

interface SalePoint {
  order_date: string;
  purchase_price: number;
  condition: string;
  quantity: number;
  timestamp: number;
}

interface SalesChartProps {
  productId: number;
  cardName: string;
}

const TIME_RANGES = [
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'All', value: 'all' },
];

const CONDITION_COLORS: Record<string, string> = {
  'Near Mint': '#10B981',
  'Lightly Played': '#F59E0B',
  'Moderately Played': '#F97316',
  'Heavily Played': '#EF4444',
  'Damaged': '#991B1B',
};

export default function SalesChart({ productId, cardName }: SalesChartProps) {
  const [sales, setSales] = useState<SalePoint[]>([]);
  const [range, setRange] = useState('7d');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSales = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/sales/${productId}?limit=500`);
        const data = await res.json();

        if (Array.isArray(data)) {
          // Filter by time range and add timestamp for x-axis
          const now = Date.now();
          const rangeMs: Record<string, number> = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': 10 * 365 * 24 * 60 * 60 * 1000,
          };

          const filtered = data
            .map((s: SalePoint) => ({
              ...s,
              purchase_price: Number(s.purchase_price),
              timestamp: new Date(s.order_date).getTime(),
            }))
            .filter((s: SalePoint) => now - s.timestamp <= rangeMs[range])
            .sort((a: SalePoint, b: SalePoint) => a.timestamp - b.timestamp);

          setSales(filtered);
        } else {
          setSales([]);
        }
      } catch (error) {
        console.error('Sales fetch error:', error);
        setSales([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSales();
  }, [productId, range]);

  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    if (range === '24h') {
      return format(date, 'HH:mm');
    } else if (range === '7d') {
      return format(date, 'EEE');
    } else {
      return format(date, 'MMM d');
    }
  };

  // Group sales by condition for different colored series
  const groupedByCondition = sales.reduce((acc, sale) => {
    const condition = sale.condition || 'Unknown';
    if (!acc[condition]) {
      acc[condition] = [];
    }
    acc[condition].push(sale);
    return acc;
  }, {} as Record<string, SalePoint[]>);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: SalePoint }> }) => {
    if (active && payload && payload.length) {
      const sale = payload[0].payload;
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
          <p className="text-white font-medium">${Number(sale.purchase_price).toFixed(2)}</p>
          <p className="text-gray-400">{sale.condition}</p>
          <p className="text-gray-400">Qty: {sale.quantity}</p>
          <p className="text-gray-400">{format(new Date(sale.order_date), 'MMM d, HH:mm')}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">{cardName} - Sales History</h2>
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
      ) : sales.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          No sales data available for this time range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              stroke="#9CA3AF"
              fontSize={12}
            />
            <YAxis
              dataKey="purchase_price"
              type="number"
              tickFormatter={(v) => `$${v}`}
              stroke="#9CA3AF"
              fontSize={12}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {Object.entries(groupedByCondition).map(([condition, data]) => (
              <Scatter
                key={condition}
                name={condition}
                data={data}
                fill={CONDITION_COLORS[condition] || '#6B7280'}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      )}

      <div className="mt-2 text-sm text-gray-400 text-center">
        {sales.length} sales in this time range
      </div>
    </div>
  );
}
