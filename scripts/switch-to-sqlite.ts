/**
 * Script to switch Prisma schema from PostgreSQL to SQLite
 * Run this when you want to use SQLite for offline mode
 */

import * as fs from 'fs';
import * as path from 'path';

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

async function switchToSQLite() {
  try {
    console.log('🔄 Switching Prisma schema to SQLite...');

    // Read current schema
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');

    // Replace PostgreSQL provider with SQLite
    const updatedSchema = schemaContent.replace(
      /provider\s*=\s*"postgresql"/g,
      'provider = "sqlite"'
    );

    // Write updated schema
    fs.writeFileSync(schemaPath, updatedSchema, 'utf8');

    console.log('✅ Schema updated to SQLite');
    console.log('📝 Next steps:');
    console.log('   1. Run: npm run db:generate');
    console.log('   2. Run: npm run db:push');
    console.log('   3. Set DATABASE_URL="file:./data/zapeera.db"');

  } catch (error: any) {
    console.error('❌ Error switching schema:', error.message);
    process.exit(1);
  }
}

switchToSQLite();
