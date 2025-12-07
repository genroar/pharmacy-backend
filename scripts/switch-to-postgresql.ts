/**
 * Script to switch Prisma schema from SQLite to PostgreSQL
 * Run this when you want to use PostgreSQL
 */

import * as fs from 'fs';
import * as path from 'path';

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

async function switchToPostgreSQL() {
  try {
    console.log('🔄 Switching Prisma schema to PostgreSQL...');

    // Read current schema
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');

    // Replace SQLite provider with PostgreSQL
    const updatedSchema = schemaContent.replace(
      /provider\s*=\s*"sqlite"/g,
      'provider = "postgresql"'
    );

    // Write updated schema
    fs.writeFileSync(schemaPath, updatedSchema, 'utf8');

    console.log('✅ Schema updated to PostgreSQL');
    console.log('📝 Next steps:');
    console.log('   1. Run: npm run db:generate');
    console.log('   2. Set DATABASE_URL="postgresql://user:password@host:5432/database"');

  } catch (error: any) {
    console.error('❌ Error switching schema:', error.message);
    process.exit(1);
  }
}

switchToPostgreSQL();
