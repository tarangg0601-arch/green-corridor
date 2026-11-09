import { useState, useEffect } from 'react';
import { fetchRoutes } from '../api/routes';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';

const RoutesPage = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRouteId, setExpandedRouteId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchRoutes();
        // Predefined routes only (filter out custom/dispatch routes)
        const predefined = (data || []).filter(r => !r.is_custom);
        setRoutes(predefined);
        if (predefined.length > 0) {
          setExpandedRouteId(predefined[0].id);
        }
      } catch (err) {
        console.error('Error fetching routes', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) return <div className="p-6">Loading routes...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gc-dark">Predefined Routes</h1>
          <p className="text-sm text-gray-500 mt-1">Configured green corridor corridors for emergency priority</p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium">
          {routes.length} Predefined Corridor{routes.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {routes.map(route => {
          const isExpanded = expandedRouteId === route.id;
          const centerLat = route.polyline && route.polyline.length > 0 ? route.polyline[Math.floor(route.polyline.length / 2)][0] : 13.0827;
          const centerLng = route.polyline && route.polyline.length > 0 ? route.polyline[Math.floor(route.polyline.length / 2)][1] : 80.2707;

          return (
            <div key={route.id} className="bg-white rounded-lg shadow flex flex-col overflow-hidden border border-gray-100">
              <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{route.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {route.start_name} → {route.end_name} • {route.signals?.length || 0} signals
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedRouteId(isExpanded ? null : route.id)}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                    isExpanded
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-gc-blue text-white hover:bg-blue-600'
                  }`}
                >
                  {isExpanded ? 'Hide Map' : 'View Map'}
                </button>
              </div>

              {isExpanded ? (
                <div className="h-72 relative z-0">
                  <MapContainer center={[centerLat, centerLng]} zoom={13} className="h-full w-full z-0" zoomControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Polyline positions={route.polyline} pathOptions={{ color: '#3B82F6', weight: 4 }} />
                    {route.signals?.map(sig => (
                      <CircleMarker key={sig.id} center={[sig.lat, sig.lng]} radius={6} pathOptions={{ color: '#EF4444', fillColor: '#EF4444' }}>
                        <Tooltip>{sig.name}</Tooltip>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              ) : (
                <div className="p-4 text-xs text-gray-500 flex items-center justify-between">
                  <span>Click "View Map" to inspect polyline and signals</span>
                  <span className="text-gray-400 font-mono">ID: {route.id}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RoutesPage;
