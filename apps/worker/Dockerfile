FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY apps/worker ./apps/worker

RUN npm install
RUN npx prisma generate
RUN npm run build --workspace=apps/worker

CMD ["node", "dist/apps/worker/main.js"]
