import { useState, useEffect } from 'react';
import { fetchAmbulances } from '../../api/ambulances';
import { fetchRoutes } from '../../api/routes';
import { startTrip } from '../../api/trips';

const StartTripForm = ({ onClose, onSuccess }) => {
  const [ambulances, setAmbulances] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedAmbulance, setSelectedAmbulance] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ambData, routeData] = await Promise.all([
          fetchAmbulances(),
          fetchRoutes()
        ]);
        setAmbulances(ambData.filter(a => a.status === 'idle'));
        setRoutes(routeData);
      } catch (err) {
        console.error('Failed to load form data', err);
      }
    };
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAmbulance || !selectedRoute) return;
    
    setLoading(true);
    try {
      await startTrip({
        ambulanceId: parseInt(selectedAmbulance),
        routeId: parseInt(selectedRoute)
      });
      onSuccess();
    } catch (err) {
      console.error('Failed to start trip', err);
      alert('Error starting trip');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 p-6">
        <h2 className="text-xl font-bold mb-4">Start Emergency Trip</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ambulance</label>
            <select
              value={selectedAmbulance}
              onChange={(e) => setSelectedAmbulance(e.target.value)}
              required
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
            >
              <option value="">Select Ambulance...</option>
              {ambulances.map(a => (
                <option key={a.id} value={a.id}>{a.vehicle_number} - {a.driver_name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              required
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
            >
              <option value="">Select Route...</option>
              {routes.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedAmbulance || !selectedRoute}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gc-green hover:bg-emerald-600 rounded disabled:opacity-50"
            >
              {loading ? 'Starting...' : 'Start Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StartTripForm;
