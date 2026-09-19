const logger = require('../utils/logger');
const { haversineDistance } = require('../utils/geo');

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function getRoute(startLat, startLng, endLat, endLng) {
  await throttle();

  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

  logger.info(`Fetching OSRM route: (${startLat},${startLng}) -> (${endLat},${endLng})`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GreenCorridor-TrafficManagement/1.0 (student-project)'
    }
  });

  if (!response.ok) {
    throw new Error(`OSRM API returned status ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('OSRM returned no routes');
  }

  const route = data.routes[0];
  const coordinates = route.geometry.coordinates;

  // OSRM returns [lng, lat] — convert to [lat, lng] for our format
  const polyline = coordinates.map(([lng, lat]) => [lat, lng]);

  return {
    polyline,
    distanceKm: route.distance / 1000,
    durationSec: route.duration
  };
}

/**
 * Generate virtual signal points along a polyline at roughly 800m-1km intervals.
 * Returns an array of signal objects ready to insert into the signals table.
 */
function generateVirtualSignals(polyline) {
  const SIGNAL_INTERVAL_KM = 0.9; // ~900m between signals
  const signals = [];
  let accumulatedDist = 0;
  let signalCount = 0;

  for (let i = 1; i < polyline.length; i++) {
    const segDist = haversineDistance(
      polyline[i-1][0], polyline[i-1][1],
      polyline[i][0], polyline[i][1]
    );
    accumulatedDist += segDist;

    if (accumulatedDist >= SIGNAL_INTERVAL_KM) {
      signalCount++;
      signals.push({
        name: `Signal ${signalCount}`,
        lat: polyline[i][0],
        lng: polyline[i][1],
        order_in_route: signalCount
      });
      accumulatedDist = 0;
    }
  }

  // Don't place a signal at the very end of the route (within 200m)
  if (signals.length > 0) {
    const lastSig = signals[signals.length - 1];
    const endPoint = polyline[polyline.length - 1];
    const distToEnd = haversineDistance(lastSig.lat, lastSig.lng, endPoint[0], endPoint[1]);
    if (distToEnd < 0.2) {
      signals.pop();
    }
  }

  return signals;
}

module.exports = { getRoute, generateVirtualSignals };
