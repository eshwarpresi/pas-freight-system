import axios from 'axios';

// Uses the same VITE_API_URL your socket connection (in App.jsx) already
// reads. Set VITE_API_URL in frontend/.env for local development;
// falls back to the live Render API if it's not set (e.g. in production).
const API_BASE = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
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