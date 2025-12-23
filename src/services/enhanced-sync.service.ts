/**
 * Enhanced Sync Service - Production-ready with conflict resolution
 * Handles bidirectional sync with proper conflict resolution
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SyncQueueItem {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: Date;
  synced: boolean;
  error?: string;
  retryCount?: number;
}

interface ConflictResolution {
  strategy: 'timestamp' | 'source' | 'manual';
  resolved: boolean;
  resolution?: any;
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: number;
  errors: string[];
}

class EnhancedSyncService {
  private syncQueue: SyncQueueItem[] = [];
  private queueFilePath: string;
  private conflictResolutionStrategy: 'timestamp' | 'source' | 'manual' = 'timestamp';

  constructor() {
    const queueDir = path.join(os.homedir(), '.zapeera', 'sync');
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }
    this.queueFilePath = path.join(queueDir, 'sync-queue.json');
    this.loadQueue();
  }

  /**
   * Load sync queue from disk
   */
  private loadQueue(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const data = fs.readFileSync(this.queueFilePath, 'utf8');
        this.syncQueue = JSON.parse(data).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
          retryCount: item.retryCount || 0
        }));
      }
    } catch (error) {
      console.error('[Sync] Failed to load queue:', error);
      this.syncQueue = [];
    }
  }

  /**
   * Save sync queue to disk
   */
  private saveQueue(): void {
    try {
      fs.writeFileSync(
        this.queueFilePath,
        JSON.stringify(this.syncQueue, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[Sync] Failed to save queue:', error);
    }
  }

  /**
   * Add item to sync queue
   */
  addToQueue(table: string, operation: 'create' | 'update' | 'delete', data: any): void {
    const item: SyncQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      table,
      operation,
      data,
      timestamp: new Date(),
      synced: false,
      retryCount: 0
    };

    this.syncQueue.push(item);
    this.saveQueue();
    console.log(`[Sync] Added to queue: ${operation} on ${table} (${this.syncQueue.length} pending)`);
  }

  /**
   * Sync SQLite to PostgreSQL (when going online)
   */
  async syncToPostgreSQL(): Promise<SyncResult> {
    const dbService = getDatabaseService();
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: 0,
      errors: []
    };

    try {
      const sqliteClient = dbService.getSQLiteClient();
      const postgresUrl = dbService.getPostgreSQLUrl();

      if (!sqliteClient) {
        throw new Error('SQLite client not available');
      }

      if (!postgresUrl) {
        throw new Error('PostgreSQL URL not configured');
      }

      // Use direct pg client for PostgreSQL operations
      const { Client } = require('pg');
      const postgresClient = new Client({
        connectionString: postgresUrl
      });

      await postgresClient.connect();

      try {
        // Sync queue items first
        const pendingItems = this.syncQueue.filter(item => !item.synced);
        console.log(`[Sync] Syncing ${pendingItems.length} queued items to PostgreSQL...`);

        for (const item of pendingItems) {
          try {
            await this.syncItemToPostgreSQL(item, sqliteClient, postgresClient);
            item.synced = true;
            item.error = undefined;
            result.synced++;
          } catch (error: any) {
            item.retryCount = (item.retryCount || 0) + 1;
            item.error = error.message;
            result.failed++;
            result.errors.push(`${item.table}.${item.operation}: ${error.message}`);

            // Remove after max retries
            if (item.retryCount >= 5) {
              console.error(`[Sync] Max retries reached for item ${item.id}, removing from queue`);
              this.syncQueue = this.syncQueue.filter(i => i.id !== item.id);
            }
          }
          this.saveQueue();
        }

        // Sync all tables for consistency
        console.log('[Sync] Syncing all tables from SQLite to PostgreSQL...');
        const tableSyncResult = await this.syncAllTables(sqliteClient, postgresClient);
        result.synced += tableSyncResult.synced;
        result.conflicts += tableSyncResult.conflicts;
        result.errors.push(...tableSyncResult.errors);

        console.log(`[Sync] ✅ Sync completed: ${result.synced} synced, ${result.failed} failed, ${result.conflicts} conflicts`);
      } finally {
        await postgresClient.end();
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error('[Sync] ❌ Sync to PostgreSQL failed:', error);
    }

    return result;
  }

  /**
   * Sync PostgreSQL to SQLite (when going offline)
   */
  async syncToSQLite(): Promise<SyncResult> {
    const dbService = getDatabaseService();
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: 0,
      errors: []
    };

    try {
      const sqliteClient = dbService.getSQLiteClient();
      const postgresUrl = dbService.getPostgreSQLUrl();

      if (!sqliteClient) {
        throw new Error('SQLite client not available');
      }

      if (!postgresUrl) {
        throw new Error('PostgreSQL URL not configured');
      }

      // Use direct pg client for PostgreSQL operations
      const { Client } = require('pg');
      const postgresClient = new Client({
        connectionString: postgresUrl
      });

      await postgresClient.connect();

      try {
        // Sync all tables from PostgreSQL to SQLite
        console.log('[Sync] Syncing all tables from PostgreSQL to SQLite...');
        const tableSyncResult = await this.syncAllTables(postgresClient, sqliteClient);
        result.synced += tableSyncResult.synced;
        result.conflicts += tableSyncResult.conflicts;
        result.errors.push(...tableSyncResult.errors);

        console.log(`[Sync] ✅ Sync completed: ${result.synced} synced, ${result.failed} failed, ${result.conflicts} conflicts`);
      } finally {
        await postgresClient.end();
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error('[Sync] ❌ Sync to SQLite failed:', error);
    }

    return result;
  }

  /**
   * Sync a single item to PostgreSQL
   */
  private async syncItemToPostgreSQL(
    item: SyncQueueItem,
    sqliteClient: PrismaClient,
    postgresClient: any
  ): Promise<void> {
    const { table, operation, data } = item;

    // Use raw SQL for PostgreSQL (since Prisma schema is SQLite)
    const tableName = this.sanitizeTableName(table);

    switch (operation) {
      case 'create':
        await this.insertToPostgreSQL(postgresClient, tableName, data);
        break;
      case 'update':
        await this.updateInPostgreSQL(postgresClient, tableName, data);
        break;
      case 'delete':
        await this.deleteFromPostgreSQL(postgresClient, tableName, data.id);
        break;
    }
  }

  /**
   * Insert into PostgreSQL using raw SQL
   */
  private async insertToPostgreSQL(client: any, table: string, data: any): Promise<void> {
    const columns = Object.keys(data).filter(key => data[key] !== undefined);
    const values = columns.map(col => data[col]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnNames = columns.map(col => `"${col}"`).join(', ');

    const query = `INSERT INTO "${table}" (${columnNames}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ')}`;

    await client.query(query, values);
  }

  /**
   * Update in PostgreSQL using raw SQL
   */
  private async updateInPostgreSQL(client: any, table: string, data: any): Promise<void> {
    if (!data.id) {
      throw new Error('Update requires id');
    }

    const columns = Object.keys(data).filter(key => key !== 'id' && data[key] !== undefined);
    const values = columns.map(col => data[col]);
    const setClause = columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');

    const query = `UPDATE "${table}" SET ${setClause}, "updated_at" = NOW() WHERE "id" = $${columns.length + 1}`;

    await client.query(query, [...values, data.id]);
  }

  /**
   * Delete from PostgreSQL using raw SQL
   */
  private async deleteFromPostgreSQL(client: any, table: string, id: string): Promise<void> {
    const query = `DELETE FROM "${table}" WHERE "id" = $1`;
    await client.query(query, [id]);
  }

  /**
   * Sync all tables between databases
   */
  private async syncAllTables(
    sourceClient: any,
    targetClient: any
  ): Promise<{ synced: number; conflicts: number; errors: string[] }> {
    const tables = [
      'company', 'category', 'supplier', 'manufacturer', 'shelf', 'settings',
      'user', 'branch', 'role', 'employee',
      'product', 'batch', 'stockMovement',
      'customer', 'sale', 'saleItem', 'receipt',
      'purchase', 'purchaseItem',
      'refund', 'refundItem',
      'attendance', 'shift', 'scheduledShift', 'scheduledShiftUser', 'commission',
      'card_details', 'subscriptions'
    ];

    let synced = 0;
    let conflicts = 0;
    const errors: string[] = [];

    for (const table of tables) {
      try {
        const result = await this.syncTable(sourceClient, targetClient, table);
        synced += result.synced;
        conflicts += result.conflicts;
        errors.push(...result.errors);
      } catch (error: any) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    return { synced, conflicts, errors };
  }

  /**
   * Sync a single table
   */
  private async syncTable(
    sourceClient: any,
    targetClient: any,
    tableName: string
  ): Promise<{ synced: number; conflicts: number; errors: string[] }> {
    let synced = 0;
    let conflicts = 0;
    const errors: string[] = [];

    try {
      // Get all records from source
      const sourceRecords = await this.getTableRecords(sourceClient, tableName);

      // Get all records from target
      const targetRecords = await this.getTableRecords(targetClient, tableName);

      const targetMap = new Map(targetRecords.map((r: any) => [r.id, r]));

      for (const sourceRecord of sourceRecords) {
        const targetRecord = targetMap.get(sourceRecord.id);

        if (!targetRecord) {
          // New record - insert
          await this.insertRecord(targetClient, tableName, sourceRecord);
          synced++;
        } else {
          // Existing record - check for conflicts
          const conflict = await this.resolveConflict(
            sourceRecord,
            targetRecord,
            tableName
          );

          if (conflict.resolved) {
            await this.updateRecord(targetClient, tableName, conflict.resolution);
            synced++;
            if (conflict.resolution !== sourceRecord && conflict.resolution !== targetRecord) {
              conflicts++;
            }
          } else {
            conflicts++;
            errors.push(`${tableName}.${sourceRecord.id}: Conflict not resolved`);
          }
        }
      }
    } catch (error: any) {
      errors.push(`${tableName}: ${error.message}`);
    }

    return { synced, conflicts, errors };
  }

  /**
   * Get all records from a table
   */
  private async getTableRecords(client: any, tableName: string): Promise<any[]> {
    if (client instanceof PrismaClient) {
      // SQLite (Prisma)
      return await (client as any)[tableName].findMany();
    } else {
      // PostgreSQL (raw SQL)
      const result = await client.query(`SELECT * FROM "${tableName}"`);
      return result.rows;
    }
  }

  /**
   * Insert a record
   */
  private async insertRecord(client: any, tableName: string, record: any): Promise<void> {
    if (client instanceof PrismaClient) {
      // SQLite (Prisma)
      await (client as any)[tableName].create({ data: record });
    } else {
      // PostgreSQL (raw SQL)
      await this.insertToPostgreSQL(client, tableName, record);
    }
  }

  /**
   * Update a record
   */
  private async updateRecord(client: any, tableName: string, record: any): Promise<void> {
    if (client instanceof PrismaClient) {
      // SQLite (Prisma)
      await (client as any)[tableName].update({
        where: { id: record.id },
        data: record
      });
    } else {
      // PostgreSQL (raw SQL)
      await this.updateInPostgreSQL(client, tableName, record);
    }
  }

  /**
   * Resolve conflicts between source and target records
   */
  private async resolveConflict(
    sourceRecord: any,
    targetRecord: any,
    tableName: string
  ): Promise<ConflictResolution> {
    if (this.conflictResolutionStrategy === 'timestamp') {
      // Use most recent timestamp
      const sourceTime = new Date(sourceRecord.updated_at || sourceRecord.created_at || 0);
      const targetTime = new Date(targetRecord.updated_at || targetRecord.created_at || 0);

      if (sourceTime > targetTime) {
        return {
          strategy: 'timestamp',
          resolved: true,
          resolution: sourceRecord
        };
      } else {
        return {
          strategy: 'timestamp',
          resolved: true,
          resolution: targetRecord
        };
      }
    } else if (this.conflictResolutionStrategy === 'source') {
      // Always use source
      return {
        strategy: 'source',
        resolved: true,
        resolution: sourceRecord
      };
    } else {
      // Manual resolution required
      return {
        strategy: 'manual',
        resolved: false
      };
    }
  }

  /**
   * Sanitize table name
   */
  private sanitizeTableName(table: string): string {
    return table.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    pendingItems: number;
    syncedItems: number;
    failedItems: number;
  } {
    const pending = this.syncQueue.filter(item => !item.synced).length;
    const synced = this.syncQueue.filter(item => item.synced).length;
    const failed = this.syncQueue.filter(item => item.error && !item.synced).length;

    return {
      pendingItems: pending,
      syncedItems: synced,
      failedItems: failed
    };
  }

  /**
   * Clear sync queue
   */
  clearQueue(): void {
    this.syncQueue = [];
    this.saveQueue();
  }
}

// Singleton instance
let enhancedSyncServiceInstance: EnhancedSyncService | null = null;

export function getEnhancedSyncService(): EnhancedSyncService {
  if (!enhancedSyncServiceInstance) {
    enhancedSyncServiceInstance = new EnhancedSyncService();
  }
  return enhancedSyncServiceInstance;
}
