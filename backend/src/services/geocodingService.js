const config = require('../config');
const logger = require('../utils/logger');
const { nominatimQueue } = require('../utils/requestQueue');

const cache = new Map();

async function geocode(address, options = {}) {
  const cacheKey = address.trim().toLowerCase();
  if (cache.has(cacheKey)) {
    logger.info(`Geocoding cache hit for: ${address}`);
    return cache.get(cacheKey);
  }

  return nominatimQueue.enqueue(async () => {
    // Re-check cache in case an earlier queued request resolved it
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const baseUrl = config.nominatimBaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

    logger.info(`Geocoding address: ${address}`);

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
        const err = new Error(`Nominatim API returned status ${response.status}`);
        err.statusCode = 502;
        throw err;
      }

      data = await response.json();
    } catch (err) {
      if (err.name === 'TimeoutError' || combinedSignal.aborted && timeoutSignal.aborted && !options.signal?.aborted) {
        const timeoutErr = new Error(`Nominatim geocoding request timed out after ${timeoutMs / 1000}s`);
        timeoutErr.statusCode = 504;
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      if (err.name === 'AbortError' || options.signal?.aborted) {
        const abortErr = new Error('Nominatim geocoding request was aborted');
        abortErr.name = 'AbortError';
        abortErr.isAborted = true;
        throw abortErr;
      }
      if (!err.statusCode) {
        err.statusCode = 502;
      }
      throw err;
    }

    if (!data || data.length === 0) {
      const notFoundErr = new Error(`No results found for address: ${address}`);
      notFoundErr.statusCode = 404;
      throw notFoundErr;
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name
    };

    cache.set(cacheKey, result);
    return result;
  }, { signal: options.signal });
}

module.exports = { geocode };
