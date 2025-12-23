/**
 * Database Initializer - Ensures SQLite database is properly initialized
 * This MUST run before any Prisma operations
 *
 * CRITICAL: This handles first-time install scenarios where:
 * 1. SQLite DB file doesn't exist
 * 2. Prisma schema hasn't been applied
 * 3. Database directory doesn't exist
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

export interface DatabaseInitResult {
  success: boolean;
  databasePath: string;
  existed: boolean;
  created: boolean;
  schemaApplied: boolean;
  error?: string;
}

/**
 * Initialize SQLite database with Prisma schema
 * This ensures the database exists and has all tables before any operations
 */
export async function initializeSQLiteDatabase(): Promise<DatabaseInitResult> {
  const result: DatabaseInitResult = {
    success: false,
    databasePath: '',
    existed: false,
    created: false,
    schemaApplied: false
  };

  try {
    // Determine database path
    const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
    result.databasePath = sqlitePath;

    // Ensure directory exists
    const dbDir = path.dirname(sqlitePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('[DB Init] 📁 Created database directory:', dbDir);
    }

    // Check if database file exists
    const dbExists = fs.existsSync(sqlitePath);
    result.existed = dbExists;

    if (dbExists) {
      console.log('[DB Init] ✅ Database file exists:', sqlitePath);

      // Verify database is valid by checking if it has tables
      try {
        const prisma = new PrismaClient();
        await prisma.$connect();

        // Check if tables exist
        const tables = await prisma.$queryRawUnsafe<any[]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
        );

        await prisma.$disconnect();

        if (tables.length > 0) {
          console.log(`[DB Init] ✅ Database has ${tables.length} tables - schema already applied`);
          result.schemaApplied = true;
          result.success = true;
          return result;
        } else {
          console.log('[DB Init] ⚠️ Database exists but has no tables - applying schema...');
          result.existed = false; // Treat as new for schema application
        }
      } catch (checkError: any) {
        console.log('[DB Init] ⚠️ Database check failed, will recreate:', checkError.message);
        // Database might be corrupted, will recreate
        result.existed = false;
      }
    }

    // Apply Prisma schema using db push
    console.log('[DB Init] 📋 Applying Prisma schema to SQLite database...');
    try {
      const backendDir = path.join(__dirname, '..', '..');
      const env = {
        ...process.env,
        DATABASE_URL: `file:${sqlitePath}`
      };

      // Run prisma db push to create all tables
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        cwd: backendDir,
        env,
        stdio: 'pipe',
        timeout: 120000 // 2 minute timeout
      });

      console.log('[DB Init] ✅ Prisma schema applied successfully');
      result.schemaApplied = true;
      result.created = !dbExists;
      result.success = true;

      // Verify tables were created
      try {
        const prisma = new PrismaClient();
        await prisma.$connect();
        const tables = await prisma.$queryRawUnsafe<any[]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
        );
        await prisma.$disconnect();
        console.log(`[DB Init] ✅ Verified: ${tables.length} tables created`);
      } catch (verifyError: any) {
        console.warn('[DB Init] ⚠️ Could not verify tables:', verifyError.message);
      }

    } catch (schemaError: any) {
      console.error('[DB Init] ❌ Failed to apply schema:', schemaError.message);
      result.error = `Schema application failed: ${schemaError.message}`;

      // If schema application fails, try to create at least an empty database file
      if (!dbExists) {
        try {
          // Create empty database file as fallback
          fs.writeFileSync(sqlitePath, '');
          console.log('[DB Init] ⚠️ Created empty database file as fallback');
          result.created = true;
        } catch (fileError: any) {
          console.error('[DB Init] ❌ Could not create database file:', fileError.message);
          result.error = `Could not create database: ${fileError.message}`;
        }
      }

      return result;
    }

    return result;
  } catch (error: any) {
    console.error('[DB Init] ❌ Database initialization failed:', error.message);
    result.error = error.message;
    return result;
  }
}

/**
 * Check if database is properly initialized
 */
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');

    if (!fs.existsSync(sqlitePath)) {
      return false;
    }

    const prisma = new PrismaClient();
    await prisma.$connect();

    // Check if tables exist
    const tables = await prisma.$queryRawUnsafe<any[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
    );

    await prisma.$disconnect();

    return tables.length > 0;
  } catch (error: any) {
    console.error('[DB Init] Database check failed:', error.message);
    return false;
  }
}







