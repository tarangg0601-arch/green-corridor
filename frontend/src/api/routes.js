import axios from 'axios';
import { API_BASE_URL } from '../config';

export const fetchRoutes = async () => {
  const response = await axios.get(`${API_BASE_URL}/routes`);
  return response.data;
};

export const fetchRoute = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/routes/${id}`);
  return response.data;
};

export const createCustomRoute = async (data) => {
  const response = await axios.post(`${API_BASE_URL}/routes/custom`, data);
  return response.data;
};

export const previewCustomRoute = async (data) => {
  const response = await axios.post(`${API_BASE_URL}/routes/preview`, data);
  return response.data;
};
