import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('[DB] Variable de entorno DATABASE_URL no definida');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Supabase requiere SSL
    rejectUnauthorized: false,
  },
  max:             10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('[DB] Nueva conexión a PostgreSQL establecida');
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool:', err);
});