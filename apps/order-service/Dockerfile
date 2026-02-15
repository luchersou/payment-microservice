FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

RUN npx prisma generate --schema=./libs/database/prisma/schema.prisma
RUN npm run build:order-service

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./libs/database/prisma/schema.prisma && node dist/apps/order-service/apps/order-service/src/main.js"]
