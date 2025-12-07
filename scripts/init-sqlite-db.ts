/**
 * Initialize SQLite database if it doesn't exist
 * Checks for existing database and creates one if needed
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

interface DatabaseInitResult {
  success: boolean;
  databasePath: string;
  existed: boolean;
  created: boolean;
  error?: string;
}

/**
 * Check if SQLite database exists
 */
function checkDatabaseExists(dbPath: string): boolean {
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      return stats.isFile() && stats.size > 0;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Initialize SQLite database
 */
export function initializeSQLiteDatabase(dbPath?: string): DatabaseInitResult {
  const result: DatabaseInitResult = {
    success: false,
    databasePath: '',
    existed: false,
    created: false
  };

  try {
    // Determine database path
    if (!dbPath) {
      // Default path
      dbPath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
    }

    result.databasePath = dbPath;

    // Check if database already exists
    if (checkDatabaseExists(dbPath)) {
      result.existed = true;
      result.success = true;
      console.log(`✅ SQLite database already exists: ${dbPath}`);
      return result;
    }

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`📁 Created database directory: ${dbDir}`);
    }

    // Check if Prisma schema supports SQLite
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      result.error = 'Prisma schema not found';
      return result;
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const isSQLite = schemaContent.includes('provider = "sqlite"');

    if (!isSQLite) {
      console.log('⚠️  Prisma schema is not configured for SQLite');
      console.log('💡 To use SQLite, update prisma/schema.prisma:');
      console.log('   datasource db {');
      console.log('     provider = "sqlite"');
      console.log('     url      = env("DATABASE_URL")');
      console.log('   }');
      result.error = 'Schema not configured for SQLite';
      return result;
    }

    // Set DATABASE_URL environment variable
    process.env.DATABASE_URL = `file:${dbPath}`;

    // Run Prisma migrations/push to create database
    try {
      console.log('🔄 Creating SQLite database...');
      execSync('npx prisma db push --skip-generate', {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
      });

      result.created = true;
      result.success = true;
      console.log(`✅ SQLite database created successfully: ${dbPath}`);
    } catch (error: any) {
      result.error = `Failed to create database: ${error.message}`;
      console.error(`❌ Error creating database: ${error.message}`);
      return result;
    }

  } catch (error: any) {
    result.error = error.message;
    console.error(`❌ Error initializing database: ${error.message}`);
  }

  return result;
}

// CLI execution
if (require.main === module) {
  console.log('='.repeat(60));
  console.log('🗄️  SQLITE DATABASE INITIALIZATION');
  console.log('='.repeat(60));
  console.log('');

  const dbPath = process.argv[2] || undefined;
  const result = initializeSQLiteDatabase(dbPath);

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 RESULT');
  console.log('='.repeat(60));
  console.log(`Database Path: ${result.databasePath}`);
  console.log(`Existed: ${result.existed ? 'Yes' : 'No'}`);
  console.log(`Created: ${result.created ? 'Yes' : 'No'}`);
  console.log(`Success: ${result.success ? 'Yes' : 'No'}`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }
  console.log('='.repeat(60));

  if (result.success) {
    console.log('');
    console.log('💡 To use this database, set DATABASE_URL in your .env file:');
    console.log(`   DATABASE_URL="file:${result.databasePath}"`);
    process.exit(0);
  } else {
    process.exit(1);
  }
}
