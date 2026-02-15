FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

RUN npx prisma generate --schema=./libs/database/prisma/schema.prisma
RUN npm run build:payment-service

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./libs/database/prisma/schema.prisma && node dist/apps/payment-service/apps/payment-service/src/main.js"]
