import { useState, useCallback } from 'react';
import { fetchTrips } from '../api/trips';

export const useTrips = () => {
  const [activeTrips, setActiveTrips] = useState([]);

  const refreshTrips = useCallback(async () => {
    try {
      const trips = await fetchTrips('active');
      setActiveTrips(trips);
    } catch (error) {
      console.error('Failed to fetch active trips:', error);
    }
  }, []);

  return { activeTrips, setActiveTrips, refreshTrips };
};
