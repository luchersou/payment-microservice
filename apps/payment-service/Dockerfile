FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

COPY apps ./apps
COPY libs ./libs

RUN npm install

RUN npx prisma generate --schema=apps/payment-service/prisma/schema.prisma

RUN npm run build:payment-service

WORKDIR /app/apps/payment-service

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && node /app/dist/apps/payment-service/src/main.js"]