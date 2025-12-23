import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function updatePostgreSQLSchema() {
  // Get PostgreSQL URL
  const postgresUrl = process.env.REMOTE_DATABASE_URL ||
                     process.env.POSTGRESQL_URL ||
                     process.env.POSTGRES_URL;

  if (!postgresUrl || !postgresUrl.startsWith('postgresql://')) {
    console.error('❌ PostgreSQL URL not configured');
    console.error('💡 Set REMOTE_DATABASE_URL in .env file');
    process.exit(1);
  }

  console.log('🔌 Connecting to PostgreSQL...');
  console.log(`🔍 URL: ${postgresUrl.replace(/:[^:@]+@/, ':****@')}`);

  const client = new Client({
    connectionString: postgresUrl
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // List of columns to add
    const alterStatements = [
      // Add session_token to users table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'session_token') THEN
          ALTER TABLE users ADD COLUMN session_token TEXT;
          RAISE NOTICE 'Added session_token to users';
        ELSE
          RAISE NOTICE 'session_token already exists in users';
        END IF;
      END $$;`,

      // Add last_login_at to users table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
          ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
          RAISE NOTICE 'Added last_login_at to users';
        ELSE
          RAISE NOTICE 'last_login_at already exists in users';
        END IF;
      END $$;`,

      // Add profile_image to users table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_image') THEN
          ALTER TABLE users ADD COLUMN profile_image TEXT;
          RAISE NOTICE 'Added profile_image to users';
        ELSE
          RAISE NOTICE 'profile_image already exists in users';
        END IF;
      END $$;`,

      // Add color to categories table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'color') THEN
          ALTER TABLE categories ADD COLUMN color TEXT DEFAULT '#3B82F6';
          RAISE NOTICE 'Added color to categories';
        ELSE
          RAISE NOTICE 'color already exists in categories';
        END IF;
      END $$;`,

      // Add formula to products table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'formula') THEN
          ALTER TABLE products ADD COLUMN formula TEXT;
          RAISE NOTICE 'Added formula to products';
        ELSE
          RAISE NOTICE 'formula already exists in products';
        END IF;
      END $$;`,

      // Add batch columns
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'stock_purchase_price') THEN
          ALTER TABLE batches ADD COLUMN stock_purchase_price FLOAT DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'paid_amount') THEN
          ALTER TABLE batches ADD COLUMN paid_amount FLOAT DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'supplier_outstanding') THEN
          ALTER TABLE batches ADD COLUMN supplier_outstanding FLOAT DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'supplier_invoice_no') THEN
          ALTER TABLE batches ADD COLUMN supplier_invoice_no TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'purchasing_method') THEN
          ALTER TABLE batches ADD COLUMN purchasing_method TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'production_date') THEN
          ALTER TABLE batches ADD COLUMN production_date TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'shelf_name') THEN
          ALTER TABLE batches ADD COLUMN shelf_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'is_reported') THEN
          ALTER TABLE batches ADD COLUMN is_reported BOOLEAN DEFAULT false;
        END IF;
        RAISE NOTICE 'Checked all batch columns';
      END $$;`,

      // Add branch_id to suppliers table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'branch_id') THEN
          ALTER TABLE suppliers ADD COLUMN branch_id TEXT;
          RAISE NOTICE 'Added branch_id to suppliers';
        ELSE
          RAISE NOTICE 'branch_id already exists in suppliers';
        END IF;
      END $$;`,

      // Add branch_id to manufacturers table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturers' AND column_name = 'branch_id') THEN
          ALTER TABLE manufacturers ADD COLUMN branch_id TEXT;
          RAISE NOTICE 'Added branch_id to manufacturers';
        ELSE
          RAISE NOTICE 'branch_id already exists in manufacturers';
        END IF;
      END $$;`,

      // Add branch_id to shelves table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shelves' AND column_name = 'branch_id') THEN
          ALTER TABLE shelves ADD COLUMN branch_id TEXT;
          RAISE NOTICE 'Added branch_id to shelves';
        ELSE
          RAISE NOTICE 'branch_id already exists in shelves';
        END IF;
      END $$;`,

      // Add manufacturer_id to products table
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'manufacturer_id') THEN
          ALTER TABLE products ADD COLUMN manufacturer_id TEXT;
          RAISE NOTICE 'Added manufacturer_id to products';
        ELSE
          RAISE NOTICE 'manufacturer_id already exists in products';
        END IF;
      END $$;`,

      // Add company_id to suppliers table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'company_id') THEN
          ALTER TABLE suppliers ADD COLUMN company_id TEXT;
          RAISE NOTICE 'Added company_id to suppliers';
        ELSE
          RAISE NOTICE 'company_id already exists in suppliers';
        END IF;
      END $$;`,

      // Add company_id to manufacturers table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturers' AND column_name = 'company_id') THEN
          ALTER TABLE manufacturers ADD COLUMN company_id TEXT;
          RAISE NOTICE 'Added company_id to manufacturers';
        ELSE
          RAISE NOTICE 'company_id already exists in manufacturers';
        END IF;
      END $$;`,

      // Add company_id to shelves table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shelves' AND column_name = 'company_id') THEN
          ALTER TABLE shelves ADD COLUMN company_id TEXT;
          RAISE NOTICE 'Added company_id to shelves';
        ELSE
          RAISE NOTICE 'company_id already exists in shelves';
        END IF;
      END $$;`,

      // Add created_by to suppliers table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'created_by') THEN
          ALTER TABLE suppliers ADD COLUMN created_by TEXT;
          RAISE NOTICE 'Added created_by to suppliers';
        ELSE
          RAISE NOTICE 'created_by already exists in suppliers';
        END IF;
      END $$;`,

      // Add created_by to manufacturers table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturers' AND column_name = 'created_by') THEN
          ALTER TABLE manufacturers ADD COLUMN created_by TEXT;
          RAISE NOTICE 'Added created_by to manufacturers';
        ELSE
          RAISE NOTICE 'created_by already exists in manufacturers';
        END IF;
      END $$;`,

      // Add created_by to shelves table if missing
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shelves' AND column_name = 'created_by') THEN
          ALTER TABLE shelves ADD COLUMN created_by TEXT;
          RAISE NOTICE 'Added created_by to shelves';
        ELSE
          RAISE NOTICE 'created_by already exists in shelves';
        END IF;
      END $$;`,
    ];

    console.log('🔄 Adding missing columns to PostgreSQL...');

    for (const sql of alterStatements) {
      try {
        await client.query(sql);
      } catch (error: any) {
        console.error(`⚠️  Error: ${error.message}`);
      }
    }

    console.log('✅ Schema update completed!');

    // Verify columns were added
    console.log('\n📋 Verifying columns...');

    const verifyQueries = [
      { table: 'users', column: 'session_token' },
      { table: 'users', column: 'last_login_at' },
      { table: 'users', column: 'profile_image' },
      { table: 'suppliers', column: 'branch_id' },
      { table: 'manufacturers', column: 'branch_id' },
      { table: 'shelves', column: 'branch_id' },
      { table: 'products', column: 'manufacturer_id' },
      { table: 'products', column: 'formula' },
      { table: 'categories', column: 'color' },
      { table: 'batches', column: 'stock_purchase_price' },
      { table: 'batches', column: 'paid_amount' },
    ];

    for (const { table, column } of verifyQueries) {
      const result = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `, [table, column]);

      if (result.rows.length > 0) {
        console.log(`✅ ${table}.${column} exists`);
      } else {
        console.log(`❌ ${table}.${column} NOT found`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from PostgreSQL');
  }
}

updatePostgreSQLSchema()
  .then(() => {
    console.log('\n✅ PostgreSQL schema update completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to update PostgreSQL schema:', error);
    process.exit(1);
  });
