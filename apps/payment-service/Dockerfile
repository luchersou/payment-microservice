FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

RUN npm run build:payment-service

WORKDIR /app/apps/payment-service

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && node /app/dist/apps/payment-service/src/main.js"]
