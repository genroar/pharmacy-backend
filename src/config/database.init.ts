/**
 * Database Initialization - MUST be imported FIRST before any Prisma imports
 * This ensures DATABASE_URL is set to SQLite before Prisma validates the schema
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Load environment variables FIRST
dotenv.config();

// CRITICAL: Set DATABASE_URL to SQLite BEFORE any Prisma imports
// Prisma validates schema against DATABASE_URL when @prisma/client is imported
// So we MUST set it here, before any other file imports Prisma

const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
const sqliteDir = path.dirname(sqlitePath);
const sqliteUrl = `file:${sqlitePath}`;

// If DATABASE_URL is already set correctly, use it (from package.json scripts)
// Otherwise, set it to SQLite
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  // DATABASE_URL is not set or not SQLite, so we'll set it below
} else {
  // DATABASE_URL is already set correctly from package.json script
  console.log('[DB Init] ✅ DATABASE_URL already set from environment:', process.env.DATABASE_URL);
}

// Ensure directory exists
if (!fs.existsSync(sqliteDir)) {
  try {
    fs.mkdirSync(sqliteDir, { recursive: true });
  } catch (err) {
    console.warn('[DB Init] Could not create SQLite directory:', err);
  }
}

// Store original PostgreSQL URL if it exists (for online sync) BEFORE overriding
// Also check for default PostgreSQL URL in environment
const originalDbUrl = process.env.DATABASE_URL;
let postgresUrl = '';

// Priority: 1. DATABASE_URL (if PostgreSQL), 2. REMOTE_DATABASE_URL, 3. Default PostgreSQL URL
if (originalDbUrl && originalDbUrl.startsWith('postgresql://')) {
  postgresUrl = originalDbUrl;
  console.log('[DB Init] ✅ Found PostgreSQL URL in DATABASE_URL');
} else if (process.env.REMOTE_DATABASE_URL && process.env.REMOTE_DATABASE_URL.startsWith('postgresql://')) {
  postgresUrl = process.env.REMOTE_DATABASE_URL;
  console.log('[DB Init] ✅ Found PostgreSQL URL in REMOTE_DATABASE_URL');
} else {
  // Try to use a default PostgreSQL URL if available
  // This allows automatic online mode when PostgreSQL is available
  // System will automatically try to connect and switch to online mode if successful
  // Format: postgresql://user:password@host:port/database

  // Check for PostgreSQL URL in environment variables
  const defaultPostgresUrl = process.env.DEFAULT_POSTGRESQL_URL ||
                             process.env.POSTGRESQL_URL ||
                             process.env.POSTGRES_URL;

  if (defaultPostgresUrl && defaultPostgresUrl.startsWith('postgresql://')) {
    postgresUrl = defaultPostgresUrl;
    console.log('[DB Init] ✅ Found PostgreSQL URL in environment - will try automatic online mode');
    console.log('[DB Init] 💡 System will automatically switch to online mode if PostgreSQL is available');
  } else {
    console.log('[DB Init] ℹ️  No PostgreSQL URL configured - will use SQLite only (offline mode)');
    console.log('[DB Init] 💡 To enable automatic online mode, set one of these in .env:');
    console.log('[DB Init]    - REMOTE_DATABASE_URL="postgresql://user:pass@host:port/db"');
    console.log('[DB Init]    - POSTGRESQL_URL="postgresql://user:pass@host:port/db"');
    console.log('[DB Init]    - POSTGRES_URL="postgresql://user:pass@host:port/db"');
    console.log('[DB Init] 💡 System will automatically detect and switch to online mode when PostgreSQL is available');
  }
}

// Store PostgreSQL URL in REMOTE_DATABASE_URL for online sync
if (postgresUrl && postgresUrl.startsWith('postgresql://')) {
  if (!process.env.REMOTE_DATABASE_URL) {
    process.env.REMOTE_DATABASE_URL = postgresUrl;
    console.log('[DB Init] ✅ Stored PostgreSQL URL in REMOTE_DATABASE_URL for automatic online sync');
  }
}

// ALWAYS set to SQLite URL for offline mode (schema is SQLite)
// PostgreSQL URL from .env is now in REMOTE_DATABASE_URL
// Only set if not already set correctly
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = sqliteUrl;
  console.log('[DB Init] ✅ Set DATABASE_URL to SQLite for offline mode:', process.env.DATABASE_URL);
} else {
  // Already set correctly, just verify
  console.log('[DB Init] ✅ DATABASE_URL already set correctly:', process.env.DATABASE_URL);
}

// Verify it was set correctly
if (process.env.DATABASE_URL !== sqliteUrl) {
  console.error('[DB Init] ❌ ERROR: DATABASE_URL was not set correctly!');
  console.error('[DB Init] Expected:', sqliteUrl);
  console.error('[DB Init] Actual:', process.env.DATABASE_URL);
  // Force set it again
  process.env.DATABASE_URL = sqliteUrl;
}

console.log('[DB Init] ✅ DATABASE_URL set to SQLite for offline mode:', process.env.DATABASE_URL);
console.log('[DB Init] ✅ Verification: DATABASE_URL starts with file:', process.env.DATABASE_URL?.startsWith('file:'));

// CRITICAL: Force set one more time to ensure it's definitely set
// Sometimes process.env can be reset, so we do this as a final safety measure
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  console.warn('[DB Init] ⚠️  WARNING: DATABASE_URL was not set or reset! Setting it to SQLite...');
  process.env.DATABASE_URL = sqliteUrl;
  console.log('[DB Init] ✅ DATABASE_URL set to:', process.env.DATABASE_URL);
}

// CRITICAL: Set DATABASE_URL on process.env multiple times to ensure it persists
// Some module loaders or bundlers might cache process.env, so we set it multiple ways
process.env.DATABASE_URL = sqliteUrl;
Object.defineProperty(process.env, 'DATABASE_URL', {
  value: sqliteUrl,
  writable: true,
  enumerable: true,
  configurable: true
});

// Export to ensure this module is executed
export const DATABASE_INITIALIZED = true;

// Also set it on global to ensure it persists
if (typeof global !== 'undefined') {
  (global as any).__DATABASE_URL_SET__ = true;
  (global as any).__DATABASE_URL__ = sqliteUrl;

  // Also set it on global.process.env to ensure it's available everywhere
  if (typeof global.process !== 'undefined' && global.process.env) {
    global.process.env.DATABASE_URL = sqliteUrl;
  }
}

// Final verification - throw error if DATABASE_URL is still not set
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  const error = new Error(`DATABASE_URL is not set correctly. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
  console.error('[DB Init] ❌ FATAL ERROR:', error.message);
  throw error;
}
