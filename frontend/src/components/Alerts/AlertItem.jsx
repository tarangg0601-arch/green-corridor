import { normalizeAlert } from '../../utils/normalizeAlert';

const AlertItem = ({ alert, onAcknowledge }) => {
  const normalized = normalizeAlert(alert);
  const { signal_name, vehicle_number, eta, timeFormatted, acknowledged } = normalized;

  return (
    <div className={`p-3 rounded-md border ${acknowledged ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-orange-50 border-orange-200 border-l-4 border-l-orange-500 shadow-sm'}`}>
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-sm text-gray-800">{signal_name}</span>
        <span className="text-xs text-gray-500">{timeFormatted}</span>
      </div>
      <div className="text-xs text-gray-600 mb-2">
        Ambulance <span className="font-medium text-gc-blue">{vehicle_number}</span> approaching.
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-red-600">
          {eta != null ? `ETA: ${eta}s` : 'Approaching'}
        </span>
        {!acknowledged && (
          <button
            onClick={onAcknowledge}
            className="text-xs bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1"
          >
            <span className="text-green-500">✓</span> Ack
          </button>
        )}
      </div>
    </div>
  );
};

export default AlertItem;
