import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'libs/database/prisma/schema.prisma',
  migrations: {
    path: 'libs/database/prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})