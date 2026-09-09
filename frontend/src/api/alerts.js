import axios from 'axios';
import { API_BASE_URL } from '../config';

export const fetchAlerts = async () => {
  const response = await axios.get(`${API_BASE_URL}/alerts`);
  return response.data;
};

export const acknowledgeAlert = async (id) => {
  const response = await axios.patch(`${API_BASE_URL}/alerts/${id}/acknowledge`);
  return response.data;
};

export const fetchAnalytics = async () => {
  const response = await axios.get(`${API_BASE_URL}/alerts/summary`);
  return response.data;
};
