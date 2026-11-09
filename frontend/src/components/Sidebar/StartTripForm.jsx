import { useState, useEffect } from 'react';
import { fetchAmbulances } from '../../api/ambulances';
import { fetchRoutes, createCustomRoute, previewCustomRoute } from '../../api/routes';
import { startTrip } from '../../api/trips';

const StartTripForm = ({ onClose, onSuccess }) => {
  const [ambulances, setAmbulances] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedAmbulance, setSelectedAmbulance] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('predefined');
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [routeError, setRouteError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [createdRoute, setCreatedRoute] = useState(null);

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

  const handleGenerateRoute = async () => {
    if (!startAddress.trim() || !endAddress.trim()) return;
    setRouteError('');
    setRouteLoading(true);
    setCreatedRoute(null);

    try {
      const preview = await previewCustomRoute({
        startAddress: startAddress.trim(),
        endAddress: endAddress.trim()
      });
      setCreatedRoute(preview);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to generate route';
      setRouteError(msg);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAmbulance) return;

    setLoading(true);
    try {
      let routeId = parseInt(selectedRoute, 10);
      if (mode === 'custom') {
        if (!createdRoute) return;
        // Persist the custom route only when user actually starts the trip
        const savedRoute = await createCustomRoute({
          startAddress: startAddress.trim(),
          endAddress: endAddress.trim()
        });
        routeId = savedRoute.id;
      }
      if (!routeId) return;

      await startTrip({
        ambulanceId: parseInt(selectedAmbulance, 10),
        routeId
      });
      onSuccess();
    } catch (err) {
      console.error('Failed to start trip', err);
      const msg = err.response?.data?.error || err.message || 'Error starting trip';
      setRouteError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = selectedAmbulance && (
    (mode === 'predefined' && selectedRoute) ||
    (mode === 'custom' && createdRoute)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[440px] p-6">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Route Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('predefined'); setCreatedRoute(null); setRouteError(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                  mode === 'predefined'
                    ? 'bg-gc-green text-white border-gc-green'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Predefined Route
              </button>
              <button
                type="button"
                onClick={() => { setMode('custom'); setSelectedRoute(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                  mode === 'custom'
                    ? 'bg-gc-blue text-white border-gc-blue'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Custom Route (A → B)
              </button>
            </div>
          </div>

          {mode === 'predefined' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                required
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
              >
                <option value="">Select Route...</option>
                {routes.filter(r => !r.is_custom).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
                <input
                  type="text"
                  value={startAddress}
                  onChange={(e) => setStartAddress(e.target.value)}
                  placeholder="e.g. Apollo Hospital, Chennai"
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Location</label>
                <input
                  type="text"
                  value={endAddress}
                  onChange={(e) => setEndAddress(e.target.value)}
                  placeholder="e.g. Chennai Central Station"
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-blue"
                />
              </div>

              {routeError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-xs">
                  {routeError}
                </div>
              )}

              {createdRoute && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded p-2 text-xs">
                  Route preview: {createdRoute.name} ({createdRoute.distanceKm ? `${createdRoute.distanceKm.toFixed(1)} km, ` : ''}{createdRoute.signals?.length || 0} virtual signals)
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateRoute}
                disabled={routeLoading || !startAddress.trim() || !endAddress.trim()}
                className="w-full py-2 text-sm font-medium text-white bg-gc-blue hover:bg-blue-600 rounded disabled:opacity-50 transition-colors"
              >
                {routeLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating route...
                  </span>
                ) : createdRoute ? 'Regenerate Route' : 'Generate Route'}
              </button>

              <p className="text-[10px] text-gray-400 text-center">
                Routing by OSRM / OpenStreetMap contributors
              </p>
            </div>
          )}

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
              disabled={loading || !canSubmit}
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
