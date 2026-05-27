FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org/ && \
    npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
