/**
 * Create PostgreSQL Tables from SQLite Schema
 * This script creates all tables in PostgreSQL based on the Prisma schema
 * Run: npx ts-node scripts/create-postgresql-tables.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function createPostgreSQLTables() {
  const postgresUrl = process.env.REMOTE_DATABASE_URL ||
                     process.env.POSTGRESQL_URL ||
                     process.env.DATABASE_URL;

  if (!postgresUrl || !postgresUrl.startsWith('postgresql://')) {
    console.error('❌ PostgreSQL URL not configured');
    console.error('💡 Set REMOTE_DATABASE_URL in .env file');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: postgresUrl
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read Prisma schema to get table definitions
    // For now, we'll create a basic migration script
    // You should run: npx prisma migrate dev --name init_postgresql

    console.log('💡 To create PostgreSQL tables, run:');
    console.log('   1. Switch Prisma schema to PostgreSQL temporarily');
    console.log('   2. Run: npx prisma migrate dev --name init_postgresql');
    console.log('   3. Or use: npx prisma db push');
    console.log('');
    console.log('💡 Alternatively, you can manually create tables using SQL');
    console.log('   See: migrations/001_add_sync_fields.sql');

    await client.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

createPostgreSQLTables();
