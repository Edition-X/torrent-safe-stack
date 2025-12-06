FROM node:20-alpine AS builder

# Build frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Production image
FROM node:20-alpine

# Install FFmpeg for transcoding
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Copy server code
COPY server/ ./

# Copy built frontend
COPY --from=builder /app/client/dist ./client/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DOWNLOADS_PATH=/downloads

EXPOSE 3000

CMD ["node", "server.js"]
