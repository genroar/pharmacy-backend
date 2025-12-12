/**
 * Sync Service - Handles bidirectional synchronization between SQLite and PostgreSQL
 * Syncs data when going online/offline and maintains data consistency
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseService, DatabaseType, ConnectionStatus } from './database.service';
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
}

interface SyncStatus {
  inProgress: boolean;
  lastSync: Date | null;
  pendingItems: number;
  syncedItems: number;
  failedItems: number;
  currentOperation: string | null;
}

class SyncService {
  private syncQueue: SyncQueueItem[] = [];
  private syncStatus: SyncStatus = {
    inProgress: false,
    lastSync: null,
    pendingItems: 0,
    syncedItems: 0,
    failedItems: 0,
    currentOperation: null
  };
  private queueFilePath: string;
  private postgresTablesExist: boolean = false; // Track if tables exist
  private tablesCheckDone: boolean = false; // Only log missing tables once
  private lastTableCheckTime: Date | null = null; // Rate limit table checks

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
          timestamp: new Date(item.timestamp)
        }));
        this.updateStatus();
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
      synced: false
    };

    this.syncQueue.push(item);
    this.saveQueue();
    this.updateStatus();

    console.log(`[Sync] Added to queue: ${operation} on ${table}`);
  }

  /**
   * Sync SQLite changes to PostgreSQL (when going online)
   * This is the main sync operation: SQLite (offline) → PostgreSQL (online)
   */
  async syncToPostgreSQL(): Promise<void> {
    if (this.syncStatus.inProgress) {
      console.log('[Sync] Sync already in progress');
      return;
    }

    const dbService = getDatabaseService();

    // Check if PostgreSQL URL is available
    const postgresUrl = dbService.getPostgreSQLUrl();
    if (!postgresUrl) {
      console.log('[Sync] PostgreSQL not available, cannot sync');
      return;
    }

    this.syncStatus.inProgress = true;
    this.syncStatus.currentOperation = 'Syncing to PostgreSQL';

    try {
      const sqliteClient = await dbService.getSQLiteClient();

      // Use direct pg client for PostgreSQL operations
      const { Client } = require('pg');
      const postgresClient = new Client({
        connectionString: postgresUrl
      });

      await postgresClient.connect();

      try {
        const pendingItems = this.syncQueue.filter(item => !item.synced);
        console.log(`[Sync] Syncing ${pendingItems.length} items to PostgreSQL`);

        for (const item of pendingItems) {
          try {
            await this.syncItemToPostgreSQL(item, sqliteClient, postgresClient);
            item.synced = true;
            item.error = undefined;
            this.syncStatus.syncedItems++;
          } catch (error: any) {
            item.error = error.message;
            this.syncStatus.failedItems++;
            console.error(`[Sync] Failed to sync item ${item.id}:`, error.message);
          }
          this.saveQueue();
        }

        // Sync all data tables for consistency
        // This ensures PostgreSQL has all data from SQLite
        console.log('[Sync] 🔄 Syncing all tables from SQLite to PostgreSQL...');
        await this.syncAllTables(sqliteClient, postgresClient);

        this.syncStatus.lastSync = new Date();
        this.syncStatus.currentOperation = null;
        console.log('[Sync] ✅ Sync to PostgreSQL completed - Both databases are now in sync');
      } finally {
        await postgresClient.end();
      }
    } catch (error: any) {
      console.error('[Sync] ❌ Sync to PostgreSQL failed:', error.message);
      this.syncStatus.currentOperation = `Error: ${error.message}`;
    } finally {
      this.syncStatus.inProgress = false;
      this.updateStatus();
    }
  }

  /**
   * Sync PostgreSQL changes to SQLite (when going offline)
   * This ensures SQLite has the latest data from PostgreSQL
   */
  async syncToSQLite(): Promise<void> {
    if (this.syncStatus.inProgress) {
      console.log('[Sync] Sync already in progress');
      return;
    }

    const dbService = getDatabaseService();

    // Try to get PostgreSQL client (might be available even if not "online")
    let postgresClient: PrismaClient | null = null;
    try {
      postgresClient = await dbService.getPostgreSQLClient();
    } catch (err) {
      console.log('[Sync] PostgreSQL client not available');
    }

    if (!postgresClient) {
      // If PostgreSQL is not available, we can't sync from it
      // But we can still ensure SQLite is ready
      console.log('[Sync] PostgreSQL not available, cannot sync to SQLite');
      console.log('[Sync] SQLite will continue with existing data');
      return;
    }

    this.syncStatus.inProgress = true;
    this.syncStatus.currentOperation = 'Syncing PostgreSQL → SQLite';

    try {
      const sqliteClient = await dbService.getSQLiteClient();

      console.log('[Sync] 🔄 Syncing PostgreSQL data to SQLite to keep data up-to-date...');

      // Sync all tables from PostgreSQL to SQLite
      // This ensures SQLite has the latest data when going offline
      await this.syncAllTables(postgresClient, sqliteClient);

      this.syncStatus.lastSync = new Date();
      this.syncStatus.currentOperation = null;
      console.log('[Sync] ✅ Sync to SQLite completed - SQLite now has up-to-date data');
    } catch (error: any) {
      console.error('[Sync] ❌ Sync to SQLite failed:', error.message);
      this.syncStatus.currentOperation = `Error: ${error.message}`;
      // Don't throw - allow system to continue with SQLite even if sync fails
    } finally {
      this.syncStatus.inProgress = false;
      this.updateStatus();
    }
  }

  /**
   * Sync a single item to PostgreSQL (using raw SQL)
   */
  private async syncItemToPostgreSQL(
    item: SyncQueueItem,
    sqliteClient: PrismaClient,
    postgresClient: any
  ): Promise<void> {
    const { table, operation, data } = item;
    // Convert Prisma model name to PostgreSQL table name
    const postgresTableName = this.getPostgreSQLTableName(table);
    const tableName = this.sanitizeTableName(postgresTableName);

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
    // Check if table exists
    const tableExists = await this.tableExistsInPostgreSQL(client, table);
    if (!tableExists) {
      throw new Error(`Table ${table} does not exist in PostgreSQL. Please run migrations first.`);
    }

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

    // Check if updated_at column exists
    const hasUpdatedAt = await this.columnExistsInPostgreSQL(client, table, 'updated_at');
    const setClauseWithTimestamp = hasUpdatedAt
      ? `${setClause}, "updated_at" = NOW()`
      : setClause;

    const query = `UPDATE "${table}" SET ${setClauseWithTimestamp} WHERE "id" = $${columns.length + 1}`;

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
   * Sanitize table name
   */
  private sanitizeTableName(table: string): string {
    return table.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Check if client is PrismaClient or raw pg Client
   */
  private isPrismaClient(client: any): boolean {
    return client instanceof PrismaClient ||
           (client && typeof client.$connect === 'function' && typeof client.$disconnect === 'function');
  }

  /**
   * Get all records from a table (works with both PrismaClient and pg Client)
   */
  private async getTableRecords(client: any, tableName: string): Promise<any[]> {
    if (this.isPrismaClient(client)) {
      // PrismaClient (SQLite)
      const prismaModel = (client as any)[tableName];
      if (!prismaModel) {
        console.warn(`[Sync] Table ${tableName} not found in Prisma schema, skipping`);
        return [];
      }
      return await prismaModel.findMany();
    } else {
      // Raw pg Client (PostgreSQL)
      try {
        const result = await client.query(`SELECT * FROM "${tableName}"`);
        return result.rows;
      } catch (error: any) {
        // If table doesn't exist, return empty array (don't log repeatedly)
        if (error.message && error.message.includes('does not exist')) {
          return [];
        }
        throw error;
      }
    }
  }

  /**
   * Check if table exists in PostgreSQL
   */
  private async tableExistsInPostgreSQL(client: any, tableName: string): Promise<boolean> {
    try {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [tableName]
      );
      return result.rows[0]?.exists || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if column exists in PostgreSQL table
   */
  private async columnExistsInPostgreSQL(client: any, tableName: string, columnName: string): Promise<boolean> {
    try {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        )`,
        [tableName, columnName]
      );
      return result.rows[0]?.exists || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get unique constraints for a table
   */
  private async getUniqueConstraints(client: any, tableName: string): Promise<string[]> {
    try {
      const result = await client.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = $1
        AND constraint_type = 'UNIQUE'
      `, [tableName]);
      return result.rows.map((row: any) => row.constraint_name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get unique columns for a constraint
   */
  private async getUniqueColumnsForConstraint(client: any, tableName: string, constraintName: string): Promise<string[]> {
    try {
      const result = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_name = $2
      `, [tableName, constraintName]);
      return result.rows.map((row: any) => row.column_name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Convert camelCase to snake_case
   * Examples: companyId -> company_id, branchId -> branch_id
   */
  private camelToSnake(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }

  /**
   * Get actual column names from PostgreSQL table
   */
  private async getActualColumnNames(client: any, tableName: string): Promise<string[]> {
    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      return result.rows.map((row: any) => row.column_name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Find actual column name in PostgreSQL (handles both camelCase and snake_case)
   */
  private findActualColumnName(prismaFieldName: string, actualColumns: string[]): string {
    // First, try exact match (camelCase)
    if (actualColumns.includes(prismaFieldName)) {
      return prismaFieldName;
    }

    // Then, try snake_case
    const snakeCase = this.camelToSnake(prismaFieldName);
    if (actualColumns.includes(snakeCase)) {
      return snakeCase;
    }

    // If not found, return snake_case (most common in PostgreSQL)
    return snakeCase;
  }

  /**
   * Check if foreign key reference exists
   */
  private async foreignKeyExists(client: any, tableName: string, columnName: string, referencedId: string): Promise<boolean> {
    try {
      // Convert camelCase to snake_case for PostgreSQL column names
      const snakeColumnName = this.camelToSnake(columnName);

      // Get foreign key constraint info - try both camelCase and snake_case
      const fkResult = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
        AND (kcu.column_name = $2 OR kcu.column_name = $3)
      `, [tableName, columnName, snakeColumnName]);

      if (fkResult.rows.length === 0) {
        return true; // No foreign key, so it's valid
      }

      const fk = fkResult.rows[0];
      // Check if referenced record exists
      const checkResult = await client.query(
        `SELECT EXISTS (SELECT 1 FROM "${fk.foreign_table_name}" WHERE "${fk.foreign_column_name}" = $1)`,
        [referencedId]
      );

      return checkResult.rows[0]?.exists || false;
    } catch (error: any) {
      console.warn(`[Sync] ⚠️  Error checking foreign key ${tableName}.${columnName}:`, error.message);
      return false; // On error, assume it doesn't exist to be safe
    }
  }

  /**
   * Upsert record to target (works with both PrismaClient and pg Client)
   */
  private async upsertRecord(
    targetClient: any,
    tableName: string,
    record: any
  ): Promise<void> {
    const cleanRecord = this.cleanRecord(record);
    const { id, ...dataWithoutId } = cleanRecord;
    const dataToSync = this.removeRelations(dataWithoutId);

    if (this.isPrismaClient(targetClient)) {
      // PrismaClient (SQLite)
      const prismaModel = (targetClient as any)[tableName];
      if (!prismaModel) {
        throw new Error(`Table ${tableName} not found in Prisma schema`);
      }
      await prismaModel.upsert({
        where: { id: cleanRecord.id },
        update: dataToSync,
        create: { id: cleanRecord.id, ...dataToSync }
      });
    } else {
      // Raw pg Client (PostgreSQL) - check if table exists first
      const tableExists = await this.tableExistsInPostgreSQL(targetClient, tableName);
      if (!tableExists) {
        throw new Error(`Table ${tableName} does not exist in PostgreSQL. Please run migrations first.`);
      }

      // Use raw SQL
      // Get actual column names from PostgreSQL (handles both camelCase and snake_case)
      const columns = Object.keys(dataToSync).filter(key => dataToSync[key] !== undefined);
      const values = columns.map(col => dataToSync[col]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      // Get actual column names from PostgreSQL table
      const actualColumnNames = await this.getActualColumnNames(targetClient, tableName);

      // Map Prisma field names to actual PostgreSQL column names
      const columnNames = columns.map(col => {
        const actualCol = this.findActualColumnName(col, actualColumnNames);
        return `"${actualCol}"`;
      }).join(', ');

      const updateClause = columns.map((col, i) => {
        const actualCol = this.findActualColumnName(col, actualColumnNames);
        return `"${actualCol}" = $${i + 1}`;
      }).join(', ');

      // Check if updated_at column exists before using it
      const hasUpdatedAt = await this.columnExistsInPostgreSQL(targetClient, tableName, 'updated_at');
      const updateClauseWithTimestamp = hasUpdatedAt
        ? `${updateClause}, "updated_at" = NOW()`
        : updateClause;

      // Use PostgreSQL UPSERT (ON CONFLICT)
      // Handle conflicts on both id and unique constraints
      const uniqueConstraints = await this.getUniqueConstraints(targetClient, tableName);
      let conflictTarget = '"id"';

      // If there are unique constraints, we need to handle them
      // For now, use id as primary conflict target
      const query = `
        INSERT INTO "${tableName}" ("id", ${columnNames})
        VALUES ($${columns.length + 1}, ${placeholders})
        ON CONFLICT ("id")
        DO UPDATE SET ${updateClauseWithTimestamp}
      `;

      try {
        await targetClient.query(query, [...values, cleanRecord.id]);
      } catch (error: any) {
        // Log the actual error for debugging
        if (!error.message.includes('current transaction is aborted')) {
          console.warn(`[Sync] ⚠️  Upsert error for ${tableName} record ${cleanRecord.id}: ${error.message}`);
        }

        // If duplicate key error, check if record exists and update it
        if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
          // Check if record exists by id first
          const existsResult = await targetClient.query(
            `SELECT id FROM "${tableName}" WHERE "id" = $1`,
            [cleanRecord.id]
          );

          if (existsResult.rows.length > 0) {
            // Record exists, just update it
            const updateQuery = `
              UPDATE "${tableName}"
              SET ${updateClauseWithTimestamp}
              WHERE "id" = $${columns.length + 1}
            `;
            await targetClient.query(updateQuery, [...values, cleanRecord.id]);
          } else {
            // Extract constraint name from error and try to update by unique constraint
            const constraintMatch = error.message.match(/constraint "([^"]+)"/);
            if (constraintMatch) {
              const constraintName = constraintMatch[1];
              const uniqueCols = await this.getUniqueColumnsForConstraint(targetClient, tableName, constraintName);
              if (uniqueCols.length > 0) {
                // Build WHERE clause for unique columns
                const whereClause = uniqueCols.map((col: string, i: number) => `"${col}" = $${columns.length + 1 + i}`).join(' AND ');
                const uniqueValues = uniqueCols.map((col: string) => cleanRecord[col]);

                // Try UPDATE by unique constraint
                const updateQuery = `
                  UPDATE "${tableName}"
                  SET ${updateClauseWithTimestamp}
                  WHERE ${whereClause}
                `;
                await targetClient.query(updateQuery, [...values, ...uniqueValues]);
              } else {
                throw error; // Re-throw if we can't handle it
              }
            } else {
              throw error; // Re-throw if we can't extract constraint
            }
          }
        } else {
          throw error; // Re-throw other errors
        }
      }
    }
  }

  /**
   * Map Prisma model names to actual PostgreSQL table names
   * Based on @@map() in schema.prisma
   */
  private getPostgreSQLTableName(modelName: string): string {
    const tableMap: Record<string, string> = {
      // Model name -> PostgreSQL table name
      'company': 'companies',
      'category': 'categories',
      'supplier': 'suppliers',
      'manufacturer': 'manufacturers',
      'shelf': 'shelves',
      'settings': 'settings',
      'user': 'users',
      'branch': 'branches',
      'employee': 'employees',
      'product': 'products',
      'batch': 'batches',
      'stockMovement': 'stock_movements',
      'customer': 'customers',
      'sale': 'sales',
      'saleItem': 'sale_items',
      'receipt': 'receipts',
      'purchase': 'purchases',
      'purchaseItem': 'purchase_items',
      'refund': 'refunds',
      'refundItem': 'refund_items',
      'attendance': 'attendance',
      'shift': 'shifts',
      'scheduledShift': 'scheduled_shifts',
      'scheduledShiftUser': 'scheduled_shift_users',
      'commission': 'commissions',
      'card_details': 'card_details',
      'subscriptions': 'subscriptions'
    };

    return tableMap[modelName] || modelName;
  }

  /**
   * Get Prisma model name from PostgreSQL table name (reverse mapping)
   */
  private getPrismaModelName(tableName: string): string {
    const modelMap: Record<string, string> = {
      'companies': 'company',
      'categories': 'category',
      'suppliers': 'supplier',
      'manufacturers': 'manufacturer',
      'shelves': 'shelf',
      'settings': 'settings',
      'users': 'user',
      'branches': 'branch',
      'employees': 'employee',
      'products': 'product',
      'batches': 'batch',
      'stock_movements': 'stockMovement',
      'customers': 'customer',
      'sales': 'sale',
      'sale_items': 'saleItem',
      'receipts': 'receipt',
      'purchases': 'purchase',
      'purchase_items': 'purchaseItem',
      'refunds': 'refund',
      'refund_items': 'refundItem',
      'attendance': 'attendance',
      'shifts': 'shift',
      'scheduled_shifts': 'scheduledShift',
      'scheduled_shift_users': 'scheduledShiftUser',
      'commissions': 'commission',
      'card_details': 'card_details',
      'subscriptions': 'subscriptions'
    };

    return modelMap[tableName] || tableName;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sync all tables between databases
   * Ensures both databases have the same up-to-date data
   */
  private async syncAllTables(
    sourceClient: PrismaClient,
    targetClient: any
  ): Promise<number> {
    // List of all tables to sync (using Prisma model names)
    // Order matters: sync parent tables before child tables (foreign keys)
    const modelNames = [
      // Core tables (no dependencies)
      'company',
      'category',
      'supplier',
      'manufacturer',
      'shelf',
      'settings',
      // User and branch (depend on company)
      'user',
      'branch',
      'employee',
      // Products (depend on category, supplier, manufacturer, shelf)
      'product',
      // Batches (depend on product)
      'batch',
      'stockMovement',
      // Customers (depend on branch)
      'customer',
      // Sales (depend on customer, user, branch, product)
      'sale',
      'saleItem',
      'receipt',
      // Purchases (depend on supplier, branch, product)
      'purchase',
      'purchaseItem',
      // Refunds (depend on sale)
      'refund',
      'refundItem',
      // Employee management
      'attendance',
      'shift',
      'scheduledShift',
      'scheduledShiftUser',
      'commission',
      // Other
      'card_details',
      'subscriptions'
    ];

    let totalSynced = 0;
    let totalFailed = 0;
    const failedRecords: Array<{ modelName: string; postgresTableName: string; record: any; error: string }> = [];

    // Rate limit: Only do full table check every 5 minutes
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;
    if (this.lastTableCheckTime && (now.getTime() - this.lastTableCheckTime.getTime()) < fiveMinutes && !this.postgresTablesExist) {
      // Skip sync if we recently checked and tables don't exist
      return totalSynced;
    }
    this.lastTableCheckTime = now;

    console.log(`[Sync] Starting full database sync (${modelNames.length} tables)...`);

    // For PostgreSQL: Disable FK checks during sync to allow inserting children before parents
    let transactionActive = false;
    let missingTablesCount = 0;

    if (!this.isPrismaClient(targetClient)) {
      try {
        // Rollback any existing failed transaction first (safe to call even if not in transaction)
        try {
          await targetClient.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignore rollback errors if not in transaction - this is expected
        }
        // Start fresh transaction
        await targetClient.query('BEGIN');
        await targetClient.query('SET session_replication_role = replica');
        transactionActive = true;
        console.log('[Sync] 🔓 Disabled foreign key checks for sync (session_replication_role = replica)');
      } catch (error: any) {
        console.warn('[Sync] ⚠️  Could not disable FK checks:', error.message);
        // Try to rollback if transaction was started
        try {
          await targetClient.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignore
        }
        transactionActive = false;
      }
    }

    // First pass: Sync all tables in strict order
    for (const modelName of modelNames) {
      try {
        // Get PostgreSQL table name (plural/snake_case)
        const postgresTableName = this.getPostgreSQLTableName(modelName);
        this.syncStatus.currentOperation = `Syncing ${modelName} (${postgresTableName})...`;

        // Check if table exists in target (PostgreSQL) before syncing
        if (!this.isPrismaClient(targetClient)) {
          const tableExists = await this.tableExistsInPostgreSQL(targetClient, postgresTableName);
          if (!tableExists) {
            missingTablesCount++;
            // Only log individual missing tables on first check
            if (!this.tablesCheckDone) {
              console.warn(`[Sync] ⚠️  Table ${postgresTableName} does not exist in PostgreSQL, skipping.`);
            }
            continue;
          }
        }

        // Get all records from source (SQLite - PrismaClient) using model name
        const records = await this.getTableRecords(sourceClient, modelName);

        if (records.length === 0) {
          console.log(`[Sync] Table ${modelName} is empty, skipping`);
          continue;
        }

        let syncedCount = 0;
        let failedCount = 0;

        // Upsert to target (PostgreSQL - raw pg Client or SQLite - PrismaClient)
        for (const record of records) {
          try {
            // Use PostgreSQL table name for raw SQL, model name for Prisma
            const targetTableName = this.isPrismaClient(targetClient) ? modelName : postgresTableName;

            // Check foreign key constraints before syncing (for PostgreSQL)
            // Note: We skip this check for the first sync pass to allow parent records to sync first
            // Foreign key violations will be caught by PostgreSQL and handled gracefully
            // This allows records to sync even if parent records are syncing in the same batch

            await this.upsertRecord(targetClient, targetTableName, record);
            syncedCount++;
          } catch (error: any) {
            failedCount++;

            // Log the actual error first (before transaction abort check)
            if (!error.message.includes('current transaction is aborted')) {
              console.warn(`[Sync] ⚠️  Error syncing ${modelName} record ${record.id}: ${error.message}`);
            }

            // Handle transaction errors - need to rollback and restart
            if (error.message && error.message.includes('current transaction is aborted')) {
              console.warn(`[Sync] ⚠️  Transaction aborted for ${modelName} record ${record.id}, rolling back...`);

              // Don't retry transaction aborted errors immediately - they indicate a previous error
              // Just rollback and continue - the record will be added to retry queue if it's a FK violation
              if (!this.isPrismaClient(targetClient) && transactionActive) {
                try {
                  await targetClient.query('ROLLBACK');
                  await targetClient.query('BEGIN');
                  await targetClient.query('SET session_replication_role = replica');
                  transactionActive = true;
                  console.log('[Sync] ✅ Transaction restarted');
                } catch (rollbackError: any) {
                  console.error('[Sync] ❌ Failed to restart transaction:', rollbackError.message);
                  transactionActive = false;
                }
              }

              // Don't add transaction abort errors to retry queue - they're not retryable
              // Only add if it's a specific error we can retry (FK violations, etc.)
              continue;
            }

            // Handle specific error types
            if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
              // Duplicate key - record already exists, this is okay
              console.log(`[Sync] ℹ️  ${modelName} record ${record.id} already exists in PostgreSQL, skipping`);
              syncedCount++; // Count as synced since it already exists
              failedCount--; // Don't count as failed
            } else if (error.message && error.message.includes('violates foreign key constraint')) {
              // Foreign key violation - extract details for debugging
              const fkMatch = error.message.match(/violates foreign key constraint "([^"]+)"/);
              const constraintName = fkMatch ? fkMatch[1] : 'unknown';

              // Extract which foreign key is missing
              let fkDetails = '';
              if (record.branchId) fkDetails += `branchId:${record.branchId} `;
              if (record.companyId) fkDetails += `companyId:${record.companyId} `;
              if (record.userId) fkDetails += `userId:${record.userId} `;
              if (record.categoryId) fkDetails += `categoryId:${record.categoryId} `;

              console.warn(`[Sync] ⚠️  ${modelName} record ${record.id} failed (FK: ${constraintName}) - ${fkDetails.trim()} - will retry after sync`);

              // Store for retry after all tables are synced
              failedRecords.push({
                modelName,
                postgresTableName,
                record,
                error: error.message
              });
            } else if (error.message && (error.message.includes('does not exist in PostgreSQL') || error.message.includes('Table') && error.message.includes('does not exist'))) {
              // Table doesn't exist - don't retry, just log
              console.warn(`[Sync] ⚠️  ${modelName} record ${record.id}: ${error.message}`);
              console.warn(`[Sync] 💡 Run: npm run db:reset-postgresql (to reset and rebuild) or create tables manually.`);
              // Don't add to retry queue - table needs to be created first
            } else {
              // Other errors - log but don't retry unless it's a specific retryable error
              if (failedCount <= 5) { // Only log first 5 errors per table
                console.warn(`[Sync] Failed to sync ${modelName} record ${record.id}:`, error.message);
              }
            }
          }
        }

        totalSynced += syncedCount;
        totalFailed += failedCount;

        if (syncedCount > 0) {
          console.log(`[Sync] ✅ Synced ${syncedCount}/${records.length} ${modelName} records${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
        } else if (failedCount > 0) {
          console.warn(`[Sync] ⚠️  Table ${modelName}: ${failedCount} records failed to sync`);
        }

        // FIX 1: Force COMMIT and wait after each table sync (for PostgreSQL)
        // This ensures data is visible and FK constraints can be checked
        if (!this.isPrismaClient(targetClient) && syncedCount > 0 && transactionActive) {
          try {
            await targetClient.query('COMMIT');
            await this.delay(100); // 100ms delay for PG to process
            await targetClient.query('BEGIN');
            await targetClient.query('SET session_replication_role = replica');
            transactionActive = true;
          } catch (error: any) {
            console.warn(`[Sync] ⚠️  Error committing after ${modelName}:`, error.message);
            // Try to restart transaction
            try {
              await targetClient.query('ROLLBACK');
              await targetClient.query('BEGIN');
              await targetClient.query('SET session_replication_role = replica');
              transactionActive = true;
            } catch (restartError) {
              console.error(`[Sync] ❌ Failed to restart transaction after ${modelName}`);
              transactionActive = false;
            }
          }
        }
      } catch (error: any) {
        console.error(`[Sync] ❌ Failed to sync table ${modelName}:`, error.message);
        totalFailed++;
      }
    }

    // Re-enable FK checks after all tables are synced
    if (!this.isPrismaClient(targetClient) && transactionActive) {
      try {
        await targetClient.query('SET session_replication_role = DEFAULT');
        await targetClient.query('COMMIT');
        transactionActive = false;
        console.log('[Sync] 🔒 Re-enabled foreign key checks (session_replication_role = DEFAULT)');
      } catch (error: any) {
        console.warn('[Sync] ⚠️  Error re-enabling FK checks:', error.message);
        try {
          await targetClient.query('ROLLBACK');
          transactionActive = false;
        } catch (rollbackError) {
          // Ignore rollback errors
          transactionActive = false;
        }
      }
    }

    // Second pass: Retry records that failed due to foreign key violations
    // Filter out records that failed due to missing tables (those can't be retried)
    const retryableRecords = failedRecords.filter(fr =>
      !fr.error.includes('does not exist in PostgreSQL') &&
      !fr.error.includes('Table') &&
      !fr.error.includes('does not exist')
    );

    if (retryableRecords.length > 0 && !this.isPrismaClient(targetClient)) {
      console.log(`[Sync] 🔄 Retrying ${retryableRecords.length} records that failed due to foreign key violations...`);
      if (retryableRecords.length < failedRecords.length) {
        console.log(`[Sync] ℹ️  Skipping ${failedRecords.length - retryableRecords.length} records that failed due to missing tables`);
      }

      // Ensure we start with a clean transaction for retry
      let retryTransactionActive = false;
      try {
        // Rollback any existing failed transaction first
        try {
          await targetClient.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignore rollback errors if not in transaction - this is expected
        }
        // Start fresh transaction for retry
        await targetClient.query('BEGIN');
        await targetClient.query('SET session_replication_role = replica');
        retryTransactionActive = true;
        console.log('[Sync] 🔓 Disabled FK checks for retry pass');
      } catch (error: any) {
        console.warn('[Sync] ⚠️  Could not start retry transaction:', error.message);
        // Try to rollback if transaction was started
        try {
          await targetClient.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignore
        }
        retryTransactionActive = false;
      }

      let retrySynced = 0;
      let retryFailed = 0;

      for (const { modelName, postgresTableName, record } of retryableRecords) {
        try {
          // Handle transaction abort errors during retry
          let retryAttempted = false;
          let maxRetries = 2;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              // Check if transaction is still active, restart if needed
              if (!retryTransactionActive) {
                try {
                  await targetClient.query('ROLLBACK');
                } catch (rollbackError) {
                  // Ignore
                }
                await targetClient.query('BEGIN');
                await targetClient.query('SET session_replication_role = replica');
                retryTransactionActive = true;
              }

              // First, verify parent records exist in PostgreSQL
              if (record.companyId) {
                const companyExists = await targetClient.query(
                  'SELECT id FROM companies WHERE id = $1',
                  [record.companyId]
                );
                if (companyExists.rows.length === 0) {
                  console.warn(`[Sync] ⚠️  ${modelName} record ${record.id}: companyId ${record.companyId} does not exist in PostgreSQL companies table`);
                  retryFailed++;
                  retryAttempted = true;
                  break;
                }
              }

              if (record.branchId) {
                const branchExists = await targetClient.query(
                  'SELECT id FROM branches WHERE id = $1',
                  [record.branchId]
                );
                if (branchExists.rows.length === 0) {
                  console.warn(`[Sync] ⚠️  ${modelName} record ${record.id}: branchId ${record.branchId} does not exist in PostgreSQL branches table`);
                  retryFailed++;
                  retryAttempted = true;
                  break;
                }
              }

              if (record.categoryId) {
                const categoryExists = await targetClient.query(
                  'SELECT id FROM categories WHERE id = $1',
                  [record.categoryId]
                );
                if (categoryExists.rows.length === 0) {
                  console.warn(`[Sync] ⚠️  ${modelName} record ${record.id}: categoryId ${record.categoryId} does not exist in PostgreSQL categories table`);
                  retryFailed++;
                  retryAttempted = true;
                  break;
                }
              }

              const targetTableName = this.isPrismaClient(targetClient) ? modelName : postgresTableName;
              await this.upsertRecord(targetClient, targetTableName, record);
              retrySynced++;
              totalSynced++;
              totalFailed--; // Remove from failed count
              console.log(`[Sync] ✅ Retry successful: ${modelName} record ${record.id}`);
              retryAttempted = true;
              break; // Success, exit retry loop

            } catch (error: any) {
              // Handle transaction abort
              if (error.message && error.message.includes('current transaction is aborted')) {
                console.warn(`[Sync] ⚠️  Transaction aborted during retry (attempt ${attempt + 1}/${maxRetries}), restarting...`);
                try {
                  await targetClient.query('ROLLBACK');
                  await this.delay(50); // Small delay before restart
                  await targetClient.query('BEGIN');
                  await targetClient.query('SET session_replication_role = replica');
                  retryTransactionActive = true;
                  // Continue to retry - don't break, let it try again
                  continue;
                } catch (restartError: any) {
                  console.error(`[Sync] ❌ Failed to restart transaction during retry:`, restartError.message);
                  retryFailed++;
                  retryAttempted = true;
                  break;
                }
              } else {
                // Other errors - log and break
                retryFailed++;
                if (error.message && error.message.includes('violates foreign key constraint')) {
                  const fkMatch = error.message.match(/violates foreign key constraint "([^"]+)"/);
                  const constraintName = fkMatch ? fkMatch[1] : 'unknown';
                  console.warn(`[Sync] ⚠️  ${modelName} record ${record.id} still has FK violation (${constraintName}) after retry - parent record may not exist in PostgreSQL`);
                  console.warn(`[Sync]    Full error: ${error.message}`);
                } else {
                  console.warn(`[Sync] ⚠️  ${modelName} record ${record.id} retry failed:`, error.message);
                }
                retryAttempted = true;
                break;
              }
            }
          }

          if (!retryAttempted) {
            console.warn(`[Sync] ⚠️  ${modelName} record ${record.id} retry exhausted after ${maxRetries} attempts`);
            retryFailed++;
          }
        } catch (error: any) {
          retryFailed++;
          console.warn(`[Sync] ⚠️  ${modelName} record ${record.id} retry failed with unexpected error:`, error.message);
        }
      }

      // Re-enable FK checks after retry
      if (retryTransactionActive) {
        try {
          await targetClient.query('SET session_replication_role = DEFAULT');
          await targetClient.query('COMMIT');
          retryTransactionActive = false;
        } catch (error: any) {
          console.warn('[Sync] ⚠️  Error committing retry:', error.message);
          try {
            await targetClient.query('ROLLBACK');
            retryTransactionActive = false;
          } catch (rollbackError) {
            // Ignore rollback errors
            retryTransactionActive = false;
          }
        }
      }

      if (retrySynced > 0) {
        console.log(`[Sync] ✅ Retry pass: ${retrySynced} records successfully synced`);
      }
      if (retryFailed > 0) {
        console.warn(`[Sync] ⚠️  Retry pass: ${retryFailed} records still failed`);
      }
    }

    // Update table check status
    if (missingTablesCount > 0) {
      if (!this.tablesCheckDone) {
        console.warn(`[Sync] ⚠️  ${missingTablesCount} tables missing in PostgreSQL. Run: npm run db:reset-postgresql`);
        console.warn(`[Sync] 💤 Sync to PostgreSQL paused until tables are created. Will retry in 5 minutes.`);
      }
      this.postgresTablesExist = false;
    } else {
      this.postgresTablesExist = true;
    }
    this.tablesCheckDone = true;

    console.log(`[Sync] ✅ Full database sync completed: ${totalSynced} records synced${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`);
    return totalSynced;
  }

  /**
   * Clean record data for sync (handles BigInt, Date, etc.)
   */
  private cleanRecord(record: any): any {
    const cleaned: any = { ...record };

    // Convert BigInt to string for JSON serialization
    for (const key in cleaned) {
      if (typeof cleaned[key] === 'bigint') {
        cleaned[key] = cleaned[key].toString();
      }
      // Handle nested objects
      if (cleaned[key] && typeof cleaned[key] === 'object' && !(cleaned[key] instanceof Date)) {
        if (Array.isArray(cleaned[key])) {
          cleaned[key] = cleaned[key].map((item: any) => {
            if (typeof item === 'bigint') {
              return item.toString();
            }
            return item;
          });
        }
      }
    }

    return cleaned;
  }

  /**
   * Remove relation fields from record (only keep scalar fields)
   * Relations are handled by foreign keys, not nested objects
   */
  private removeRelations(record: any): any {
    const cleaned: any = {};

    // Common relation field names to exclude
    const relationFields = [
      'branch', 'company', 'user', 'customer', 'product', 'sale', 'purchase',
      'category', 'supplier', 'manufacturer', 'shelf', 'role', 'employee',
      'items', 'batches', 'sales', 'purchases', 'receipts', 'refunds',
      'subscriptions', 'card_details', 'attendance', 'shifts', 'commissions'
    ];

    for (const key in record) {
      // Skip relation fields (objects/arrays that are not dates)
      if (relationFields.includes(key)) {
        continue;
      }

      // Skip if it's an object (likely a relation)
      if (record[key] && typeof record[key] === 'object' && !(record[key] instanceof Date) && !Array.isArray(record[key])) {
        continue;
      }

      // Keep scalar values and arrays of scalars
      cleaned[key] = record[key];
    }

    return cleaned;
  }

  /**
   * Update sync status
   */
  private updateStatus(): void {
    this.syncStatus.pendingItems = this.syncQueue.filter(item => !item.synced).length;
  }

  /**
   * Get sync status
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Clear synced items from queue
   */
  clearSyncedItems(): void {
    this.syncQueue = this.syncQueue.filter(item => !item.synced);
    this.saveQueue();
    this.updateStatus();
  }

  /**
   * Get queue items
   */
  getQueue(): SyncQueueItem[] {
    return [...this.syncQueue];
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

export default getSyncService;
