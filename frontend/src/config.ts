// Configuration for different environments
// Supports both build-time (Vite) and runtime (Docker) configuration

// Declare window.ENV type
declare global {
  interface Window {
    ENV?: {
      API_BASE_URL: string;
      IMAGE_BASE_URL: string;
      SOCKET_URL: string;
    };
  }
}

const getRuntimeConfig = (key: string, viteKey: string, fallback: string): string => {
  // First check runtime config (from public/config.js, replaced at container startup)
  if (window.ENV && window.ENV[key as keyof typeof window.ENV] && !window.ENV[key as keyof typeof window.ENV].startsWith('__')) {
    return window.ENV[key as keyof typeof window.ENV];
  }
  
  // Then check Vite build-time env vars
  const viteValue = (import.meta as any).env?.[viteKey];
  if (viteValue) {
    return viteValue;
  }
  
  // Finally use fallback
  return fallback;
};

const config = {
  // Backend API URL
  API_BASE_URL: getRuntimeConfig('API_BASE_URL', 'VITE_API_BASE_URL', 'http://localhost:3001'),
  
  // Image URL - images are served from the frontend
  IMAGE_BASE_URL: getRuntimeConfig('IMAGE_BASE_URL', 'VITE_IMAGE_BASE_URL', 'http://localhost:3001'),
  
  // Socket.IO URL (usually same as API base)
  SOCKET_URL: getRuntimeConfig('SOCKET_URL', 'VITE_SOCKET_URL', 'http://localhost:3001'),
};

export default config;
