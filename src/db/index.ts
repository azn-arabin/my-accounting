import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

declare global {
  var _dbPool: Pool | undefined;
}

const pool = globalThis._dbPool ?? new Pool({ connectionString: process.env.DATABASE_URL! });

if (process.env.NODE_ENV !== 'production') {
  globalThis._dbPool = pool;
}

export const db = drizzle(pool, { schema });
