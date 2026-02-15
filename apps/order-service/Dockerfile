FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

RUN npm run build:order-service

WORKDIR /app/apps/order-service

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node /app/dist/apps/order-service/src/main.js"]

