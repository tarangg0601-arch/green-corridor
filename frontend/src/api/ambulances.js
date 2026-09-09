import axios from 'axios';
import { API_BASE_URL } from '../config';

export const fetchAmbulances = async () => {
  const response = await axios.get(`${API_BASE_URL}/ambulances`);
  return response.data;
};

export const createAmbulance = async (data) => {
  const response = await axios.post(`${API_BASE_URL}/ambulances`, data);
  return response.data;
};
