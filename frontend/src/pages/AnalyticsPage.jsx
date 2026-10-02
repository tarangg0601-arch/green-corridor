import { useState, useEffect } from 'react';
import { fetchAnalytics } from '../api/alerts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const stats = await fetchAnalytics();
        setData(stats);
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) return <div className="p-6">Loading analytics...</div>;

  const totalSavedSeconds = (data?.total_signals_prioritized || 0) * 15;
  const minsSaved = Math.floor(totalSavedSeconds / 60);

  const chartData = data?.chart_data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-gc-dark mb-6">System Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border-t-4 border-blue-500">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-1">Total Trips Facilitated</h3>
          <p className="text-3xl font-bold text-gray-900">{data?.total_trips || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-t-4 border-gc-green">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-1">Signals Prioritized</h3>
          <p className="text-3xl font-bold text-gray-900">{data?.total_signals_prioritized || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-t-4 border-orange-500">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-1">Estimated Time Saved</h3>
          <p className="text-3xl font-bold text-gray-900">~{minsSaved} mins</p>
          <p className="text-xs text-gray-400 mt-1">Assuming 15s per signal wait</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow h-[400px]">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Signals Prioritized per Trip (Recent)</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="trip" />
              <YAxis allowDecimals={false} />
              <RechartsTooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="signals" fill="#10B981" radius={[4, 4, 0, 0]} name="Signals Cleared" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">No chart data available</div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
