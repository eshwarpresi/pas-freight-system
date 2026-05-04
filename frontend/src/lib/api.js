import axios from 'axios';

const api = axios.create({
  baseURL: 'https://pas-freight-api.onrender.com/api',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// Add timestamp to every GET request to prevent 304 caching
api.interceptors.request.use(config => {
  if (config.method === 'get') {
    config.params = { ...config.params, _t: Date.now() };
  }
  return config;
});

export default api;