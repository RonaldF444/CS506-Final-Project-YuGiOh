'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { TournamentPriceData } from '@/lib/types';

interface TournamentPriceChartProps {
  cards: string[];
}

export default function TournamentPriceChart({ cards }: TournamentPriceChartProps) {
  const [selectedCard, setSelectedCard] = useState(cards[0] || '');
  const [tournaments, setTournaments] = useState<TournamentPriceData[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<TournamentPriceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedCard) return;

    const fetchPrices = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/ml/tournament-prices?card_name=${encodeURIComponent(selectedCard)}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setTournaments(data);
          setSelectedTournament(data[0]);
        } else {
          setTournaments([]);
          setSelectedTournament(null);
        }
      } catch (error) {
        console.error('Failed to fetch tournament prices:', error);
        setTournaments([]);
        setSelectedTournament(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
  }, [selectedCard]);

  const chartData = selectedTournament?.prices.map(p => ({
    time: p.time,
    market_price: Number(p.market_price),
  })) || [];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Price Around Tournament</h2>
      <p className="text-sm text-gray-400 mb-4">
        Market price in the 7 days before and after a tournament appearance
      </p>

      <div className="flex gap-4 mb-4">
        <select
          value={selectedCard}
          onChange={(e) => setSelectedCard(e.target.value)}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 text-sm"
        >
          {cards.map(card => (
            <option key={card} value={card}>{card}</option>
          ))}
        </select>

        {tournaments.length > 0 && (
          <select
            value={selectedTournament?.event_date || ''}
            onChange={(e) => {
              const t = tournaments.find(t => t.event_date === e.target.value);
              if (t) setSelectedTournament(t);
            }}
            className="bg-gray-700 text-white rounded-lg px-3 py-2 text-sm"
          >
            {tournaments.map(t => (
              <option key={t.event_date} value={t.event_date}>
                {t.tournament_name} ({format(new Date(t.event_date), 'MMM d, yyyy')})
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center text-gray-400">Loading...</div>
      ) : chartData.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          No price data available for this card/tournament
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              tickFormatter={(t) => format(new Date(t), 'MMM d')}
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
              formatter={(value) => `$${Number(value).toFixed(2)}`}
              labelFormatter={(label) => format(new Date(label), 'PPpp')}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
            />
            {selectedTournament && (
              <ReferenceLine
                x={new Date(selectedTournament.event_date).toISOString()}
                stroke="#EF4444"
                strokeDasharray="5 5"
                label={{ value: 'Tournament', fill: '#EF4444', fontSize: 11, position: 'top' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="market_price"
              name="Market Price"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
