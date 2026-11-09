import { API_BASE_URL } from '../config';

export const fetchHospitals = async () => {
  const response = await fetch(`${API_BASE_URL}/hospitals`);
  if (!response.ok) {
    throw new Error('Failed to fetch hospitals');
  }
  return response.json();
};
