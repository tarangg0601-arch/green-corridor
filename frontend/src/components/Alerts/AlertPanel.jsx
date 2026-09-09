import AlertItem from './AlertItem';

const AlertPanel = ({ alerts, onAcknowledge }) => {
  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-sm">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gc-dark flex items-center gap-2">
          <span className="text-red-500">🚨</span> Alerts
        </h2>
        <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
          {alerts.filter(a => !a.acknowledged).length} new
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="text-gray-500 text-sm text-center mt-10">
            No active alerts
          </div>
        ) : (
          alerts.map(alert => (
            <AlertItem key={alert.id} alert={alert} onAcknowledge={() => onAcknowledge(alert.id)} />
          ))
        )}
      </div>
    </div>
  );
};

export default AlertPanel;
