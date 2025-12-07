/**
 * Prisma Utility - Provides database client that switches between SQLite and PostgreSQL
 * Use this instead of creating PrismaClient directly in controllers
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseService } from '../services/database.service';
import { getSyncService } from '../services/sync.service';

/**
 * Get Prisma client - automatically uses correct database (SQLite/PostgreSQL)
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  const dbService = getDatabaseService();
  return await dbService.getClient();
}

/**
 * Prisma client proxy that tracks changes for sync
 */
export function createPrismaProxy(client: PrismaClient): PrismaClient {
  const syncService = getSyncService();
  const dbService = getDatabaseService();

  // Create proxy to intercept operations
  return new Proxy(client, {
    get(target, prop) {
      const original = (target as any)[prop];

      // Only proxy model operations (not $connect, $disconnect, etc.)
      if (typeof prop === 'string' && !prop.startsWith('$') && typeof original === 'object') {
        return new Proxy(original, {
          get(modelTarget, operation) {
            const originalOperation = (modelTarget as any)[operation];

            if (typeof originalOperation === 'function') {
              return async (...args: any[]) => {
                const result = await originalOperation.apply(modelTarget, args);

                // Track changes if offline
                if (dbService.isOffline()) {
                  const tableName = prop;
                  let syncOperation: 'create' | 'update' | 'delete' | null = null;
                  let data: any = null;

                  if (operation === 'create') {
                    syncOperation = 'create';
                    data = args[0]?.data || args[0];
                  } else if (operation === 'update') {
                    syncOperation = 'update';
                    data = { ...args[0]?.data, id: args[0]?.where?.id };
                  } else if (operation === 'delete') {
                    syncOperation = 'delete';
                    data = { id: args[0]?.where?.id };
                  }

                  if (syncOperation && data) {
                    syncService.addToQueue(tableName, syncOperation, data);
                  }
                }

                return result;
              };
            }

            return originalOperation;
          }
        });
      }

      return original;
    }
  });
}

/**
 * Get Prisma client with sync tracking
 */
export async function getPrismaWithSync(): Promise<PrismaClient> {
  const client = await getPrismaClient();
  return createPrismaProxy(client);
}
