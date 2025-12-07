/**
 * Database Utility - Provides Prisma client that works with both SQLite and PostgreSQL
 * Use this instead of creating PrismaClient directly in controllers
 */

// CRITICAL: Import database initialization FIRST to ensure DATABASE_URL is set
import '../config/database.init';

import { PrismaClient } from '@prisma/client';
import { getDatabaseService } from '../services/database.service';

let cachedClient: PrismaClient | null = null;

/**
 * Get Prisma client - automatically uses correct database (SQLite/PostgreSQL)
 * This is the recommended way to get a database client in controllers
 */
export async function getPrisma(): Promise<PrismaClient> {
  try {
    // CRITICAL: Ensure DATABASE_URL is set to SQLite before getting client
    const currentDbUrl = process.env.DATABASE_URL || '';
    if (!currentDbUrl || !currentDbUrl.startsWith('file:')) {
      console.warn('[DB Util] ⚠️  DATABASE_URL is not set or not SQLite, setting it now:', currentDbUrl || 'NOT SET');
      const path = require('path');
      const os = require('os');
      const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
      const sqliteUrl = `file:${sqlitePath}`;

      // Set DATABASE_URL multiple ways to ensure it persists
      process.env.DATABASE_URL = sqliteUrl;
      Object.defineProperty(process.env, 'DATABASE_URL', {
        value: sqliteUrl,
        writable: true,
        enumerable: true,
        configurable: true
      });

      // Also set on global if available
      if (typeof global !== 'undefined' && global.process && global.process.env) {
        global.process.env.DATABASE_URL = sqliteUrl;
      }

      console.log('[DB Util] ✅ Set DATABASE_URL to SQLite:', process.env.DATABASE_URL);

      // Verify it was set correctly
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
        const error = new Error(`Failed to set DATABASE_URL. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
        console.error('[DB Util] ❌ FATAL ERROR:', error.message);
        throw error;
      }

      // Clear cached client if DATABASE_URL changed (it might be invalid now)
      if (cachedClient) {
        console.log('[DB Util] Clearing cached client due to DATABASE_URL change');
        cachedClient = null;
      }
    }

    const dbService = getDatabaseService();
    const client = await dbService.getClient();

    // CRITICAL: Ensure DATABASE_URL is set right before returning client
    // Prisma validates schema when executing queries, so DATABASE_URL must be set
    const path = require('path');
    const os = require('os');
    const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
    const sqliteUrl = `file:${sqlitePath}`;

    // Force set DATABASE_URL one more time before returning client
    process.env.DATABASE_URL = sqliteUrl;
    Object.defineProperty(process.env, 'DATABASE_URL', {
      value: sqliteUrl,
      writable: true,
      enumerable: true,
      configurable: true
    });

    if (typeof global !== 'undefined' && global.process && global.process.env) {
      global.process.env.DATABASE_URL = sqliteUrl;
    }

    // Final verification
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
      const error = new Error(`DATABASE_URL is not set correctly before returning client. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
      console.error('[DB Util] ❌ FATAL ERROR:', error.message);
      throw error;
    }

    console.log('[DB Util] ✅ Final verification - DATABASE_URL is set before returning client:', process.env.DATABASE_URL);

    // CRITICAL: Create a proxy wrapper that ensures DATABASE_URL is set before any operation
    // Prisma's runtime module validates schema when operations execute, so DATABASE_URL must be set
    const ensureDatabaseUrl = () => {
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
        process.env.DATABASE_URL = sqliteUrl;
        Object.defineProperty(process.env, 'DATABASE_URL', {
          value: sqliteUrl,
          writable: true,
          enumerable: true,
          configurable: true
        });
        if (typeof global !== 'undefined' && global.process && global.process.env) {
          global.process.env.DATABASE_URL = sqliteUrl;
        }
      }
    };

    // Add Prisma middleware to ensure DATABASE_URL is set before every query
    try {
      client.$use(async (params, next) => {
        ensureDatabaseUrl();
        return next(params);
      });
    } catch (e) {
      // Middleware might already be set, ignore
      console.warn('[DB Util] Could not add Prisma middleware (might already be set)');
    }

    // Cache the client for faster access
    if (!cachedClient || cachedClient !== client) {
      cachedClient = client;
    }

    return client;
  } catch (error: any) {
    console.error('[DB Util] Failed to get client from database service:', error.message);
    console.error('[DB Util] Current DATABASE_URL:', process.env.DATABASE_URL || 'NOT SET');

    // Check if error is due to missing DATABASE_URL
    if (error.message && error.message.includes('Environment variable not found: DATABASE_URL')) {
      console.error('[DB Util] ❌ DATABASE_URL environment variable not found!');
      console.error('[DB Util] 💡 Attempting to fix by setting DATABASE_URL now...');

      const path = require('path');
      const os = require('os');
      const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
      const sqliteUrl = `file:${sqlitePath}`;

      // Set DATABASE_URL multiple ways
      process.env.DATABASE_URL = sqliteUrl;
      Object.defineProperty(process.env, 'DATABASE_URL', {
        value: sqliteUrl,
        writable: true,
        enumerable: true,
        configurable: true
      });

      if (typeof global !== 'undefined' && global.process && global.process.env) {
        global.process.env.DATABASE_URL = sqliteUrl;
      }

      console.error('[DB Util] ✅ Set DATABASE_URL to:', process.env.DATABASE_URL);
      console.error('[DB Util] 💡 Retrying to get client...');

      // Retry getting the client
      try {
        const dbService = getDatabaseService();
        const client = await dbService.getClient();
        cachedClient = client;
        return client;
      } catch (retryError: any) {
        console.error('[DB Util] ❌ Retry also failed:', retryError.message);
        throw new Error(`Failed to initialize database client. DATABASE_URL was not set. Please ensure database.init.ts runs before any Prisma imports. Error: ${retryError.message}`);
      }
    }

    // Check if error is due to schema mismatch (SQLite URL with PostgreSQL schema)
    const dbUrl = process.env.DATABASE_URL || '';
    const isSQLiteUrl = dbUrl.startsWith('file:');

    if (isSQLiteUrl && error.message && (
      error.message.includes('protocol') ||
      error.message.includes('postgresql://') ||
      error.message.includes('postgres://') ||
      error.message.includes('the URL must start with the protocol')
    )) {
      // Schema mismatch: PostgreSQL schema but SQLite URL
      console.error('[DB Util] ❌ Schema mismatch detected:');
      console.error('[DB Util]    - Prisma schema is set to PostgreSQL');
      console.error('[DB Util]    - DATABASE_URL is set to SQLite (file://)');
      console.error('[DB Util] 💡 Solution: Either:');
      console.error('[DB Util]    1. Set DATABASE_URL to PostgreSQL URL, OR');
      console.error('[DB Util]    2. Switch schema to SQLite: npm run db:switch-sqlite && npm run db:generate');
      throw new Error('Database schema mismatch. Prisma schema is PostgreSQL but DATABASE_URL is SQLite. Please set DATABASE_URL to a PostgreSQL connection string or switch the schema to SQLite.');
    }

    // Fallback: try to create client with DATABASE_URL if set and it matches schema
    if (process.env.DATABASE_URL && !isSQLiteUrl) {
      try {
        const client = new PrismaClient();
        await client.$connect();
        cachedClient = client;
        return client;
      } catch (e: any) {
        console.error('[DB Util] Failed to create PrismaClient with DATABASE_URL:', e.message);
        throw e;
      }
    }

    // If we get here, we don't have a valid configuration
    throw new Error('Failed to initialize database client. Please check your database configuration. Ensure DATABASE_URL is set to a PostgreSQL connection string (postgresql://...) or switch the schema to SQLite.');
  }
}

/**
 * Synchronous version - returns cached client or creates new one
 * Use with caution - may not have the correct database selected
 * NOTE: This should rarely be used - prefer getPrisma() instead
 */
export function getPrismaSync(): PrismaClient {
  if (cachedClient) {
    return cachedClient;
  }

  // Ensure DATABASE_URL is set before creating PrismaClient
  if (!process.env.DATABASE_URL || (!process.env.DATABASE_URL.startsWith('file:') && !process.env.DATABASE_URL.startsWith('postgresql://'))) {
    const path = require('path');
    const os = require('os');
    const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
    process.env.DATABASE_URL = `file:${sqlitePath}`;
    console.log('[DB Util] Set DATABASE_URL to SQLite in getPrismaSync():', process.env.DATABASE_URL);
  }

  // Try to get from database service synchronously (may not work)
  try {
    const dbService = getDatabaseService();
    // This is a workaround - we'll use async version in most cases
    if (process.env.DATABASE_URL) {
      return new PrismaClient();
    }
  } catch (error) {
    // Ignore
  }

  // Fallback - create with DATABASE_URL (should be set by now)
  if (process.env.DATABASE_URL) {
    return new PrismaClient();
  }

  // Last resort: SQLite (should not reach here if above worked)
  const path = require('path');
  const os = require('os');
  const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
  process.env.DATABASE_URL = `file:${sqlitePath}`;
  return new PrismaClient();
}
