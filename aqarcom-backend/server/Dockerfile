FROM node:20-alpine
WORKDIR /srv
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY admin-dashboard ./admin-dashboard
RUN mkdir -p storage
EXPOSE 3000
CMD ["node", "src/server.js"]
