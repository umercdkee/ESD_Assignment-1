FROM node:22-alpine
WORKDIR /app

# The API package refers to the repository root as a local npm dependency.
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server/src ./server/src
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "--prefix", "server", "start"]
