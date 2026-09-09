import { useState, useEffect, useCallback } from 'react';
import MapView from '../components/Map/MapView';
import TripList from '../components/Sidebar/TripList';
import StartTripForm from '../components/Sidebar/StartTripForm';
import AlertPanel from '../components/Alerts/AlertPanel';
import { useSocket } from '../hooks/useSocket';
import { fetchTrips, stopTrip } from '../api/trips';
import { fetchRoutes, fetchRoute } from '../api/routes';
import { fetchAlerts, acknowledgeAlert } from '../api/alerts';

const Dashboard = () => {
  const [activeTrips, setActiveTrips] = useState([]);
  const [showStartForm, setShowStartForm] = useState(false);
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

  // Load signals & alerts initially
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [routesData, alertsData] = await Promise.all([
          fetchRoutes(),
          fetchAlerts()
        ]);
        const allSignalsMap = new Map();
        routesData.forEach(r => {
          if (r.signals) {
            r.signals.forEach(s => allSignalsMap.set(s.id, s));
          }
        });
        setSignals(Array.from(allSignalsMap.values()));
        setAlerts(alertsData);
      } catch (err) {
        console.error('Failed to load initial map data', err);
      }
    };
    loadInitialData();
    refreshTrips();
  }, [refreshTrips]);

  // Sync routes when trips change
  useEffect(() => {
    const loadActiveRoutes = async () => {
      const routes = [];
      for (const trip of activeTrips) {
        if (trip.route_id) {
          try {
            const rData = await fetchRoute(trip.route_id);
            routes.push({ ...rData, positions: rData.polyline });
          } catch (e) {}
        }
      }
      setActiveRoutes(routes);
    };
    if (activeTrips.length > 0) {
      loadActiveRoutes();
    } else {
      setActiveRoutes([]);
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
      // Update trip ETA and progress in the trip list
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
      setAlerts(prev => [data, ...prev].slice(0, 50));
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
    }, [])
  };

  useSocket(socketHandlers);

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      <TripList
        trips={activeTrips}
        onStopTrip={handleStopTrip}
        onStartClick={() => setShowStartForm(true)}
      />
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
    </div>
  );
};

export default Dashboard;
