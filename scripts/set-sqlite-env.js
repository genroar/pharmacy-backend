/**
 * Script to set DATABASE_URL to SQLite in .env file
 * Run this before starting the server: node scripts/set-sqlite-env.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const envPath = path.join(__dirname, '..', '.env');
const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
const sqliteUrl = `file:${sqlitePath}`;

// Read .env file
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

// Replace or add DATABASE_URL
if (envContent.includes('DATABASE_URL=')) {
  // Replace existing DATABASE_URL
  envContent = envContent.replace(
    /DATABASE_URL=.*/g,
    `DATABASE_URL="${sqliteUrl}"`
  );
  console.log('✅ Updated DATABASE_URL in .env file');
} else {
  // Add DATABASE_URL at the beginning
  envContent = `DATABASE_URL="${sqliteUrl}"\n${envContent}`;
  console.log('✅ Added DATABASE_URL to .env file');
}

// Write back to .env
fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`✅ DATABASE_URL set to: ${sqliteUrl}`);
