import axios from 'axios';

const api = axios.create({
  baseURL: 'https://pas-freight-api.onrender.com/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 15000, // 15 second timeout
});

// Request interceptor - add timestamp to avoid caching issues
api.interceptors.request.use((config) => {
  // Only cache GET requests for 30 seconds
  if (config.method === 'get') {
    config.params = { ...config.params, _t: Date.now() };
  }
  return config;
});

// Response interceptor - handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out');
    }
    if (!error.response) {
      console.error('Network error - server may be down');
    }
    return Promise.reject(error);
  }
);

export default api;