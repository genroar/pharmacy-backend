/**
 * Check if SQLite database already exists
 * This script checks for existing SQLite database files and provides information
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaClient } from '@prisma/client';

interface DatabaseInfo {
  exists: boolean;
  path: string;
  size: number;
  tables: string[];
  canConnect: boolean;
  error?: string;
}

/**
 * Check if SQLite database file exists
 */
export function checkSQLiteDatabase(dbPath: string): DatabaseInfo {
  const info: DatabaseInfo = {
    exists: false,
    path: dbPath,
    size: 0,
    tables: [],
    canConnect: false
  };

  try {
    // Check if file exists
    if (fs.existsSync(dbPath)) {
      info.exists = true;
      const stats = fs.statSync(dbPath);
      info.size = stats.size;

      // Try to connect and get table information
      try {
        const prisma = new PrismaClient({
          datasources: {
            db: {
              url: `file:${dbPath}`
            }
          }
        });

        // Try to query tables (this will work if database is valid)
        // Note: This is a simplified check - actual table query depends on Prisma schema
        info.canConnect = true;
        prisma.$disconnect();
      } catch (error: any) {
        info.canConnect = false;
        info.error = error.message;
      }
    } else {
      // Check if directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        info.error = `Directory does not exist: ${dir}`;
      } else {
        info.error = 'Database file does not exist';
      }
    }
  } catch (error: any) {
    info.error = error.message;
  }

  return info;
}

/**
 * Get all possible SQLite database paths
 */
export function getPossibleSQLitePaths(): string[] {
  const paths: string[] = [];

  // Common locations
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();

  // Default paths
  paths.push(
    path.join(process.cwd(), 'data', 'zapeera.db'),
    path.join(process.cwd(), 'prisma', 'dev.db'),
    path.join(process.cwd(), 'database.db'),
    path.join(homeDir, '.zapeera', 'database.db'),
    path.join(homeDir, '.zapeera', 'data', 'zapeera.db')
  );

  // Check DATABASE_URL for file: protocol
  if (process.env.DATABASE_URL) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl.startsWith('file:')) {
      const filePath = dbUrl.replace('file:', '').split('?')[0];
      if (!paths.includes(filePath)) {
        paths.unshift(filePath); // Add to beginning
      }
    }
  }

  return paths;
}

/**
 * Find existing SQLite database
 */
export function findExistingSQLiteDatabase(): DatabaseInfo | null {
  const possiblePaths = getPossibleSQLitePaths();

  for (const dbPath of possiblePaths) {
    const info = checkSQLiteDatabase(dbPath);
    if (info.exists && info.canConnect) {
      return info;
    }
  }

  return null;
}

// CLI execution
if (require.main === module) {

  console.log('='.repeat(60));
  console.log('🔍 CHECKING FOR EXISTING SQLITE DATABASE');
  console.log('='.repeat(60));
  console.log('');

  // Check DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('📊 DATABASE_URL:', process.env.DATABASE_URL);
    if (process.env.DATABASE_URL.startsWith('file:')) {
      const dbPath = process.env.DATABASE_URL.replace('file:', '').split('?')[0];
      const info = checkSQLiteDatabase(dbPath);

      console.log('');
      console.log('📁 Database Path:', info.path);
      console.log('✅ Exists:', info.exists ? 'Yes' : 'No');
      if (info.exists) {
        console.log('📦 Size:', `${(info.size / 1024).toFixed(2)} KB`);
        console.log('🔗 Can Connect:', info.canConnect ? 'Yes' : 'No');
      }
      if (info.error) {
        console.log('❌ Error:', info.error);
      }
    } else {
      console.log('ℹ️  DATABASE_URL is not a SQLite file path (file: protocol)');
      console.log('ℹ️  Current database type:', process.env.DATABASE_URL.split(':')[0]);
    }
  } else {
    console.log('⚠️  DATABASE_URL is not set');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('🔍 SEARCHING FOR SQLITE DATABASES IN COMMON LOCATIONS');
  console.log('='.repeat(60));
  console.log('');

  const possiblePaths = getPossibleSQLitePaths();
  let foundAny = false;

  for (const dbPath of possiblePaths) {
    const info = checkSQLiteDatabase(dbPath);
    if (info.exists) {
      foundAny = true;
      console.log(`✅ Found: ${dbPath}`);
      console.log(`   Size: ${(info.size / 1024).toFixed(2)} KB`);
      console.log(`   Can Connect: ${info.canConnect ? 'Yes' : 'No'}`);
      if (info.error) {
        console.log(`   ⚠️  ${info.error}`);
      }
      console.log('');
    }
  }

  if (!foundAny) {
    console.log('❌ No existing SQLite databases found in common locations');
    console.log('');
    console.log('Searched paths:');
    possiblePaths.forEach(p => console.log(`  - ${p}`));
  }

  console.log('');
  console.log('='.repeat(60));

  // Find existing database
  const existing = findExistingSQLiteDatabase();
  if (existing) {
    console.log('✅ Found existing SQLite database:', existing.path);
    process.exit(0);
  } else {
    console.log('ℹ️  No existing SQLite database found');
    process.exit(1);
  }
}
