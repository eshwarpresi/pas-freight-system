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

// ─── NETWORK SPEED TRACKING (NEW) ───
// Measures how long your REAL API calls actually take (not a synthetic
// ping to some other server) — the most honest signal of whether this
// person's connection to your actual backend is slow right now. Keeps a
// small rolling window of the last few request durations; once the
// average crosses SLOW_THRESHOLD_MS, the connection is flagged "slow".
// Also tracks the browser's own online/offline state directly.
//
// Any component can subscribe via onNetworkStatusChange() to show a
// banner — see MainLayout.jsx for where this is actually displayed.
const SLOW_THRESHOLD_MS = 3000;
const ROLLING_WINDOW = 5;

const networkState = {
  isSlow: false,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  recentDurations: []
};

const listeners = new Set();

function notifyListeners() {
  listeners.forEach((cb) => cb({ isSlow: networkState.isSlow, isOffline: networkState.isOffline }));
}

// Subscribe to network status changes. Calls `callback` immediately with
// the current state, then again every time isSlow/isOffline changes.
// Returns an unsubscribe function.
export function onNetworkStatusChange(callback) {
  listeners.add(callback);
  callback({ isSlow: networkState.isSlow, isOffline: networkState.isOffline });
  return () => listeners.delete(callback);
}

function recordDuration(ms) {
  networkState.recentDurations.push(ms);
  if (networkState.recentDurations.length > ROLLING_WINDOW) {
    networkState.recentDurations.shift();
  }
  // Require at least 3 samples before judging — avoids one single slow
  // request (e.g. a genuinely heavy report) falsely flagging the whole
  // connection as slow.
  const avg = networkState.recentDurations.reduce((a, b) => a + b, 0) / networkState.recentDurations.length;
  const wasSlow = networkState.isSlow;
  networkState.isSlow = networkState.recentDurations.length >= 3 && avg > SLOW_THRESHOLD_MS;
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
  config.metadata = { startTime: Date.now() }; // ✅ NEW — for latency tracking
  return config;
});

api.interceptors.response.use(
  (response) => {
    // ✅ NEW — record how long this successful request actually took
    if (response.config?.metadata?.startTime) {
      recordDuration(Date.now() - response.config.metadata.startTime);
    }
    return response;
  },
  (error) => {
    // ✅ NEW — a slow/timed-out request still tells us about connection
    // quality, so record it too (skip 401s — those fail instantly and
    // aren't a network-speed signal).
    if (error.config?.metadata?.startTime && error.response?.status !== 401) {
      recordDuration(Date.now() - error.config.metadata.startTime);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('pas_token');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);

export default api;