import TripCard from './TripCard';

const TripList = ({ trips, onStopTrip, onStartClick }) => {
  return (
    <div className="w-72 bg-gc-sidebar border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white shadow-sm">
        <h2 className="text-lg font-bold text-gc-dark">Active Trips</h2>
        <button
          onClick={onStartClick}
          className="bg-gc-green hover:bg-emerald-600 text-white p-1 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          title="Start New Trip"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {trips.length === 0 ? (
          <div className="text-gray-500 text-sm text-center mt-10">
            No active trips
          </div>
        ) : (
          trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onStopTrip={() => onStopTrip(trip.id)} />
          ))
        )}
      </div>
    </div>
  );
};

export default TripList;
