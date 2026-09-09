import { useState, useEffect } from 'react';
import { fetchRoutes } from '../api/routes';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const RoutesPage = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchRoutes();
        setRoutes(data);
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
      <h1 className="text-2xl font-bold text-gc-dark mb-6">Predefined Routes</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {routes.map(route => {
          const centerLat = route.polyline.length > 0 ? route.polyline[Math.floor(route.polyline.length / 2)][0] : 13.0827;
          const centerLng = route.polyline.length > 0 ? route.polyline[Math.floor(route.polyline.length / 2)][1] : 80.2707;

          return (
            <div key={route.id} className="bg-white rounded-lg shadow flex flex-col h-96">
              <div className="p-4 border-b">
                <h2 className="text-lg font-bold">{route.name}</h2>
                <p className="text-sm text-gray-500">{route.signals?.length || 0} signals on route</p>
              </div>
              <div className="flex-1 relative z-0">
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RoutesPage;
