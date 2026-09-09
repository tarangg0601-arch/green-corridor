import axios from 'axios';
import { API_BASE_URL } from '../config';

export const fetchTrips = async (status) => {
  const url = status ? `${API_BASE_URL}/trips?status=${status}` : `${API_BASE_URL}/trips`;
  const response = await axios.get(url);
  return response.data;
};

export const fetchTrip = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/trips/${id}`);
  return response.data;
};

export const startTrip = async (data) => {
  const response = await axios.post(`${API_BASE_URL}/trips/start`, data);
  return response.data;
};

export const stopTrip = async (id) => {
  const response = await axios.post(`${API_BASE_URL}/trips/${id}/stop`);
  return response.data;
};
