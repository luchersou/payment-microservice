FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY apps/api ./apps/api

RUN npm install
RUN npx prisma generate
RUN npm run build --workspace=apps/api

EXPOSE 3000

CMD ["node", "dist/apps/api/main.js"]
