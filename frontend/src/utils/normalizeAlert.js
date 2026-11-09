/**
 * Pure helper to normalize alert objects from both REST (snake_case)
 * and WebSocket (camelCase) sources into a unified structure.
 *
 * @param {Object} raw - Raw alert object
 * @returns {Object} Normalized alert object
 */
export function normalizeAlert(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: null,
      signal_name: 'Traffic Signal',
      signalName: 'Traffic Signal',
      vehicle_number: 'Ambulance',
      vehicleNumber: 'Ambulance',
      eta: null,
      eta_at_trigger: null,
      timestamp: new Date().toISOString(),
      triggered_at: new Date().toISOString(),
      timeFormatted: '--:--:--',
      acknowledged: false
    };
  }

  const id = raw.id != null ? Number(raw.id) : null;
  const signalName = raw.signal_name || raw.signalName || (raw.signals && raw.signals.name) || 'Traffic Signal';
  const vehicleNumber = raw.vehicle_number || raw.vehicleNumber || 'Ambulance';

  // ETA: can be 0, so check != null
  let etaVal = null;
  if (raw.eta != null && Number.isFinite(Number(raw.eta))) {
    etaVal = Math.round(Number(raw.eta));
  } else if (raw.eta_at_trigger != null && Number.isFinite(Number(raw.eta_at_trigger))) {
    etaVal = Math.round(Number(raw.eta_at_trigger));
  }

  // Timestamp
  const rawTime = raw.timestamp || raw.triggered_at || raw.start_time;
  let parsedDate = rawTime ? new Date(rawTime) : new Date();
  if (isNaN(parsedDate.getTime())) {
    parsedDate = new Date();
  }

  const timeFormatted = parsedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const isAck = Boolean(raw.acknowledged === 1 || raw.acknowledged === true);

  return {
    id,
    signal_name: signalName,
    signalName,
    vehicle_number: vehicleNumber,
    vehicleNumber,
    eta: etaVal,
    eta_at_trigger: etaVal,
    timestamp: parsedDate.toISOString(),
    triggered_at: parsedDate.toISOString(),
    timeFormatted,
    acknowledged: isAck
  };
}

export default normalizeAlert;
