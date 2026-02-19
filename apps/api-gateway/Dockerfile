FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

COPY apps ./apps
COPY libs ./libs

RUN npm install

RUN npm run build:api-gateway

EXPOSE 3000

CMD ["node", "dist/apps/api-gateway/apps/api-gateway/src/main.js"]

