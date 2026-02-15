FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

RUN npm run build:api-gateway

EXPOSE 3000

CMD ["node", "dist/apps/api-gateway/apps/api-gateway/src/main.js"]

