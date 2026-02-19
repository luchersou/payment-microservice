FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

COPY apps ./apps
COPY libs ./libs

RUN npm install
RUN npm run build:order-service

WORKDIR /app/apps/order-service

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node /app/dist/apps/order-service/apps/order-service/src/main.js"]
