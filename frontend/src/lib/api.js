import axios from 'axios';

const api = axios.create({
  baseURL: 'https://pas-freight-api.onrender.com/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pas_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pas_token');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);

export default api;