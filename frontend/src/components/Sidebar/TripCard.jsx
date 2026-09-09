const TripCard = ({ trip, onStopTrip }) => {
  const { vehicle_number, driver_name, route_name, status } = trip;
  const eta = trip.eta;
  const progress = trip.progress || 0;
  const nextSignal = trip.next_signal;

  return (
    <div className="bg-white p-3 rounded-lg shadow border-l-4 border-gc-green hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-bold text-gc-dark text-sm">{vehicle_number || 'Unknown'}</h3>
          <p className="text-xs text-gray-500">{driver_name || 'Driver'}</p>
        </div>
        <span className="px-2 py-1 bg-green-100 text-green-800 text-[10px] font-bold rounded-full uppercase">
          {status}
        </span>
      </div>

      <div className="mb-3 text-sm text-gray-700">
        <div className="truncate" title={route_name}>📍 {route_name || 'Unknown Route'}</div>
        <div className="mt-1 text-xs text-gray-500">
          Next Signal: <span className="font-semibold text-gray-800">{nextSignal || 'N/A'}</span>
        </div>
        <div className="text-xs text-gray-500">
          ETA: <span className="font-semibold text-gc-blue">{eta ? `${eta}s` : 'Calculating...'}</span>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
        <div
          className="bg-gc-green h-1.5 rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        ></div>
      </div>

      <button
        onClick={onStopTrip}
        className="w-full py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
      >
        Stop Trip
      </button>
    </div>
  );
};

export default TripCard;
