import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

function shouldUseSsl(databaseUrl = '') {
  return /render\.com|render\.internal|railway|supabase|neon/i.test(databaseUrl);
}

export const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: shouldUseSsl(env.databaseUrl) ? { rejectUnauthorized: false } : false
    })
  : null;

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env a partir de backend/.env.example.');
  }
  return pool.query(text, params);
}

export async function healthcheckDb() {
  if (!pool) {
    return {
      connected: false,
      reason: 'DATABASE_URL não configurada',
      envFileLoaded: env.loadedEnvFile || null
    };
  }

  try {
    await pool.query('select 1 as ok');
    return {
      connected: true,
      envFileLoaded: env.loadedEnvFile || null
    };
  } catch (error) {
    return {
      connected: false,
      reason: error.message,
      envFileLoaded: env.loadedEnvFile || null
    };
  }
}

export async function closePool() {
  if (pool) await pool.end();
}
