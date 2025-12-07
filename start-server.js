#!/usr/bin/env node
/**
 * Startup script that sets DATABASE_URL before starting the server
 * This ensures DATABASE_URL is available when Prisma's runtime module loads
 */

const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// Set DATABASE_URL to SQLite path
const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
const sqliteUrl = `file:${sqlitePath}`;

// Set DATABASE_URL in environment
process.env.DATABASE_URL = sqliteUrl;

console.log('[Startup] ✅ DATABASE_URL set to:', process.env.DATABASE_URL);

// Get the script to run (dev or start)
const script = process.argv[2] || 'start';
const isDev = script === 'dev';

// Determine the command to run
let command;
let args;

if (isDev) {
  // Development mode: use ts-node-dev
  command = 'npx';
  args = ['ts-node-dev', '--respawn', '--transpile-only', 'src/server.ts'];
} else {
  // Production mode: use compiled dist/server.js
  command = 'node';
  args = ['dist/server.js'];
}

// CRITICAL: Set DATABASE_URL in the current process environment
// This ensures it's available when Prisma's runtime module loads
process.env.DATABASE_URL = sqliteUrl;

// Also set it in the child process environment
// Spawn the process with DATABASE_URL set
const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: sqliteUrl
  },
  shell: true
});

child.on('error', (error) => {
  console.error('[Startup] ❌ Failed to start server:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
