import { useState, useEffect, useCallback } from 'react';
import MapView from '../components/Map/MapView';
import TripList from '../components/Sidebar/TripList';
import StartTripForm from '../components/Sidebar/StartTripForm';
import CallAmbulanceForm from '../components/Sidebar/CallAmbulanceForm';
import AlertPanel from '../components/Alerts/AlertPanel';
import { useSocket } from '../hooks/useSocket';
import { fetchTrips, stopTrip } from '../api/trips';
import { fetchRoute } from '../api/routes';
import { fetchAlerts, acknowledgeAlert } from '../api/alerts';
import { normalizeAlert } from '../utils/normalizeAlert';

const Dashboard = () => {
  const [activeTrips, setActiveTrips] = useState([]);
  const [showStartForm, setShowStartForm] = useState(false);
  const [showCallForm, setShowCallForm] = useState(false);
  const [ambulancePositions, setAmbulancePositions] = useState({});
  const [signals, setSignals] = useState([]);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const refreshTrips = useCallback(async () => {
    try {
      const trips = await fetchTrips('active');
      setActiveTrips(trips);
    } catch (err) {
      console.error('Failed to fetch trips', err);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const alertsData = await fetchAlerts();
        setAlerts((alertsData || []).map(normalizeAlert));
      } catch (err) {
        console.error('Failed to load initial data', err);
      }
    };
    loadInitialData();
    refreshTrips();
  }, [refreshTrips]);

  useEffect(() => {
    const loadActiveRoutes = async () => {
      const routes = [];
      const activeSignalsMap = new Map();
      
      for (const trip of activeTrips) {
        if (trip.route_id) {
          try {
            const rData = await fetchRoute(trip.route_id);
            routes.push({ ...rData, positions: rData.polyline });
            if (rData.signals) {
              rData.signals.forEach(s => activeSignalsMap.set(s.id, s));
            }
          } catch (e) {}
        }
      }
      setActiveRoutes(routes);
      
      setSignals(prev => {
        const prevMap = new Map(prev.map(s => [s.id, s]));
        return Array.from(activeSignalsMap.values()).map(s => {
          const existing = prevMap.get(s.id);
          return existing ? { ...s, current_state: existing.current_state } : s;
        });
      });
    };
    if (activeTrips.length > 0) {
      loadActiveRoutes();
    } else {
      setActiveRoutes([]);
      setSignals([]);
    }
  }, [activeTrips]);

  const handleStopTrip = async (id) => {
    if (window.confirm('Are you sure you want to stop this trip?')) {
      try {
        await stopTrip(id);
        setAmbulancePositions(prev => {
          const newPos = { ...prev };
          delete newPos[id];
          return newPos;
        });
        refreshTrips();
      } catch (err) {
        console.error('Failed to stop trip', err);
      }
    }
  };

  const handleAckAlert = async (id) => {
    try {
      await acknowledgeAlert(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: 1 } : a));
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
  };

  const socketHandlers = {
    'ambulance:position': useCallback((data) => {
      setAmbulancePositions(prev => ({
        ...prev,
        [data.tripId]: {
          lat: data.lat,
          lng: data.lng,
          vehicleNumber: data.vehicleNumber
        }
      }));
      setActiveTrips(prev => prev.map(trip => {
        if (trip.id === data.tripId) {
          return {
            ...trip,
            eta: data.eta,
            next_signal: data.nextSignal?.name || null,
            progress: data.totalDistance > 0 ? data.distanceTraveled / data.totalDistance : 0
          };
        }
        return trip;
      }));
    }, []),
    'signal:stateChange': useCallback((data) => {
      setSignals(prev => prev.map(s => s.id === data.signalId ? { ...s, current_state: data.state } : s));
    }, []),
    'alert:new': useCallback((data) => {
      setAlerts(prev => [normalizeAlert(data), ...prev].slice(0, 50));
    }, []),
    'trip:started': useCallback(() => {
      refreshTrips();
    }, [refreshTrips]),
    'trip:ended': useCallback((data) => {
      setActiveTrips(prev => prev.filter(t => t.id !== data.tripId));
      setAmbulancePositions(prev => {
        const newPos = { ...prev };
        delete newPos[data.tripId];
        return newPos;
      });
    }, []),
    'trip:updated': useCallback(() => {
      refreshTrips();
    }, [refreshTrips]),
    'trip:phase': useCallback(() => {
      refreshTrips();
    }, [refreshTrips])
  };

  useSocket(socketHandlers);

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      <div className="flex flex-col">
        <div className="p-2 border-b border-gray-200 bg-white">
          <button
            onClick={() => setShowCallForm(true)}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow transition-colors text-sm"
          >
            🚨 Emergency Dispatch
          </button>
        </div>
        <TripList
          trips={activeTrips}
          onStopTrip={handleStopTrip}
          onStartClick={() => setShowStartForm(true)}
        />
      </div>
      <MapView
        ambulancePositions={ambulancePositions}
        signals={signals}
        activeRoutes={activeRoutes}
      />
      <AlertPanel alerts={alerts} onAcknowledge={handleAckAlert} />

      {showStartForm && (
        <StartTripForm
          onClose={() => setShowStartForm(false)}
          onSuccess={() => {
            setShowStartForm(false);
            refreshTrips();
          }}
        />
      )}

      {showCallForm && (
        <CallAmbulanceForm
          onClose={() => setShowCallForm(false)}
          onSuccess={() => {
            setShowCallForm(false);
            refreshTrips();
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
