/**
 * CRITICAL: This file MUST be CommonJS (not ES6) to ensure it runs synchronously
 * before any ES6 imports execute. ES6 imports are hoisted, so we need CommonJS
 * to set DATABASE_URL before Prisma Client is imported.
 *
 * This file is imported FIRST in server.ts to ensure DATABASE_URL is set
 * before any Prisma code runs.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Set DATABASE_URL IMMEDIATELY - this must happen before any Prisma imports
const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
const sqliteDir = path.dirname(sqlitePath);

// Ensure directory exists
if (!fs.existsSync(sqliteDir)) {
  try {
    fs.mkdirSync(sqliteDir, { recursive: true });
  } catch (err) {
    // Ignore errors
  }
}

const sqliteUrl = `file:${sqlitePath}`;

// CRITICAL: Set DATABASE_URL immediately
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = sqliteUrl;

  // Force set it using defineProperty
  try {
    Object.defineProperty(process.env, 'DATABASE_URL', {
      value: sqliteUrl,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } catch (e) {
    // If defineProperty fails, just set it normally
    process.env.DATABASE_URL = sqliteUrl;
  }

  // Also set on global if available
  if (typeof global !== 'undefined' && global.process && global.process.env) {
    global.process.env.DATABASE_URL = sqliteUrl;
  }

  console.log('[DB URL Init] ✅ DATABASE_URL set to:', process.env.DATABASE_URL);
} else {
  console.log('[DB URL Init] ✅ DATABASE_URL already set:', process.env.DATABASE_URL);
}

// Verify it's set
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  const error = new Error(`DATABASE_URL is not set correctly. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
  console.error('[DB URL Init] ❌ FATAL ERROR:', error.message);
  throw error;
}

module.exports = { DATABASE_URL: process.env.DATABASE_URL };













