# Use the standard Debian-based image for better native addon compatibility
FROM node:20

WORKDIR /app

# Create directory for database
RUN mkdir -p /app/data

COPY package*.json ./

# Run the standard install. This will install all dependencies.
# 'npm ci' is preferred if you have a package-lock.json
RUN npm ci

COPY . .

ENV PORT=3001
EXPOSE $PORT

# Set the data directory path for the database
ENV DATA_DIR=/app/data

# Switch to the non-root 'node' user for security
# and ensure it owns the entire app directory including data
RUN chown -R node:node /app
RUN chmod -R 775 /app/data

# Create volume for database persistence
VOLUME ["/app/data"]

USER node

CMD ["node", "server.js"]
