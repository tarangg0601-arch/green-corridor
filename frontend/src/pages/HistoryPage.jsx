import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const HistoryPage = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const completed = await axios.get(`${API_BASE_URL}/trips?status=completed`);
        const cancelled = await axios.get(`${API_BASE_URL}/trips?status=cancelled`);
        const all = [...completed.data, ...cancelled.data].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
        setTrips(all);
      } catch (err) {
        console.error('Error fetching history', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const getDuration = (start, end) => {
    if (!start || !end) return 'N/A';
    const diff = new Date(end) - new Date(start);
    const mins = Math.floor(diff / 60000);
    return `${mins} min`;
  };

  if (loading) return <div className="p-6">Loading history...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-gc-dark mb-6">Trip History</h1>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ambulance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {trips.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No past trips found.</td></tr>
            ) : (
              trips.map(trip => (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{trip.vehicle_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{trip.route_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      trip.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(trip.start_time)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getDuration(trip.start_time, trip.end_time)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryPage;
