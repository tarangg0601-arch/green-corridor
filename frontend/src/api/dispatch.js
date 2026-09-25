import axios from 'axios';
import { API_BASE_URL } from '../config';

export const callAmbulance = async (data) => {
  const response = await axios.post(`${API_BASE_URL}/dispatch/call`, data);
  return response.data;
};
