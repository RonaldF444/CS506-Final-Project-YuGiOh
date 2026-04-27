'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Deckmate {
  cardName: string;
  pairCount: number;
  strength: number;
  currentPrice: number | null;
}

interface CardInfo {
  name: string;
  archetype: string | null;
  current_price: number | null;
}

interface CooccurrenceData {
  card: CardInfo;
  totalDecks: number;
  deckmates: Deckmate[];
}

export default function CooccurrencePage() {
  const [search, setSearch] = useState('');
  const [data, setData] = useState<CooccurrenceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cooccurrence?card=${encodeURIComponent(search.trim())}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else if (json.deckmates.length === 0) {
        setError(`No deck data found for "${search.trim()}"`);
      } else {
        setData(json);
      }
    } catch {
      setError('Failed to fetch');
    } finally {
      setIsLoading(false);
    }
  };

  const maxStrength = data ? Math.max(...data.deckmates.map(d => d.strength)) : 1;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">Deck Co-occurrence</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter card name (e.g. Herald of the Arc Light)"
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="bg-gray-800 rounded-lg p-5 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{data.card.name}</h2>
                  {data.card.archetype && (
                    <span className="text-sm text-gray-400">Archetype: {data.card.archetype}</span>
                  )}
                </div>
                <div className="text-right">
                  {data.card.current_price && (
                    <div className="text-lg font-medium">${parseFloat(String(data.card.current_price)).toFixed(2)}</div>
                  )}
                  <div className="text-sm text-gray-400">Appears in {data.totalDecks} decks</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-semibold">Top Deckmates</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Cards that most frequently appear in the same deck lists. Strength = P(deckmate | this card).
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Card</th>
                    <th className="px-4 py-3 text-right">Strength</th>
                    <th className="px-4 py-3 w-48">Co-occurrence</th>
                    <th className="px-4 py-3 text-right">Shared Decks</th>
                    <th className="px-4 py-3 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deckmates.map((mate, i) => (
                    <tr
                      key={mate.cardName}
                      className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer"
                      onClick={() => { setSearch(mate.cardName); setTimeout(handleSearch, 100); }}
                    >
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{mate.cardName}</td>
                      <td className="px-4 py-3 text-right text-blue-400">
                        {(mate.strength * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(mate.strength / maxStrength) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {mate.pairCount} / {data.totalDecks}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {mate.currentPrice ? `$${mate.currentPrice.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!data && !error && !isLoading && (
          <div className="text-center text-gray-500 mt-12">
            <p className="text-lg mb-2">Search for a card to see its deck relationships</p>
            <p className="text-sm">Shows which cards most frequently appear together in tournament deck lists</p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {['Herald of the Arc Light', 'Ash Blossom & Joyous Spring', 'Fiendsmith\'s Tract', 'Mulcharmy Purulia'].map(name => (
                <button
                  key={name}
                  onClick={() => { setSearch(name); }}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
