# Build from dashboard/ root (needs access to both client/ and server/ dirs)

# Stage 1: Build the React client
FROM node:18-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

# Stage 2: Run the API server and serve built client
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=client-build /client/dist ./public
EXPOSE 3001
CMD ["node", "src/index.js"]
