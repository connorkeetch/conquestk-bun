# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build frontend
RUN cd frontend && npm ci && npm run build

# Build backend
RUN cd backend && npm ci && npm run build

# Create uploads directory
RUN mkdir -p uploads

# Expose port (Railway will set the PORT environment variable)
EXPOSE ${PORT:-5001}

# Start the server
CMD ["npm", "start"]