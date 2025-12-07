/**
 * Check if SQLite database already exists (JavaScript version)
 * Can be run directly with: node scripts/check-sqlite-db.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Check if SQLite database file exists
 */
function checkSQLiteDatabase(dbPath) {
  const info = {
    exists: false,
    path: dbPath,
    size: 0,
    canConnect: false,
    error: null
  };

  try {
    // Check if file exists
    if (fs.existsSync(dbPath)) {
      info.exists = true;
      const stats = fs.statSync(dbPath);
      info.size = stats.size;
      info.canConnect = true; // File exists, assume it's valid
    } else {
      // Check if directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        info.error = `Directory does not exist: ${dir}`;
      } else {
        info.error = 'Database file does not exist';
      }
    }
  } catch (error) {
    info.error = error.message;
  }

  return info;
}

/**
 * Get all possible SQLite database paths
 */
function getPossibleSQLitePaths() {
  const paths = [];
  const homeDir = os.homedir();

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
function findExistingSQLiteDatabase() {
  const possiblePaths = getPossibleSQLitePaths();

  for (const dbPath of possiblePaths) {
    const info = checkSQLiteDatabase(dbPath);
    if (info.exists && info.canConnect) {
      return info;
    }
  }

  return null;
}

// Main execution
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
  console.log('');
  console.log('💡 To use this database, set DATABASE_URL in your .env file:');
  console.log(`   DATABASE_URL="file:${existing.path}"`);
  process.exit(0);
} else {
  console.log('ℹ️  No existing SQLite database found');
  console.log('');
  console.log('💡 To create a new SQLite database:');
  console.log('   1. Set DATABASE_URL in .env file: DATABASE_URL="file:./data/zapeera.db"');
  console.log('   2. Update prisma/schema.prisma to use provider = "sqlite"');
  console.log('   3. Run: npm run db:push');
  process.exit(1);
}
