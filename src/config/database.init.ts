/**
 * Database Initialization - MUST be imported FIRST before any Prisma imports
 * This ensures DATABASE_URL is set before Prisma validates the schema
 *
 * DUAL MODE SUPPORT:
 * - USE_POSTGRESQL=true  -> Website mode (PostgreSQL direct)
 * - USE_POSTGRESQL=false -> Electron mode (SQLite offline + sync)
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Load environment variables FIRST
// Try to load from project root .env file
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('[DB Init] ⚠️ Could not load .env file:', result.error.message);
  // Try default location
dotenv.config();
}

// Ensure JWT_SECRET is set (with fallback for development)
if (!process.env.JWT_SECRET) {
  console.warn('[DB Init] ⚠️ JWT_SECRET not found in .env, using default (NOT FOR PRODUCTION)');
  process.env.JWT_SECRET = 'default-dev-secret-key-change-in-production-06822039aa62836f52f2d1513812e8ee94772c26f02357cc7e9a1ed293ff359c';
} else {
  console.log('[DB Init] ✅ JWT_SECRET loaded from environment');
}

// Check if we should use PostgreSQL directly (for website)
const usePostgreSQL = process.env.USE_POSTGRESQL === 'true';

// PostgreSQL URL for remote database
const POSTGRESQL_URL = process.env.REMOTE_DATABASE_URL ||
                       process.env.POSTGRESQL_URL ||
                       'postgresql://poszap_user:Ezify143@31.97.72.136:5432/poszap_db?schema=public';

// SQLite URL for offline mode
const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
const sqliteDir = path.dirname(sqlitePath);
const SQLITE_URL = `file:${sqlitePath}`;

// Ensure SQLite directory exists
if (!fs.existsSync(sqliteDir)) {
  try {
    fs.mkdirSync(sqliteDir, { recursive: true });
    console.log('[DB Init] Created SQLite directory:', sqliteDir);
  } catch (err) {
    console.warn('[DB Init] Could not create SQLite directory:', err);
  }
}

// Store PostgreSQL URL for sync operations
process.env.REMOTE_DATABASE_URL = POSTGRESQL_URL;

if (usePostgreSQL) {
  // Website mode - use PostgreSQL directly
  // Note: This requires schema to be postgresql provider
  console.log('[DB Init] 🌐 WEBSITE MODE - Using PostgreSQL directly');
  console.log('[DB Init] ⚠️  Note: For website, deploy with postgresql schema');
  process.env.DATABASE_URL = POSTGRESQL_URL;
} else {
  // Electron/Software mode - use SQLite for offline support
  console.log('[DB Init] 💻 ELECTRON MODE - Using SQLite for offline support');
  console.log('[DB Init] 📁 SQLite path:', sqlitePath);
  console.log('[DB Init] 🔗 PostgreSQL URL available for sync');
  process.env.DATABASE_URL = SQLITE_URL;
}

// Export for reference
export const DATABASE_INITIALIZED = true;
export const IS_POSTGRESQL_MODE = usePostgreSQL;
export const POSTGRES_URL = POSTGRESQL_URL;
export const SQLITE_PATH = sqlitePath;

console.log('[DB Init] ✅ Database initialization complete');
console.log('[DB Init] 📊 Mode:', usePostgreSQL ? 'PostgreSQL (Web)' : 'SQLite (Electron)');
