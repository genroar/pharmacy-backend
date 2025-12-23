/**
 * Database Service - Handles SQLite (offline) with PostgreSQL sync
 *
 * DUAL MODE:
 * - Electron: SQLite primary, sync to PostgreSQL when online
 * - Website: Can use PostgreSQL directly with USE_POSTGRESQL=true
 */

import '../config/database.init';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';

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

class DatabaseService {
  private client: PrismaClient | null = null;
  private pgClient: Client | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.CHECKING;
  private isPostgreSQLMode: boolean;
  private postgresUrl: string;
  private lastSyncTime: Date | null = null;

  constructor() {
    this.isPostgreSQLMode = process.env.USE_POSTGRESQL === 'true';
    this.postgresUrl = process.env.REMOTE_DATABASE_URL ||
                       'postgresql://poszap_user:Ezify143@31.97.72.136:5432/poszap_db?schema=public';

    if (this.isPostgreSQLMode) {
      console.log('[Database] 🌐 Website Mode - PostgreSQL direct');
    } else {
      console.log('[Database] 💻 Electron Mode - SQLite with PostgreSQL sync');
    }
  }

  /**
   * Initialize Prisma client (SQLite or PostgreSQL based on mode)
   */
  async initialize(): Promise<void> {
    try {
      console.log('[Database] 🔌 Connecting to database...');

      this.client = new PrismaClient();
      await this.client.$connect();

      this.connectionStatus = ConnectionStatus.ONLINE;
      console.log('[Database] ✅ Connected to', this.isPostgreSQLMode ? 'PostgreSQL' : 'SQLite');

      // Check PostgreSQL connectivity for sync (only in Electron mode)
      if (!this.isPostgreSQLMode) {
        await this.checkPostgreSQLConnectivity();
      }
    } catch (error: any) {
      this.connectionStatus = ConnectionStatus.ERROR;
      console.error('[Database] ❌ Failed to connect:', error.message);
      throw error;
    }
  }

  /**
   * Check if PostgreSQL is available for sync
   * This is critical for determining if we should write to PostgreSQL or SQLite
   */
  async checkPostgreSQLConnectivity(): Promise<boolean> {
    try {
      const pgClient = new Client({
        connectionString: this.postgresUrl,
        connectionTimeoutMillis: 3000 // 3 second timeout for faster detection
      });
      await pgClient.connect();
      await pgClient.query('SELECT 1');
      await pgClient.end();
      return true;
    } catch (error: any) {
      // Silent fail - don't log every check to reduce noise
      return false;
    }
  }

  /**
   * Check if PostgreSQL is available (with logging)
   * Use this for important checks that need logging
   */
  async checkPostgreSQLConnectivityWithLog(): Promise<boolean> {
    const available = await this.checkPostgreSQLConnectivity();
    if (available) {
      console.log('[Database] ✅ PostgreSQL available for sync');
    } else {
      console.log('[Database] ⚠️ PostgreSQL not available - using SQLite only');
    }
    return available;
  }

  /**
   * Get Prisma client
   */
  async getClient(): Promise<PrismaClient> {
    if (!this.client) {
      await this.initialize();
    }
    return this.client!;
  }

  /**
   * Get current database type
   */
  getCurrentType(): DatabaseType {
    return this.isPostgreSQLMode ? DatabaseType.POSTGRESQL : DatabaseType.SQLITE;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if online (database connected)
   */
  isOnline(): boolean {
    return this.connectionStatus === ConnectionStatus.ONLINE;
  }

  /**
   * Check if offline
   */
  isOffline(): boolean {
    return this.connectionStatus !== ConnectionStatus.ONLINE;
  }

  /**
   * Get database status for health checks
   */
  getStatus(): {
    currentType: DatabaseType;
    connectionStatus: ConnectionStatus;
    sqlite: { url: string | null; isConnected: boolean; connected: boolean };
    postgres: { url: string; isConnected: boolean; connected: boolean };
    postgresql: { url: string; isConnected: boolean; connected: boolean };
    syncEnabled: boolean;
    lastSync: Date | null;
  } {
    const isConnected = this.connectionStatus === ConnectionStatus.ONLINE;
    const sqliteUrl = process.env.DATABASE_URL?.startsWith('file:') ? process.env.DATABASE_URL : null;
    const postgresInfo = {
      url: this.postgresUrl.replace(/:[^:@]+@/, ':****@'),
      isConnected: this.isPostgreSQLMode ? isConnected : false,
      connected: this.isPostgreSQLMode ? isConnected : false
    };

    return {
      currentType: this.getCurrentType(),
      connectionStatus: this.connectionStatus,
      sqlite: {
        url: sqliteUrl,
        isConnected: !this.isPostgreSQLMode && isConnected,
        connected: !this.isPostgreSQLMode && isConnected
      },
      postgres: postgresInfo,
      postgresql: postgresInfo,
      syncEnabled: !this.isPostgreSQLMode,
      lastSync: this.lastSyncTime
    };
  }

  /**
   * Check connectivity
   * In Electron mode: Checks both SQLite (local) and PostgreSQL (remote) connectivity
   * Returns ONLINE only if local database is connected
   * PostgreSQL connectivity is checked separately for sync purposes
   */
  async checkConnectivity(): Promise<ConnectionStatus> {
    try {
      // Always check local database (SQLite in Electron mode)
      if (!this.client) {
        this.client = new PrismaClient();
      }
      await this.client.$queryRaw`SELECT 1`;

      // In Electron mode, also check PostgreSQL availability for sync
      if (!this.isPostgreSQLMode) {
        const pgAvailable = await this.checkPostgreSQLConnectivity();
        if (pgAvailable) {
          this.connectionStatus = ConnectionStatus.ONLINE;
          console.log('[Database] ✅ Local DB connected, PostgreSQL available for sync');
        } else {
          this.connectionStatus = ConnectionStatus.ONLINE; // Local DB is still online
          console.log('[Database] ✅ Local DB connected, PostgreSQL offline - using SQLite only');
        }
      } else {
        this.connectionStatus = ConnectionStatus.ONLINE;
      }

      return this.connectionStatus;
    } catch (error: any) {
      console.error('[Database] Connectivity check failed:', error.message);
      this.connectionStatus = ConnectionStatus.ERROR;
      return ConnectionStatus.ERROR;
    }
  }

  /**
   * Start connectivity monitoring
   */
  startConnectivityMonitoring(intervalMs: number = 60000): void {
    console.log('[Database] Starting connectivity monitoring');
    setInterval(async () => {
      try {
        await this.checkConnectivity();

        // If in Electron mode and online, try to sync
        if (!this.isPostgreSQLMode && this.connectionStatus === ConnectionStatus.ONLINE) {
          const pgAvailable = await this.checkPostgreSQLConnectivity();
          if (pgAvailable) {
            console.log('[Database] 🔄 PostgreSQL available, ready for sync');
          }
        }
      } catch (e) {
        // Ignore monitoring errors
      }
    }, intervalMs);
  }

  /**
   * Force reconnect
   */
  async forceReconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.$disconnect();
      } catch (e) {}
      this.client = null;
    }
    await this.initialize();
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = null;
      this.connectionStatus = ConnectionStatus.OFFLINE;
      console.log('[Database] 🔌 Disconnected');
    }
  }

  /**
   * Get PostgreSQL client for direct operations (sync)
   */
  async getPostgreSQLClient(): Promise<PrismaClient | null> {
    if (this.isPostgreSQLMode) {
      return this.client;
    }

    // For Electron mode, return null (use raw pg client for sync)
    return null;
  }

  /**
   * Get raw PostgreSQL client for sync operations
   */
  async getRawPostgreSQLClient(): Promise<Client | null> {
    try {
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();
      return client;
    } catch (error: any) {
      console.log('[Database] Could not connect to PostgreSQL:', error.message);
      return null;
    }
  }

  // Compatibility methods
  getSQLiteClient(): PrismaClient | null {
    return this.isPostgreSQLMode ? null : this.client;
  }

  getPostgresClient(): PrismaClient | null {
    return this.isPostgreSQLMode ? this.client : null;
  }

  /**
   * Get PostgreSQL URL for sync operations
   */
  getPostgreSQLUrl(): string {
    return this.postgresUrl;
  }

  async syncNow(): Promise<void> {
    if (this.isPostgreSQLMode) {
      console.log('[Database] ℹ️ Sync not needed - using PostgreSQL directly');
      return;
    }
    console.log('[Database] 🔄 Manual sync requested');
    // Trigger sync through sync service
  }

  async switchToOnline(): Promise<void> {
    console.log('[Database] ℹ️ Mode switching not supported at runtime');
  }

  async switchToOffline(): Promise<void> {
    console.log('[Database] ℹ️ Mode switching not supported at runtime');
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

export async function initializeDatabaseService(): Promise<DatabaseService> {
  const service = getDatabaseService();
  await service.initialize();
  return service;
}
