/**
 * Haversine formula to calculate the distance between two latitude/longitude points in kilometers.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Total length of a polyline in km.
 */
function totalRouteDistance(polyline) {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += haversineDistance(
      polyline[i][0], polyline[i][1],
      polyline[i+1][0], polyline[i+1][1]
    );
  }
  return total;
}

/**
 * Interpolate the {lat, lng} position along the polyline given a traveled distance.
 */
function interpolatePosition(polyline, distanceTraveled) {
  if (polyline.length === 0) return null;
  if (distanceTraveled <= 0) return { lat: polyline[0][0], lng: polyline[0][1] };
  
  let accumulated = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i+1];
    const segmentLength = haversineDistance(p1[0], p1[1], p2[0], p2[1]);
    
    if (accumulated + segmentLength >= distanceTraveled) {
      // Find the fraction of the segment we are at
      const remainingDistance = distanceTraveled - accumulated;
      const ratio = segmentLength === 0 ? 0 : remainingDistance / segmentLength;
      
      const lat = p1[0] + (p2[0] - p1[0]) * ratio;
      const lng = p1[1] + (p2[1] - p1[1]) * ratio;
      return { lat, lng };
    }
    accumulated += segmentLength;
  }
  
  // If we exceeded total length, return the last point
  const lastPoint = polyline[polyline.length - 1];
  return { lat: lastPoint[0], lng: lastPoint[1] };
}

/**
 * Calculate distance along the polyline from a given segment index to a target point.
 * We'll simplify this to finding the nearest segment and adding up from the start.
 * In a real scenario, this gets complex. But this is sufficient for the simulation.
 */
function distanceAlongRoute(polyline, fromIndex, toLat, toLng) {
  let distance = 0;
  for (let i = fromIndex; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i+1];
    const distToPoint = haversineDistance(p1[0], p1[1], toLat, toLng);
    
    // Simplification: if it's very close to this segment's end or on it
    if (distToPoint < 0.1) {
      return distance + distToPoint;
    }
    distance += haversineDistance(p1[0], p1[1], p2[0], p2[1]);
  }
  return distance;
}

/**
 * Find the segment index the point is closest to.
 */
function findNearestSegment(polyline, lat, lng) {
  let minDistance = Infinity;
  let nearestIdx = 0;
  
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const dist = haversineDistance(p1[0], p1[1], lat, lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

module.exports = {
  haversineDistance,
  totalRouteDistance,
  interpolatePosition,
  distanceAlongRoute,
  findNearestSegment
};
