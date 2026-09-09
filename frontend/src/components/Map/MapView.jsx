import { MapContainer, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import AmbulanceMarker from './AmbulanceMarker';
import SignalMarker from './SignalMarker';
import RoutePolyline from './RoutePolyline';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapView = ({ ambulancePositions, signals, activeRoutes, center = [13.0827, 80.2707] }) => {
  return (
    <div className="w-full h-full p-4 bg-gray-100 flex-1 relative z-0">
      <MapContainer center={center} zoom={13} className="h-full w-full rounded-xl shadow-md z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {activeRoutes.map((route, idx) => (
          <RoutePolyline key={idx} positions={route.positions} color="#3B82F6" />
        ))}

        {signals.map((signal) => (
          <SignalMarker
            key={signal.id}
            position={[signal.lat, signal.lng]}
            name={signal.name}
            state={signal.current_state}
          />
        ))}

        {Object.entries(ambulancePositions).map(([tripId, pos]) => (
          <AmbulanceMarker
            key={tripId}
            position={[pos.lat, pos.lng]}
            vehicleNumber={pos.vehicleNumber}
          />
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
