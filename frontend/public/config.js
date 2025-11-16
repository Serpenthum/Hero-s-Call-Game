// Runtime configuration that can be replaced with environment variables
// These placeholders will be replaced by docker-entrypoint.sh when container starts
window.ENV = {
  API_BASE_URL: '__API_BASE_URL__',
  IMAGE_BASE_URL: '__IMAGE_BASE_URL__',
  SOCKET_URL: '__SOCKET_URL__'
};
