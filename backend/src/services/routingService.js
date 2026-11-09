const config = require('../config');
const logger = require('../utils/logger');
const { haversineDistance } = require('../utils/geo');
const { osrmQueue } = require('../utils/requestQueue');

/**
 * Fetch driving route between start and end coordinates via OSRM.
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{polyline: Array<[number, number]>, distanceKm: number, durationSec: number}>}
 */
async function getRoute(startLat, startLng, endLat, endLng, options = {}) {
  return osrmQueue.enqueue(async () => {
    const baseUrl = config.osrmBaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    logger.info(`Fetching OSRM route: (${startLat},${startLng}) -> (${endLat},${endLng})`);

    const timeoutMs = config.httpTimeoutMs || 8000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

    let response;
    let data;

    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'GreenCorridor-TrafficManagement/1.0 (student-project)'
        },
        signal: combinedSignal
      });

      if (!response.ok) {
        const err = new Error(`OSRM API returned status ${response.status}`);
        err.statusCode = 502;
        throw err;
      }

      data = await response.json();
    } catch (err) {
      if (err.name === 'TimeoutError' || combinedSignal.aborted && timeoutSignal.aborted && !options.signal?.aborted) {
        const timeoutErr = new Error(`OSRM routing request timed out after ${timeoutMs / 1000}s`);
        timeoutErr.statusCode = 504;
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      if (err.name === 'AbortError' || options.signal?.aborted) {
        const abortErr = new Error('OSRM routing request was aborted');
        abortErr.name = 'AbortError';
        abortErr.isAborted = true;
        throw abortErr;
      }
      if (!err.statusCode) {
        err.statusCode = 502;
      }
      throw err;
    }

    if (!data || !data.routes || data.routes.length === 0) {
      const noRouteErr = new Error('OSRM returned no routes');
      noRouteErr.statusCode = 502;
      throw noRouteErr;
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
  }, { signal: options.signal });
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
