import { defineConfig } from 'drizzle-kit'
import { join } from 'node:path'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: join(process.cwd(), 'data', 'cache.db'),
  },
  strict: true,
  verbose: true,
})
