# Event-Driven Bidirectional Sync Guide

## The Problem (Previously)

The old sync system had these issues:
1. **Periodic sync every 60 seconds** - Changes weren't reflected until the next sync cycle
2. **Unidirectional sync** - Only pushed from software → live database, not the other way around
3. **Missing live updates** - Changes made directly to the live PostgreSQL database (e.g., via admin panel, other systems) were NOT pulled into the local SQLite database

## The Solution (Event-Driven Sync)

The new system provides:
1. **Immediate sync on every operation** - Changes are synced the moment they happen
2. **Bidirectional sync** - Both LOCAL → LIVE and LIVE → LOCAL
3. **Easy-to-use utilities** - Simple functions controllers can call

## How to Use in Controllers

### Step 1: Import the Sync Helper

```typescript
import { syncAfterOperation, pullLatestFromLive } from '../utils/sync-helper';
```

### Step 2: Sync After Every CRUD Operation

After CREATE:
```typescript
const product = await prisma.product.create({ ... });

// Immediately sync to PostgreSQL and pull any external changes
syncAfterOperation('product', 'create', product).catch(err => {
  console.error('[Sync] Product create sync failed:', err.message);
});

return res.status(201).json({ success: true, data: product });
```

After UPDATE:
```typescript
const product = await prisma.product.update({ ... });

// Immediately sync the update to PostgreSQL
syncAfterOperation('product', 'update', product).catch(err => {
  console.error('[Sync] Product update sync failed:', err.message);
});

return res.json({ success: true, data: product });
```

After DELETE:
```typescript
const product = await prisma.product.delete({ ... });

// Sync the deletion to PostgreSQL
syncAfterOperation('product', 'delete', product).catch(err => {
  console.error('[Sync] Product delete sync failed:', err.message);
});

return res.json({ success: true, message: 'Deleted' });
```

### Step 3: Pull Latest Before Fetching (Optional)

Before GET (list/fetch) operations, you can pull the latest data from the live database:

```typescript
export const getProducts = async (req, res) => {
  // Pull latest products from live database before fetching
  pullLatestFromLive('product').catch(err => {
    // Silent fail - continue with local data if pull fails
  });

  const products = await prisma.product.findMany({ ... });
  return res.json({ success: true, data: products });
};
```

## Available Functions

### `syncAfterOperation(tableName, operation, record)`

Immediately syncs a record change to PostgreSQL and pulls any external changes.

- **tableName**: Prisma model name (e.g., `'product'`, `'customer'`, `'sale'`)
- **operation**: `'create'` | `'update'` | `'delete'`
- **record**: The record that was created/updated/deleted
- **Returns**: `Promise<boolean>` - true if sync succeeded

### `pullLatestFromLive(tableName)`

Pulls all records for a specific table from PostgreSQL to SQLite.

- **tableName**: Prisma model name
- **Returns**: `Promise<{ synced: number; failed: number }>`

### `triggerFullBidirectionalSync()`

Triggers a full sync of ALL 27 tables in both directions.
Use sparingly (e.g., on app startup or user request).

### `syncMultipleOperations(operations)`

Syncs multiple operations at once (useful for related data).

```typescript
await syncMultipleOperations([
  { tableName: 'sale', operation: 'create', record: sale },
  { tableName: 'saleItem', operation: 'create', record: saleItem },
  { tableName: 'receipt', operation: 'create', record: receipt }
]);
```

### `debouncedSync(tableName, operation, record, delayMs)`

Debounced sync for rapid successive changes (like bulk imports).
Waits for `delayMs` milliseconds of inactivity before syncing all pending operations.

## Table Name Mappings

| Prisma Model | PostgreSQL Table |
|-------------|-----------------|
| company | companies |
| category | categories |
| supplier | suppliers |
| manufacturer | manufacturers |
| shelf | shelves |
| settings | settings |
| user | users |
| branch | branches |
| employee | employees |
| product | products |
| batch | batches |
| stockMovement | stock_movements |
| customer | customers |
| sale | sales |
| saleItem | sale_items |
| receipt | receipts |
| purchase | purchases |
| purchaseItem | purchase_items |
| refund | refunds |
| refundItem | refund_items |
| attendance | attendance |
| shift | shifts |
| scheduledShift | scheduled_shifts |
| scheduledShiftUser | scheduled_shift_users |
| commission | commissions |
| cardDetails | card_details |
| subscription | subscriptions |

## Offline Handling

When the app is offline:
- Operations are queued in `~/.zapeera/sync/sync-queue.json`
- When connection is restored, queued operations are synced automatically
- The app continues to work with local SQLite data

## Periodic Sync (Backup)

The system still has periodic sync as a backup:
- **Every 5 minutes**: Full bidirectional sync (reduced from 60 seconds)
- **Every 30 seconds**: User sync for authentication changes
- **Every 10 minutes**: Safety net sync

Event-driven sync is now the PRIMARY sync mechanism. Periodic sync is just a fallback.

## Example: Full Controller Integration

See `src/controllers/product.controller.ts` for a complete example of how to integrate event-driven sync into a controller.
