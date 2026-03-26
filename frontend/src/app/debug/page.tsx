'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FailedMapping, UnprocessedDeck, BackfillJob, WatchSource, HistoryCoverage } from '@/lib/types';
import MarketIndexChart from '@/components/MarketIndexChart';

type SortField = 'card_name' | 'earliest_market' | 'market_missing' | 'earliest_sale' | 'sales_missing';
type SortDirection = 'asc' | 'desc';

export default function DebugPage() {
  const [failedMappings, setFailedMappings] = useState<FailedMapping[]>([]);
  const [unprocessedDecks, setUnprocessedDecks] = useState<UnprocessedDeck[]>([]);
  const [backfillJobs, setBackfillJobs] = useState<BackfillJob[]>([]);
  const [watchSources, setWatchSources] = useState<WatchSource[]>([]);
  const [historyCoverage, setHistoryCoverage] = useState<HistoryCoverage[]>([]);
  const [sortField, setSortField] = useState<SortField>('market_missing');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mappingsRes, decksRes, jobsRes, sourcesRes, coverageRes] = await Promise.all([
        fetch('/api/debug/failed-mappings'),
        fetch('/api/debug/unprocessed-decks'),
        fetch('/api/debug/backfill-jobs'),
        fetch('/api/debug/watch-sources'),
        fetch('/api/debug/history-coverage'),
      ]);

      const [mappings, decks, jobs, sources, coverage] = await Promise.all([
        mappingsRes.json(),
        decksRes.json(),
        jobsRes.json(),
        sourcesRes.json(),
        coverageRes.json(),
      ]);

      if (!mappings.error) setFailedMappings(mappings);
      if (!decks.error) setUnprocessedDecks(decks);
      if (!jobs.error) setBackfillJobs(jobs);
      if (!sources.error) setWatchSources(sources);
      if (!coverage.error) setHistoryCoverage(coverage);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch debug data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'running': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedHistoryCoverage = [...historyCoverage].sort((a, b) => {
    let aVal: number | string | null = null;
    let bVal: number | string | null = null;

    switch (sortField) {
      case 'card_name':
        aVal = a.card_name || '';
        bVal = b.card_name || '';
        break;
      case 'earliest_market':
        aVal = a.earliest_market_date ? new Date(a.earliest_market_date).getTime() : null;
        bVal = b.earliest_market_date ? new Date(b.earliest_market_date).getTime() : null;
        break;
      case 'market_missing':
        aVal = a.market_days_missing;
        bVal = b.market_days_missing;
        break;
      case 'earliest_sale':
        aVal = a.earliest_sale_date ? new Date(a.earliest_sale_date).getTime() : null;
        bVal = b.earliest_sale_date ? new Date(b.earliest_sale_date).getTime() : null;
        break;
      case 'sales_missing':
        aVal = a.sales_days_missing;
        bVal = b.sales_days_missing;
        break;
    }

    // Handle nulls - push them to the end
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="text-left py-2 cursor-pointer hover:text-white"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">
              &larr; Back
            </Link>
            <h1 className="text-2xl font-bold">Debug Dashboard</h1>
            <Link href="/ml" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              ML Analytics
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchAllData}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Market Index */}
        <MarketIndexChart />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Failed Mappings */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-red-400">&#x2717;</span>
              Failed Mappings
              <span className="text-sm font-normal text-gray-400">
                ({failedMappings.length})
              </span>
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {failedMappings.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No failed mappings</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2">Card Name</th>
                      <th className="text-left py-2">YGO ID</th>
                      <th className="text-left py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedMappings.map((mapping) => (
                      <tr key={mapping.ygoprodeck_id} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2">{mapping.card_name || 'Unknown'}</td>
                        <td className="py-2 text-gray-400">{mapping.ygoprodeck_id}</td>
                        <td className="py-2 text-gray-400 text-xs">{formatDate(mapping.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Unprocessed Decks */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-yellow-400">&#x23F3;</span>
              Unprocessed Decks
              <span className="text-sm font-normal text-gray-400">
                ({unprocessedDecks.length})
              </span>
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {unprocessedDecks.length === 0 ? (
                <p className="text-green-400 text-center py-4">All decks processed!</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2">Deck ID</th>
                      <th className="text-left py-2">Tournament</th>
                      <th className="text-left py-2">Player</th>
                      <th className="text-left py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unprocessedDecks.map((deck) => (
                      <tr key={deck.id} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2">{deck.id}</td>
                        <td className="py-2 text-gray-400">{deck.tournament_id}</td>
                        <td className="py-2">{deck.player_name}</td>
                        <td className="py-2 text-gray-400 text-xs">{formatDate(deck.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Backfill Jobs */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-blue-400">&#x21BB;</span>
              Backfill Jobs
              <span className="text-sm font-normal text-gray-400">
                ({backfillJobs.length})
              </span>
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {backfillJobs.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No backfill jobs</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2">ID</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Progress</th>
                      <th className="text-left py-2">Triggered By</th>
                      <th className="text-left py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backfillJobs.map((job) => (
                      <tr key={job.id} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2">{job.id}</td>
                        <td className={`py-2 font-medium ${getStatusColor(job.status)}`}>
                          {job.status}
                        </td>
                        <td className="py-2">
                          {job.products_processed}/{job.products_total}
                          {job.products_total > 0 && (
                            <span className="text-gray-400 ml-1">
                              ({Math.round((job.products_processed / job.products_total) * 100)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-gray-400 text-xs">{job.triggered_by || '-'}</td>
                        <td className="py-2 text-gray-400 text-xs">{formatDate(job.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {backfillJobs.some(j => j.error_message) && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded">
                <h3 className="text-red-400 font-medium mb-2">Errors:</h3>
                {backfillJobs.filter(j => j.error_message).map(job => (
                  <p key={job.id} className="text-sm text-red-300">
                    Job #{job.id}: {job.error_message}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Watch Sources */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-green-400">&#x1F441;</span>
              Watch Sources
              <span className="text-sm font-normal text-gray-400">
                ({watchSources.reduce((sum, s) => sum + s.count, 0)} total)
              </span>
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {watchSources.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No watched cards</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2">Source</th>
                      <th className="text-right py-2">Total</th>
                      <th className="text-right py-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchSources.map((source) => (
                      <tr key={source.added_by} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2 font-mono text-xs">{source.added_by}</td>
                        <td className="py-2 text-right">{source.count}</td>
                        <td className="py-2 text-right text-green-400">{source.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* History Coverage - Full Width */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-purple-400">&#x1F4CA;</span>
            History Coverage
            <span className="text-sm font-normal text-gray-400">
              ({historyCoverage.length} cards)
            </span>
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Click column headers to sort. Shows days of market/sales data collected vs expected.
          </p>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {historyCoverage.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No watched cards</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-800">
                  <tr>
                    <SortHeader field="card_name">Card Name</SortHeader>
                    <th className="text-left py-2">Set</th>
                    <SortHeader field="earliest_market">Earliest Market</SortHeader>
                    <th className="text-right py-2">Market Days</th>
                    <SortHeader field="market_missing">Market Missing</SortHeader>
                    <SortHeader field="earliest_sale">Earliest Sale</SortHeader>
                    <th className="text-right py-2">Sale Days</th>
                    <SortHeader field="sales_missing">Sales Missing</SortHeader>
                    <th className="text-right py-2">Total Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistoryCoverage.map((item) => (
                    <tr key={item.product_id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2">{item.card_name}</td>
                      <td className="py-2 text-gray-400 text-xs">{item.set_code}</td>
                      <td className="py-2 text-xs">{formatShortDate(item.earliest_market_date)}</td>
                      <td className="py-2 text-right">
                        {item.market_days_with_data ?? '-'}
                        {item.market_total_days_expected && (
                          <span className="text-gray-500">/{item.market_total_days_expected}</span>
                        )}
                      </td>
                      <td className={`py-2 text-right ${(item.market_days_missing ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {item.market_days_missing ?? '-'}
                      </td>
                      <td className="py-2 text-xs">{formatShortDate(item.earliest_sale_date)}</td>
                      <td className="py-2 text-right">
                        {item.sales_days_with_data ?? '-'}
                        {item.sales_total_days_expected && (
                          <span className="text-gray-500">/{item.sales_total_days_expected}</span>
                        )}
                      </td>
                      <td className={`py-2 text-right ${(item.sales_days_missing ?? 0) > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {item.sales_days_missing ?? '-'}
                      </td>
                      <td className="py-2 text-right text-gray-400">{item.total_sales ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
