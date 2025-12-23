/**
 * Unified Database Service - Automatic PostgreSQL/SQLite switching
 * Provides a unified interface that automatically uses the correct database
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseService, DatabaseType } from './database.service';
import { getConnectivityService, ConnectivityStatus } from './connectivity.service';
import { getSyncService } from './sync.service';

export interface QueryOptions {
  useTransaction?: boolean;
  retryOnFail?: boolean;
  maxRetries?: number;
}

class UnifiedDatabaseService {
  private previousStatus: ConnectivityStatus | null = null;
  private syncInProgress: boolean = false;

  constructor() {
    // Listen for connectivity changes
    const connectivityService = getConnectivityService();
    connectivityService.onStatusChange((status) => {
      this.handleConnectivityChange(status);
    });
  }

  /**
   * Handle connectivity status changes
   */
  private async handleConnectivityChange(newStatus: ConnectivityStatus): Promise<void> {
    if (this.previousStatus === newStatus) {
      return; // No change
    }

    const dbService = getDatabaseService();
    const syncService = getSyncService();

    if (this.previousStatus === ConnectivityStatus.OFFLINE &&
        newStatus === ConnectivityStatus.ONLINE) {
      // Going online: Sync SQLite → PostgreSQL
      console.log('[UnifiedDB] 🔄 Going online - syncing SQLite → PostgreSQL...');

      if (!this.syncInProgress) {
        this.syncInProgress = true;
        try {
          await syncService.syncToPostgreSQL();
          console.log('[UnifiedDB] ✅ Sync to PostgreSQL completed');
        } catch (error: any) {
          console.error('[UnifiedDB] ❌ Sync to PostgreSQL failed:', error.message);
        } finally {
          this.syncInProgress = false;
        }
      }
    } else if (this.previousStatus === ConnectivityStatus.ONLINE &&
               newStatus === ConnectivityStatus.OFFLINE) {
      // Going offline: Sync PostgreSQL → SQLite
      console.log('[UnifiedDB] 🔄 Going offline - syncing PostgreSQL → SQLite...');

      if (!this.syncInProgress) {
        this.syncInProgress = true;
        try {
          await syncService.syncToSQLite();
          console.log('[UnifiedDB] ✅ Sync to SQLite completed');
        } catch (error: any) {
          console.error('[UnifiedDB] ❌ Sync to SQLite failed:', error.message);
        } finally {
          this.syncInProgress = false;
        }
      }
    }

    this.previousStatus = newStatus;
  }

  /**
   * Get the appropriate database client based on connectivity
   */
  async getClient(): Promise<PrismaClient> {
    const dbService = getDatabaseService();

    // Get client from database service
    const client = await dbService.getClient();

    if (!client) {
      throw new Error('Database client not available');
    }

    return client;
  }

  /**
   * Execute a query (automatically uses correct database)
   */
  async query<T = any>(
    operation: (client: PrismaClient) => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const {
      useTransaction = false,
      retryOnFail = true,
      maxRetries = 3
    } = options;

    const client = await this.getClient();

    if (useTransaction) {
      return await client.$transaction(async (tx) => {
        return await operation(tx as PrismaClient);
      });
    }

    // Retry logic
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation(client);
      } catch (error: any) {
        lastError = error;

        if (!retryOnFail || attempt === maxRetries - 1) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }

    throw lastError || new Error('Query failed');
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    const connectivityService = getConnectivityService();
    return connectivityService.isOnline();
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    const connectivityService = getConnectivityService();
    return connectivityService.isOffline();
  }

  /**
   * Get current database type
   */
  getCurrentDatabaseType(): DatabaseType {
    // Always SQLite for Prisma (schema is SQLite)
    // PostgreSQL is used for sync only
    return DatabaseType.SQLITE;
  }

  /**
   * Force sync (manual trigger)
   */
  async forceSync(): Promise<void> {
    const syncService = getSyncService();
    const connectivityService = getConnectivityService();

    if (connectivityService.isOnline()) {
      await syncService.syncToPostgreSQL();
    } else {
      await syncService.syncToSQLite();
    }
  }
}

// Singleton instance
let unifiedDbServiceInstance: UnifiedDatabaseService | null = null;

export function getUnifiedDatabaseService(): UnifiedDatabaseService {
  if (!unifiedDbServiceInstance) {
    unifiedDbServiceInstance = new UnifiedDatabaseService();
  }
  return unifiedDbServiceInstance;
}

// Convenience function for controllers
export async function getDb(): Promise<PrismaClient> {
  const unifiedDb = getUnifiedDatabaseService();
  return await unifiedDb.getClient();
}
