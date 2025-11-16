#!/bin/sh

# Replace environment variable placeholders in config.js with runtime env vars
# If env vars are not set, the placeholders remain and the app falls back to localhost
if [ -n "$API_BASE_URL" ]; then
  sed -i "s|__API_BASE_URL__|${API_BASE_URL}|g" /app/dist/config.js
fi

if [ -n "$IMAGE_BASE_URL" ]; then
  sed -i "s|__IMAGE_BASE_URL__|${IMAGE_BASE_URL}|g" /app/dist/config.js
fi

if [ -n "$SOCKET_URL" ]; then
  sed -i "s|__SOCKET_URL__|${SOCKET_URL}|g" /app/dist/config.js
fi

# Start the server
exec "$@"
