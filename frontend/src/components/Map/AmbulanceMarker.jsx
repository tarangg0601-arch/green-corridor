import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const createAmbulanceIcon = () => {
  return L.divIcon({
    className: 'bg-transparent border-0',
    html: `<div class="relative flex items-center justify-center w-8 h-8">
             <div class="absolute w-full h-full bg-red-500 rounded-full opacity-50 ambulance-pulse"></div>
             <span class="text-2xl z-10 relative">🚑</span>
           </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const AmbulanceMarker = ({ position, vehicleNumber }) => {
  return (
    <Marker position={position} icon={createAmbulanceIcon()}>
      <Popup>
        <div className="font-semibold text-gray-800">
          Ambulance: <span className="text-gc-blue">{vehicleNumber}</span>
        </div>
      </Popup>
    </Marker>
  );
};

export default AmbulanceMarker;
