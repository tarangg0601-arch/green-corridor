const logger = require('../utils/logger');

const cache = new Map();
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

async function geocode(address) {
  const cacheKey = address.trim().toLowerCase();
  if (cache.has(cacheKey)) {
    logger.info(`Geocoding cache hit for: ${address}`);
    return cache.get(cacheKey);
  }

  await throttle();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

  logger.info(`Geocoding address: ${address}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GreenCorridor-TrafficManagement/1.0 (student-project)'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim API returned status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error(`No results found for address: ${address}`);
  }

  const result = {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name
  };

  cache.set(cacheKey, result);
  return result;
}

module.exports = { geocode };
