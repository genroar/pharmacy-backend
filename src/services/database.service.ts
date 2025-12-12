/**
 * Database Service - Handles switching between SQLite (offline) and PostgreSQL (online)
 * Automatically detects connectivity and switches databases accordingly
 */

// CRITICAL: Import database initialization FIRST to ensure DATABASE_URL is set
import '../config/database.init';

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum DatabaseType {
  SQLITE = 'sqlite',
  POSTGRESQL = 'postgresql'
}

export enum ConnectionStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  CHECKING = 'checking',
  ERROR = 'error'
}

interface DatabaseConfig {
  type: DatabaseType;
  url: string;
  isConnected: boolean;
  lastChecked: Date | null;
}

class DatabaseService {
  private sqliteClient: PrismaClient | null = null;
  private postgresClient: PrismaClient | null = null;
  private currentClient: PrismaClient | null = null;
  private currentType: DatabaseType = DatabaseType.SQLITE;
  private connectionStatus: ConnectionStatus = ConnectionStatus.CHECKING;
  private sqliteConfig: DatabaseConfig;
  private postgresConfig: DatabaseConfig;
  private syncInProgress: boolean = false;
  private syncQueue: any[] = [];
  private lastLoggedStatus: ConnectionStatus | null = null; // Track last logged status
  private verboseLogging: boolean = true; // First check is always verbose

  constructor() {
    // SQLite + PostgreSQL Sync Strategy:
    // - Use SQLite for offline (primary, zero setup)
    // - Use PostgreSQL for online (centralized, sync from SQLite)

    // Initialize SQLite configuration (primary for offline)
    const sqlitePath = this.getSQLitePath();
    const sqliteUrl = `file:${sqlitePath}`;
    this.sqliteConfig = {
      type: DatabaseType.SQLITE,
      url: sqliteUrl,
      isConnected: false,
      lastChecked: null
    };

    // CRITICAL: ALWAYS set DATABASE_URL to SQLite URL because schema is SQLite
    // Prisma validates the schema against DATABASE_URL, so they must match
    // Even if .env has PostgreSQL URL, we override it here for SQLite schema
    // PostgreSQL URL is stored in REMOTE_DATABASE_URL for online sync
    process.env.DATABASE_URL = sqliteUrl;
    console.log('[Database] ✅ Set DATABASE_URL to SQLite URL (schema is SQLite):', sqliteUrl);

    // Initialize PostgreSQL configuration (for online sync)
    // Priority: 1. REMOTE_DATABASE_URL, 2. Check if original DATABASE_URL was PostgreSQL (before we overrode it)
    let postgresUrl = '';

    // First, check REMOTE_DATABASE_URL (set by database.init.ts if .env had PostgreSQL URL)
    if (process.env.REMOTE_DATABASE_URL && process.env.REMOTE_DATABASE_URL.startsWith('postgresql://')) {
      postgresUrl = process.env.REMOTE_DATABASE_URL;
      console.log('[Database] ✅ Using REMOTE_DATABASE_URL for PostgreSQL:', postgresUrl.replace(/:[^:@]+@/, ':****@'));
    } else {
      // Check if there's a PostgreSQL URL in environment (might be set before we override DATABASE_URL)
      // This handles the case where .env has PostgreSQL URL but REMOTE_DATABASE_URL wasn't set yet
      const originalDbUrl = process.env.DATABASE_URL;
      if (originalDbUrl && originalDbUrl.startsWith('postgresql://')) {
        // This shouldn't happen because we override DATABASE_URL above, but just in case
        postgresUrl = originalDbUrl;
        if (!process.env.REMOTE_DATABASE_URL) {
          process.env.REMOTE_DATABASE_URL = originalDbUrl;
        }
        console.log('[Database] ✅ Found PostgreSQL URL in DATABASE_URL, stored in REMOTE_DATABASE_URL');
      } else {
        console.log('[Database] ℹ️  No PostgreSQL URL configured in .env');
        console.log('[Database] 💡 System will automatically try common PostgreSQL URLs when checking connectivity');
        console.log('[Database] 💡 If PostgreSQL is available, system will automatically switch to online mode');
        console.log('[Database] 💡 To set a specific PostgreSQL URL, add to .env:');
        console.log('[Database]    REMOTE_DATABASE_URL="postgresql://user:pass@host:port/db"');
      }
    }

    this.postgresConfig = {
      type: DatabaseType.POSTGRESQL,
      url: postgresUrl,
      isConnected: false,
      lastChecked: null
    };

    if (postgresUrl) {
      console.log('[Database] PostgreSQL URL configured:', postgresUrl.replace(/:[^:@]+@/, ':****@'));
    }
  }

  /**
   * Get SQLite database path
   */
  private getSQLitePath(): string {
    // Check for custom SQLite path
    if (process.env.SQLITE_DATABASE_URL) {
      const customPath = process.env.SQLITE_DATABASE_URL.replace('file:', '');
      if (fs.existsSync(customPath) || this.ensureDirectoryExists(customPath)) {
        return customPath;
      }
    }

    // Default path in user's home directory
    const homeDir = os.homedir();
    const defaultPath = path.join(homeDir, '.zapeera', 'data', 'zapeera.db');
    this.ensureDirectoryExists(defaultPath);
    return defaultPath;
  }

  /**
   * Ensure directory exists for database file
   */
  private ensureDirectoryExists(filePath: string): boolean {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return true;
    } catch (error) {
      console.error('Failed to create directory:', error);
      return false;
    }
  }

  /**
   * Initialize SQLite client
   */
  private async initializeSQLite(): Promise<PrismaClient> {
    if (this.sqliteClient) {
      return this.sqliteClient;
    }

    const sqliteUrl = this.sqliteConfig.url;
    console.log('[Database] Initializing SQLite client:', sqliteUrl);

    // For SQLite, Prisma requires the schema to have provider = "sqlite"
    // Prisma validates the schema against DATABASE_URL BEFORE using datasources override
    // So we MUST set DATABASE_URL to file: URL when using SQLite schema

    const originalDatabaseUrl = process.env.DATABASE_URL;

    try {
      // IMPORTANT: For SQLite schema, we MUST set DATABASE_URL to file: URL
      // Prisma validates the schema against DATABASE_URL during client creation
      // If DATABASE_URL is not set or doesn't start with file:, validation will fail

      // CRITICAL: ALWAYS set DATABASE_URL to SQLite URL for schema validation
      // Prisma validates schema against DATABASE_URL BEFORE using datasources override
      // Even if it's already set, we force it to ensure it's correct
      process.env.DATABASE_URL = sqliteUrl;

      // Verify it was set correctly
      if (process.env.DATABASE_URL !== sqliteUrl) {
        console.error('[Database] ❌ ERROR: DATABASE_URL was not set correctly!');
        console.error('[Database] Expected:', sqliteUrl);
        console.error('[Database] Actual:', process.env.DATABASE_URL);
        // Force set it again
        process.env.DATABASE_URL = sqliteUrl;
      }

      console.log('[Database] ✅ Set DATABASE_URL to SQLite URL for schema validation:', process.env.DATABASE_URL);
      console.log('[Database] ✅ Verification: DATABASE_URL starts with file:', process.env.DATABASE_URL?.startsWith('file:'));

      // CRITICAL: Set DATABASE_URL one more time RIGHT BEFORE creating PrismaClient
      // This ensures it's definitely set when Prisma validates the schema
      process.env.DATABASE_URL = sqliteUrl;

      // Force set it multiple ways to ensure it persists
      Object.defineProperty(process.env, 'DATABASE_URL', {
        value: sqliteUrl,
        writable: true,
        enumerable: true,
        configurable: true
      });

      // Also set on global if available
      if (typeof global !== 'undefined' && global.process && global.process.env) {
        global.process.env.DATABASE_URL = sqliteUrl;
      }

      // Final verification - throw error if not set correctly
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
        const error = new Error(`DATABASE_URL is not set correctly before PrismaClient creation. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
        console.error('[Database] ❌ FATAL ERROR:', error.message);
        throw error;
      }

      console.log('[Database] 🔄 Final check before PrismaClient creation - DATABASE_URL:', process.env.DATABASE_URL);
      console.log('[Database] ✅ Verification passed - DATABASE_URL is correctly set to SQLite');

      // CRITICAL: Set DATABASE_URL one final time RIGHT before creating PrismaClient
      // Prisma's runtime module loads when PrismaClient is instantiated, so DATABASE_URL must be set
      process.env.DATABASE_URL = sqliteUrl;
      Object.defineProperty(process.env, 'DATABASE_URL', {
        value: sqliteUrl,
        writable: true,
        enumerable: true,
        configurable: true
      });
      if (typeof global !== 'undefined' && global.process && global.process.env) {
        global.process.env.DATABASE_URL = sqliteUrl;
      }

      // Verify one more time
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
        throw new Error(`DATABASE_URL not set correctly before PrismaClient creation: ${process.env.DATABASE_URL || 'undefined'}`);
      }

      // Create client with SQLite URL via datasources override
      // This ensures the client uses SQLite even if DATABASE_URL was PostgreSQL
      // BUT: Prisma validates schema against DATABASE_URL FIRST, so it must be set correctly
      this.sqliteClient = new PrismaClient({
        datasources: {
          db: {
            url: sqliteUrl
          }
        },
        log: ['error', 'warn']
      } as any);

      // Try to connect
      await this.sqliteClient.$connect();
      this.sqliteConfig.isConnected = true;
      this.sqliteConfig.lastChecked = new Date();
      console.log('[Database] ✅ SQLite connected');

      // Keep DATABASE_URL set to SQLite URL for Prisma validation
      // Don't restore original URL if we're using SQLite schema
      // This ensures all Prisma operations work correctly
    } catch (error: any) {
      // Restore original DATABASE_URL on error (if we changed it and it wasn't SQLite)
      if (originalDatabaseUrl && !originalDatabaseUrl.startsWith('file:')) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }

      // Check if error is due to missing DATABASE_URL
      if (error.message && error.message.includes('Environment variable not found: DATABASE_URL')) {
        console.error('[Database] ❌ DATABASE_URL environment variable not found!');
        console.error('[Database] ❌ This should not happen - database.init.ts should have set it.');
        console.error('[Database] ❌ Current DATABASE_URL:', process.env.DATABASE_URL || 'NOT SET');
        console.error('[Database] 💡 Attempting to fix by setting DATABASE_URL now...');

        // Try to fix it by setting DATABASE_URL
        process.env.DATABASE_URL = sqliteUrl;
        Object.defineProperty(process.env, 'DATABASE_URL', {
          value: sqliteUrl,
          writable: true,
          enumerable: true,
          configurable: true
        });

        console.error('[Database] ✅ Set DATABASE_URL to:', process.env.DATABASE_URL);
        console.error('[Database] 💡 Retrying PrismaClient creation...');

        // Retry creating the client
        try {
          this.sqliteClient = new PrismaClient({
            datasources: {
              db: {
                url: sqliteUrl
              }
            },
            log: ['error', 'warn']
          } as any);
          await this.sqliteClient.$connect();
          this.sqliteConfig.isConnected = true;
          this.sqliteConfig.lastChecked = new Date();
          console.log('[Database] ✅ SQLite connected after retry');
          return this.sqliteClient;
        } catch (retryError: any) {
          console.error('[Database] ❌ Retry also failed:', retryError.message);
          throw new Error(`Failed to initialize SQLite client. DATABASE_URL was not set. Please ensure database.init.ts runs before any Prisma imports. Error: ${retryError.message}`);
        }
      }

      // Check if error is due to schema/provider mismatch
      if (error.message && (
        error.message.includes('protocol') ||
        error.message.includes('postgresql://') ||
        error.message.includes('postgres://')
      )) {
        console.warn('[Database] ⚠️  Prisma schema mismatch detected.');
        console.warn('[Database] ⚠️  Current schema.prisma has provider = "postgresql"');
        console.warn('[Database] ⚠️  SQLite will not be available until schema is updated.');
        console.warn('[Database] ⚠️  To use SQLite: Run: npm run db:switch-sqlite && npm run db:generate');
        console.warn('[Database] ⚠️  For now, system will use PostgreSQL only.');

        // Don't throw - allow system to continue with PostgreSQL
        this.sqliteConfig.isConnected = false;
        throw new Error('SQLite requires schema.prisma to have provider = "sqlite". Run: npm run db:switch-sqlite');
      }

      console.error('[Database] ❌ SQLite connection failed:', error.message);
      this.sqliteConfig.isConnected = false;
      throw error;
    }

    return this.sqliteClient;
  }

  /**
   * Initialize PostgreSQL client
   */
  private async initializePostgreSQL(): Promise<PrismaClient> {
    if (this.postgresClient) {
      return this.postgresClient;
    }

    if (!this.postgresConfig.url || !this.postgresConfig.url.startsWith('postgresql://')) {
      throw new Error('PostgreSQL DATABASE_URL not configured');
    }

    console.log('[Database] Initializing PostgreSQL client');

    // Temporarily set DATABASE_URL to PostgreSQL URL for Prisma client creation
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = this.postgresConfig.url;

    try {
      this.postgresClient = new PrismaClient({
        datasources: {
          db: {
            url: this.postgresConfig.url
          }
        }
      });

      await this.postgresClient.$connect();
      this.postgresConfig.isConnected = true;
      this.postgresConfig.lastChecked = new Date();
      console.log('[Database] ✅ PostgreSQL connected');

      // Restore original DATABASE_URL
      if (originalDatabaseUrl && originalDatabaseUrl !== this.postgresConfig.url) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    } catch (error: any) {
      // Restore original DATABASE_URL on error
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      console.error('[Database] ❌ PostgreSQL connection failed:', error.message);
      this.postgresConfig.isConnected = false;
      throw error;
    }

    return this.postgresClient;
  }

  /**
   * Check if PostgreSQL is available (online)
   * Returns true if PostgreSQL is reachable and working
   */
  private async checkPostgreSQLConnection(): Promise<boolean> {
    try {
      if (!this.postgresConfig.url || !this.postgresConfig.url.startsWith('postgresql://')) {
        console.log('[Database] No PostgreSQL URL configured');
        return false;
      }

      // Check if it's a remote PostgreSQL (not localhost)
      const isRemote = this.isRemotePostgreSQL(this.postgresConfig.url);

      console.log(`[Database] 🔍 Testing PostgreSQL connection (${isRemote ? 'remote' : 'local'})...`);

      // Try to connect with timeout (works for both local and remote)
      const connectionPromise = this.testPostgreSQLConnection();
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          console.log('[Database] ⏱️  Connection test timed out after 5 seconds');
          resolve(false);
        }, 5000); // 5 second timeout
      });

      const result = await Promise.race([connectionPromise, timeoutPromise]);

      if (result) {
        this.postgresConfig.isConnected = true;
        this.postgresConfig.lastChecked = new Date();
        if (isRemote) {
          console.log('[Database] ✅ Remote PostgreSQL connection verified - ONLINE');
        } else {
          console.log('[Database] ✅ Local PostgreSQL connection verified - ONLINE');
        }
      } else {
        this.postgresConfig.isConnected = false;
        console.log('[Database] ⚠️  PostgreSQL connection failed - OFFLINE');
      }

      return result;
    } catch (error: any) {
      this.postgresConfig.isConnected = false;
      const errorMsg = error.message || 'Unknown error';
      console.log('[Database] ❌ PostgreSQL connection check error:', errorMsg);

      // Log specific error details for debugging
      if (errorMsg.includes('timeout')) {
        console.log('[Database] 💡 Connection timeout - check network or server');
      } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
        console.log('[Database] 💡 DNS resolution failed - check hostname');
      } else if (errorMsg.includes('ECONNREFUSED')) {
        console.log('[Database] 💡 Connection refused - check if server is running');
      }

      return false;
    }
  }

  /**
   * Test PostgreSQL connection with proper error handling
   * Uses direct pg library to bypass Prisma schema validation
   */
  private async testPostgreSQLConnection(): Promise<boolean> {
    try {
      // Check if PostgreSQL URL is configured
      if (!this.postgresConfig.url || !this.postgresConfig.url.startsWith('postgresql://')) {
        console.log('[Database] ℹ️  No PostgreSQL URL configured - skipping connection test');
        return false;
      }

      console.log('[Database] 🔌 Attempting to connect to PostgreSQL...');
      console.log('[Database] 🔍 PostgreSQL URL:', this.postgresConfig.url.replace(/:[^:@]+@/, ':****@'));

      // Use direct PostgreSQL connection (bypasses Prisma schema validation)
      // This is necessary because Prisma schema is SQLite, but we want to test PostgreSQL
      // Direct pg library connection works regardless of Prisma schema
      return await this.testPostgreSQLDirectConnection();
    } catch (error: any) {

      // Log the actual error for debugging
      console.error('[Database] ❌ PostgreSQL connection test error:', error.message);
      console.error('[Database] ❌ Error code:', error.code || 'N/A');
      if (error.meta) {
        console.error('[Database] ❌ Error meta:', JSON.stringify(error.meta));
      }

      // Check for schema mismatch errors (SQLite schema but PostgreSQL URL)
      const errorMessage = error.message?.toLowerCase() || '';
      const errorCode = error.code?.toLowerCase() || '';

      if (
        errorMessage.includes('protocol') ||
        errorMessage.includes('file:') ||
        errorMessage.includes('the url must start with the protocol')
      ) {
        console.log('[Database] ℹ️  Schema mismatch detected - SQLite schema cannot test PostgreSQL');
        console.log('[Database] 💡 This is expected when using SQLite schema with PostgreSQL URL via datasources override');
        console.log('[Database] 💡 The connection should still work - checking if client was created...');
        // Don't return false immediately - try to use the client if it was created
      }

      // Check for network-related errors
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('network') ||
        errorMessage.includes('getaddrinfo') ||
        errorMessage.includes('connection refused') ||
        errorCode === 'econnrefused' ||
        errorCode === 'enotfound' ||
        errorCode === 'etimedout'
      ) {
        console.log('[Database] 🌐 Network error detected:', errorMessage);
        return false;
      }

      // For other errors, log them but still return false
      console.log('[Database] ❌ Connection test failed:', errorMessage);
      return false;
    }
  }

  /**
   * Test PostgreSQL connection using direct pg library (bypasses Prisma schema validation)
   */
  private async testPostgreSQLDirectConnection(): Promise<boolean> {
    try {
      // Use pg library directly to test connection without Prisma schema validation
      const { Client } = require('pg');
      const pgClient = new Client({
        connectionString: this.postgresConfig.url
      });

      // Try to connect with timeout
      const connectPromise = pgClient.connect();
      const connectTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 4000)
      );

      await Promise.race([connectPromise, connectTimeout]);
      console.log('[Database] ✅ Connected to PostgreSQL via direct connection');

      // Test query
      const queryPromise = pgClient.query('SELECT 1 as test');
      const queryTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), 2000)
      );

      await Promise.race([queryPromise, queryTimeout]);
      console.log('[Database] ✅ Query test successful via direct connection');

      // Close connection
      await pgClient.end();

      // Connection successful via direct pg client!
      // Note: We can't use Prisma with SQLite schema for PostgreSQL operations
      // But we know PostgreSQL is available, so we'll mark it as available
      // The system will use SQLite for Prisma operations, but PostgreSQL is reachable
      this.postgresConfig.isConnected = true;
      this.postgresConfig.lastChecked = new Date();

      console.log('[Database] ✅ PostgreSQL is available and reachable');
      console.log('[Database] 💡 Note: Prisma schema is SQLite, so Prisma operations will use SQLite');
      console.log('[Database] 💡 PostgreSQL connection verified for sync operations');

      return true;
    } catch (error: any) {
      console.log('[Database] ❌ Direct PostgreSQL connection failed:', error.message);
      return false;
    }
  }

  /**
   * Try common PostgreSQL URLs automatically
   * Returns true if any connection succeeds
   */
  private async tryCommonPostgreSQLUrls(): Promise<boolean> {
    // Get current system user (for macOS Homebrew PostgreSQL)
    const os = require('os');
    const currentUser = os.userInfo().username;

    // Common PostgreSQL URLs to try (in order of preference)
    const commonUrls = [
      // Try with current system user (macOS Homebrew default)
      `postgresql://${currentUser}@localhost:5432/medibill_pulse`,
      `postgresql://${currentUser}@localhost:5432/postgres`,
      // Local PostgreSQL with common defaults
      'postgresql://postgres:postgres@localhost:5432/medibill_pulse',
      'postgresql://postgres:postgres@localhost:5432/postgres',
      'postgresql://postgres@localhost:5432/medibill_pulse',
      'postgresql://postgres@localhost:5432/postgres',
      // With different common passwords
      'postgresql://postgres:password@localhost:5432/medibill_pulse',
      'postgresql://postgres:admin@localhost:5432/medibill_pulse',
    ];

    console.log('[Database] 🔍 Trying common PostgreSQL URLs automatically...');

    for (const url of commonUrls) {
      try {
        console.log(`[Database] 🔍 Trying: ${url.replace(/:[^:@]+@/, ':****@')}`);

        // Temporarily set postgresConfig.url to test
        const originalUrl = this.postgresConfig.url;
        this.postgresConfig.url = url;

        // Use direct PostgreSQL connection (bypasses Prisma schema validation)
        // This is more reliable when schema is SQLite
        const { Client } = require('pg');
        const pgClient = new Client({
          connectionString: url
        });

        // Try to connect with 2 second timeout
        const connectPromise = pgClient.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 2000)
        );

        try {
          await Promise.race([connectPromise, timeoutPromise]);

          // Test query
          await pgClient.query('SELECT 1');

          // Connection successful!
          await pgClient.end();

          // Store this URL for future use
          this.postgresConfig.url = url;
          if (!process.env.REMOTE_DATABASE_URL) {
            process.env.REMOTE_DATABASE_URL = url;
          }

          // Mark PostgreSQL as available
          // Note: Prisma schema is SQLite, so Prisma operations will use SQLite
          // But PostgreSQL is available for sync operations via direct pg library
          this.postgresConfig.isConnected = true;
          this.postgresConfig.lastChecked = new Date();

          console.log('[Database] ✅ PostgreSQL is available and reachable');
          console.log('[Database] 💡 Note: Prisma schema is SQLite, so Prisma operations will use SQLite');
          console.log('[Database] 💡 PostgreSQL connection verified - will be used for sync operations');

          console.log(`[Database] ✅ Successfully connected to PostgreSQL: ${url.replace(/:[^:@]+@/, ':****@')}`);
          console.log('[Database] ✅ PostgreSQL URL stored for future use');

          return true;
        } catch (error: any) {
          await pgClient.end().catch(() => {});
          // Continue to next URL
        }
      } catch (error: any) {
        // Continue to next URL
      }
    }

    // Restore original URL
    if (!this.postgresConfig.url) {
      this.postgresConfig.url = '';
    }

    console.log('[Database] ❌ None of the common PostgreSQL URLs worked');
    return false;
  }

  /**
   * Check internet connectivity
   */
  private async checkInternetConnectivity(): Promise<boolean> {
    try {
      const https = require('https');
      const http = require('http');

      const testUrls = [
        'https://www.google.com',
        'https://www.cloudflare.com',
        'https://1.1.1.1'
      ];

      for (const url of testUrls) {
        try {
          const isAvailable = await new Promise<boolean>((resolve) => {
            const client = url.startsWith('https') ? https : http;
            const request = client.get(url, { timeout: 3000 }, (response: any) => {
              resolve(response.statusCode !== undefined && response.statusCode < 500);
            });

            request.on('timeout', () => {
              request.destroy();
              resolve(false);
            });

            request.on('error', () => {
              resolve(false);
            });
          });

          if (isAvailable) {
            console.log(`[Database] ✅ Internet connectivity verified via ${url}`);
            return true;
          }
        } catch (error) {
          // Continue to next URL
        }
      }

      console.log('[Database] ⚠️  Internet connectivity check failed - no internet access');
      return false;
    } catch (error: any) {
      console.log('[Database] ⚠️  Internet connectivity check error:', error.message);
      return false;
    }
  }

  /**
   * Check if PostgreSQL URL is remote (not localhost)
   */
  private isRemotePostgreSQL(url: string): boolean {
    if (!url) return false;

    // Check if it's localhost or 127.0.0.1
    const localhostPatterns = [
      /@localhost[:/]/i,
      /@127\.0\.0\.1[:/]/i,
      /@0\.0\.0\.0[:/]/i,
      /@::1[:/]/i
    ];

    for (const pattern of localhostPatterns) {
      if (pattern.test(url)) {
        return false; // It's localhost
      }
    }

    // If it has @ and doesn't match localhost patterns, it's remote
    return url.includes('@');
  }

  /**
   * Check if we should use SQLite based on DATABASE_URL
   */
  private shouldUseSQLite(): boolean {
    const dbUrl = process.env.DATABASE_URL || '';
    return dbUrl.startsWith('file:');
  }

  /**
   * Check connectivity and switch database accordingly
   * Strategy: SQLite + PostgreSQL Sync
   * - Use SQLite for offline (primary, zero setup)
   * - Use PostgreSQL for online (centralized, sync from SQLite)
   */
  async checkConnectivity(): Promise<ConnectionStatus> {
    this.connectionStatus = ConnectionStatus.CHECKING;

    // Only log verbose on first check or status change
    const shouldLog = this.verboseLogging;

    try {
      // Strategy: SQLite for offline, PostgreSQL for online sync
      // Always initialize SQLite first (works offline, zero setup)
      let sqliteReady = false;
      try {
        await this.initializeSQLite();
        sqliteReady = true;
        if (shouldLog) console.log('[Database] ✅ SQLite ready (offline database)');
      } catch (sqliteError: any) {
        console.warn('[Database] ⚠️  SQLite initialization failed:', sqliteError.message);
        // Continue - we'll try PostgreSQL
      }

      // Check if PostgreSQL is available (for online sync)
      // Works for both local and remote PostgreSQL
      let isPostgreSQLAvailable = false;

      if (this.postgresConfig.url && this.postgresConfig.url.startsWith('postgresql://')) {
        const isRemote = this.isRemotePostgreSQL(this.postgresConfig.url);
        if (shouldLog) {
          console.log(`[Database] 🔍 Checking PostgreSQL connectivity (${isRemote ? 'remote' : 'local'})...`);
          console.log(`[Database] 🔍 PostgreSQL URL configured: ${this.postgresConfig.url.replace(/:[^:@]+@/, ':****@')}`);
        }
        isPostgreSQLAvailable = await this.checkPostgreSQLConnection();
        if (shouldLog) console.log(`[Database] 🔍 PostgreSQL connection result: ${isPostgreSQLAvailable ? '✅ Available' : '❌ Unavailable'}`);
      } else {
        // No PostgreSQL URL configured - try common default URLs automatically
        if (shouldLog) console.log('[Database] ℹ️  No PostgreSQL URL configured - trying common default URLs...');
        isPostgreSQLAvailable = await this.tryCommonPostgreSQLUrls();

        if (!isPostgreSQLAvailable && shouldLog) {
          console.log('[Database] ℹ️  No PostgreSQL connection available - using offline mode (SQLite only)');
          console.log('[Database] 💡 To set a specific PostgreSQL URL, add to .env:');
          console.log('[Database]    REMOTE_DATABASE_URL="postgresql://user:pass@host:port/db"');
        }
      }

      // Check internet connectivity if PostgreSQL is localhost
      // For localhost PostgreSQL, we need internet for remote sync capabilities
      let internetAvailable = true; // Default to true for remote PostgreSQL
      if (isPostgreSQLAvailable && this.postgresConfig.url) {
        const isRemote = this.isRemotePostgreSQL(this.postgresConfig.url);
        if (!isRemote) {
          // PostgreSQL is localhost - check internet connectivity
          if (shouldLog) console.log('[Database] 🔍 PostgreSQL is localhost - checking internet connectivity...');
          internetAvailable = await this.checkInternetConnectivity();
          if (!internetAvailable) {
            if (shouldLog) {
              console.log('[Database] ⚠️  Internet not available - treating as offline mode');
              console.log('[Database] 💡 Localhost PostgreSQL available but no internet - using offline mode');
            }
            isPostgreSQLAvailable = false; // Treat as offline if no internet
          }
        }
      }

      if (isPostgreSQLAvailable && this.postgresConfig.url && internetAvailable) {
        // PostgreSQL is available (local or remote) AND internet is available - we're online
        // Note: Prisma schema is SQLite, so Prisma operations will use SQLite
        // But PostgreSQL is available for sync operations via direct pg library

        // Before switching to online mode, sync SQLite → PostgreSQL (if we were using SQLite)
        if (this.currentType === DatabaseType.SQLITE && this.sqliteClient) {
          if (shouldLog) console.log('[Database] 🔄 PostgreSQL available, syncing SQLite → PostgreSQL...');
          // Trigger automatic sync (will be handled by sync service in server.ts)
          // This ensures all offline data is synced to PostgreSQL when going online
          const { getSyncService } = require('./sync.service');
          const syncService = getSyncService();
          syncService.syncToPostgreSQL().catch((err: any) => {
            console.error('[Database] Auto-sync to PostgreSQL failed:', err.message);
          });
        }

        // Mark as ONLINE (PostgreSQL is available AND internet is available)
        // But continue using SQLite for Prisma operations (schema is SQLite)
        this.connectionStatus = ConnectionStatus.ONLINE;
        // Keep using SQLite for Prisma operations since schema is SQLite
        // PostgreSQL will be used for sync operations via direct pg library
        this.currentType = DatabaseType.SQLITE; // Keep SQLite for Prisma
        this.currentClient = this.sqliteClient; // Keep SQLite client for Prisma

        if (shouldLog) {
          const isRemote = this.isRemotePostgreSQL(this.postgresConfig.url);
          console.log(`[Database] 🌐 Online mode - PostgreSQL available (${isRemote ? 'remote' : 'local'})`);
          console.log(`[Database] 💡 Prisma operations use SQLite (schema is SQLite)`);
          console.log(`[Database] 💡 PostgreSQL used for sync operations via direct connection`);
        }
      } else {
        // PostgreSQL not available - we're going offline
        // Before switching to SQLite, sync PostgreSQL → SQLite (if we were using PostgreSQL)
        // This ensures SQLite has the latest data
        if (this.currentType === DatabaseType.POSTGRESQL && this.postgresClient && sqliteReady) {
          if (shouldLog) console.log('[Database] 🔄 Going offline, syncing PostgreSQL → SQLite to keep data up-to-date...');
          // Trigger automatic sync (will be handled by sync service in server.ts)
          // This ensures all online data is synced to SQLite when going offline
          const { getSyncService } = require('./sync.service');
          const syncService = getSyncService();
          syncService.syncToSQLite().catch((err: any) => {
            console.error('[Database] Auto-sync to SQLite failed:', err.message);
          });
        }

        // Use SQLite as primary database
        if (sqliteReady) {
          this.connectionStatus = ConnectionStatus.OFFLINE;
          this.currentType = DatabaseType.SQLITE;
          this.currentClient = this.sqliteClient;
          if (shouldLog) console.log('[Database] 📴 Offline mode - Using SQLite (PostgreSQL unavailable)');
        } else {
          // Neither database available
          this.connectionStatus = ConnectionStatus.ERROR;
          console.error('[Database] ❌ Both SQLite and PostgreSQL unavailable');
          // Try to use whatever we have
          if (this.sqliteClient) {
            this.currentType = DatabaseType.SQLITE;
            this.currentClient = this.sqliteClient;
          } else if (this.postgresClient) {
            this.currentType = DatabaseType.POSTGRESQL;
            this.currentClient = this.postgresClient;
          }
        }
      }
    } catch (error: any) {
      console.error('[Database] Connectivity check failed:', error.message);
      this.connectionStatus = ConnectionStatus.ERROR;
      // Last resort: try to use whatever client we have
      if (this.sqliteClient) {
        this.currentType = DatabaseType.SQLITE;
        this.currentClient = this.sqliteClient;
      } else if (this.postgresClient) {
        this.currentType = DatabaseType.POSTGRESQL;
        this.currentClient = this.postgresClient;
      }
    }

    // After first check, only log on status change
    if (this.lastLoggedStatus !== this.connectionStatus) {
      this.lastLoggedStatus = this.connectionStatus;
      this.verboseLogging = true; // Enable logging for next status change
    } else {
      this.verboseLogging = false; // Disable verbose logging if status unchanged
    }

    return this.connectionStatus;
  }

  /**
   * Get current database client
   */
  async getClient(): Promise<PrismaClient> {
    // CRITICAL: Ensure DATABASE_URL is set before returning client
    // Prisma validates schema when executing queries, so DATABASE_URL must be set
    const sqlitePath = this.getSQLitePath();
    const sqliteUrl = `file:${sqlitePath}`;

    // Force set DATABASE_URL right before returning client
    process.env.DATABASE_URL = sqliteUrl;
    Object.defineProperty(process.env, 'DATABASE_URL', {
      value: sqliteUrl,
      writable: true,
      enumerable: true,
      configurable: true
    });

    if (typeof global !== 'undefined' && global.process && global.process.env) {
      global.process.env.DATABASE_URL = sqliteUrl;
    }

    // Verify it was set correctly
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
      const error = new Error(`DATABASE_URL is not set correctly before returning client. Expected file: URL, got: ${process.env.DATABASE_URL || 'undefined'}`);
      console.error('[Database] ❌ FATAL ERROR:', error.message);
      throw error;
    }

    // Auto-check connectivity if not initialized
    if (!this.currentClient) {
      await this.checkConnectivity();
    }

    if (!this.currentClient) {
      throw new Error('No database client available');
    }

    // Final check before returning - ensure DATABASE_URL is still set
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
      console.warn('[Database] ⚠️  DATABASE_URL was reset! Setting it again...');
      process.env.DATABASE_URL = sqliteUrl;
    }

    return this.currentClient;
  }

  /**
   * Get current database type
   */
  getCurrentType(): DatabaseType {
    return this.currentType;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get SQLite client (for sync operations)
   */
  async getSQLiteClient(): Promise<PrismaClient> {
    return await this.initializeSQLite();
  }

  /**
   * Get PostgreSQL client (for sync operations)
   * Note: Since Prisma schema is SQLite, we can't use PrismaClient for PostgreSQL
   * Returns a direct pg Client instead for raw SQL operations
   */
  async getPostgreSQLClient(): Promise<any | null> {
    // Check if PostgreSQL is available
    if (!this.postgresConfig.url || !this.postgresConfig.url.startsWith('postgresql://')) {
      return null;
    }

    // Since Prisma schema is SQLite, we can't use PrismaClient for PostgreSQL
    // Return a direct pg Client for raw SQL operations
    if (this.postgresConfig.isConnected) {
      const { Client } = require('pg');
      return new Client({
        connectionString: this.postgresConfig.url
      });
    }

    // Try to verify connection first
    const isAvailable = await this.checkPostgreSQLConnection();
    if (isAvailable) {
      const { Client } = require('pg');
      return new Client({
        connectionString: this.postgresConfig.url
      });
    }

    return null;
  }

  /**
   * Get PostgreSQL connection string (for sync operations)
   */
  getPostgreSQLUrl(): string | null {
    if (this.postgresConfig.url && this.postgresConfig.url.startsWith('postgresql://')) {
      return this.postgresConfig.url;
    }
    return null;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.connectionStatus === ConnectionStatus.ONLINE;
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.connectionStatus === ConnectionStatus.OFFLINE;
  }

  /**
   * Start periodic connectivity checks
   */
  startConnectivityMonitoring(intervalMs: number = 30000): void {
    setInterval(async () => {
      const previousStatus = this.connectionStatus;
      await this.checkConnectivity();

      // If status changed, trigger sync
      if (previousStatus !== this.connectionStatus) {
        console.log(`[Database] Status changed: ${previousStatus} → ${this.connectionStatus}`);
        // Trigger sync if going online
        if (this.connectionStatus === ConnectionStatus.ONLINE) {
          // Sync will be handled by sync service
        }
      }
    }, intervalMs);
  }

  /**
   * Disconnect all clients
   */
  async disconnect(): Promise<void> {
    try {
      if (this.sqliteClient) {
        await this.sqliteClient.$disconnect();
        this.sqliteClient = null;
      }
      if (this.postgresClient) {
        await this.postgresClient.$disconnect();
        this.postgresClient = null;
      }
      this.currentClient = null;
    } catch (error) {
      console.error('[Database] Error disconnecting:', error);
    }
  }

  /**
   * Get database status information
   */
  getStatus() {
    return {
      connectionStatus: this.connectionStatus,
      currentType: this.currentType,
      sqlite: {
        connected: this.sqliteConfig.isConnected,
        url: this.sqliteConfig.url,
        lastChecked: this.sqliteConfig.lastChecked
      },
      postgresql: {
        connected: this.postgresConfig.isConnected,
        url: this.postgresConfig.url ? 'SET' : 'NOT SET',
        lastChecked: this.postgresConfig.lastChecked
      }
    };
  }
}

// Singleton instance
let databaseServiceInstance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}

export default getDatabaseService;
