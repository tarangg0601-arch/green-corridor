import { Polyline } from 'react-leaflet';

const RoutePolyline = ({ positions, color = '#3B82F6' }) => {
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color,
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
      }}
    />
  );
};

export default RoutePolyline;
