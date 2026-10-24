import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 15000,
});

const SLOW_THRESHOLD_MS = 6000;
const ROLLING_WINDOW = 6;
const MIN_SAMPLES = 4;
const SLOW_SHARE = 0.6;
const LONG_RUNNING = /export|download|upload|pdf|excel|backup/i;

const networkState = {
  isSlow: false,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  recentDurations: []
};

const listeners = new Set();

function notifyListeners() {
  listeners.forEach((cb) => cb({ isSlow: networkState.isSlow, isOffline: networkState.isOffline }));
}

export function onNetworkStatusChange(callback) {
  listeners.add(callback);
  callback({ isSlow: networkState.isSlow, isOffline: networkState.isOffline });
  return () => listeners.delete(callback);
}

function isLongRunning(config) {
  if (!config) return false;
  if (config.responseType === 'blob' || config.skipSpeedCheck) return true;
  return LONG_RUNNING.test(config.url || '');
}

function recordDuration(ms) {
  networkState.recentDurations.push(ms);
  if (networkState.recentDurations.length > ROLLING_WINDOW) {
    networkState.recentDurations.shift();
  }
  const samples = networkState.recentDurations;
  const slowCount = samples.filter((d) => d > SLOW_THRESHOLD_MS).length;
  const wasSlow = networkState.isSlow;
  networkState.isSlow = samples.length >= MIN_SAMPLES && slowCount / samples.length >= SLOW_SHARE;
  if (wasSlow !== networkState.isSlow) notifyListeners();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    networkState.isOffline = false;
    notifyListeners();
  });
  window.addEventListener('offline', () => {
    networkState.isOffline = true;
    notifyListeners();
  });
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pas_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.metadata = { startTime: Date.now() };
  return config;
});

api.interceptors.response.use(
  (response) => {
    const cfg = response.config;
    if (cfg?.metadata?.startTime && !isLongRunning(cfg)) {
      recordDuration(Date.now() - cfg.metadata.startTime);
    }
    return response;
  },
  (error) => {
    const cfg = error.config;
    const skip = axios.isCancel(error) || error.response?.status === 401 || isLongRunning(cfg);
    if (cfg?.metadata?.startTime && !skip) {
      recordDuration(Date.now() - cfg.metadata.startTime);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('pas_token');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);

export default api;