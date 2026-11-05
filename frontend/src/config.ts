// Build-time (Vite) configuration with sensible defaults.
const getConfig = (viteKey: string, fallback: string): string => {
  const viteValue = (import.meta as any).env?.[viteKey];
  return viteValue ? viteValue : fallback;
};

// Default to the host the page was loaded from so LAN devices reach the backend too.
const defaultBackend = `http://${window.location.hostname || 'localhost'}:8787`;

// Hero art is served by the site itself (Vite dev server in development, the static host in production)
// unless an image host is configured.
const defaultImageHost = window.location.origin;

const config = {
  // Backend API URL
  API_BASE_URL: getConfig('VITE_API_BASE_URL', defaultBackend),

  // Image URL - images are served from the frontend
  IMAGE_BASE_URL: getConfig('VITE_IMAGE_BASE_URL', defaultImageHost),

  // Realtime WebSocket server URL (http(s); usually same as API base)
  SOCKET_URL: getConfig('VITE_SOCKET_URL', defaultBackend),
};

export default config;
