FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads/quarantine

EXPOSE 5001

CMD ["node", "src/server.js"]
