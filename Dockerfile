# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
# Builder Stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json for caching layer
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the application
RUN npm run build

# Release Stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Set environment variable for VOYP API Key (to be provided at runtime)
ENV VOYP_API_KEY=your-VOYP-api-key

# Install production dependencies
RUN npm install --omit=dev

# Set the entry point
ENTRYPOINT ["node", "build/index.js"]
