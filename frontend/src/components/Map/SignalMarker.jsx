import { CircleMarker, Tooltip } from 'react-leaflet';

const SignalMarker = ({ position, name, state }) => {
  const color = state === 'green' ? '#10B981' : '#EF4444';

  return (
    <CircleMarker
      center={position}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
      radius={8}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <div className="font-semibold">{name}</div>
        <div className="text-sm capitalize" style={{ color }}>Status: {state}</div>
      </Tooltip>
    </CircleMarker>
  );
};

export default SignalMarker;
