// Application configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';

// Environment
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;

// Feature flags
export const FEATURES = {
  PUSH_NOTIFICATIONS: true,
  MAP_EDITOR: true,
  ADMIN_PANEL: true,
};