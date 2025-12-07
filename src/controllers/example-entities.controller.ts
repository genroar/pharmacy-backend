/**
 * Example Entities Controller - Demonstrates offline/online usage
 * Uses unified database service for automatic database switching
 */

import { Request, Response } from 'express';
import { getUnifiedDatabaseService } from '../services/unified-db.service';
import { getEnhancedSyncService } from '../services/enhanced-sync.service';
import { AuthRequest } from '../middleware/auth.middleware';

// Example: Users Controller
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const unifiedDb = getUnifiedDatabaseService();
    const syncService = getEnhancedSyncService();

    const userData = {
      username: req.body.username,
      email: req.body.email,
      name: req.body.name,
      password: req.body.password, // Should be hashed
      role: req.body.role || 'USER',
      isActive: true,
      created_at: new Date(),
      updated_at: new Date(),
      is_synced: false // Will be synced later
    };

    // Use unified DB service (automatically uses correct database)
    const user = await unifiedDb.query(async (client) => {
      return await (client as any).user.create({
        data: userData
      });
    });

    // Add to sync queue if offline
    if (unifiedDb.isOffline()) {
      syncService.addToQueue('user', 'create', user);
    }

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
      mode: unifiedDb.isOnline() ? 'online' : 'offline'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const unifiedDb = getUnifiedDatabaseService();

    const { page = 1, limit = 50, search = '' } = req.query;

    const users = await unifiedDb.query(async (client) => {
      return await (client as any).user.findMany({
        where: search ? {
          OR: [
            { name: { contains: search as string } },
            { email: { contains: search as string } },
            { username: { contains: search as string } }
          ]
        } : {},
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { created_at: 'desc' }
      });
    });

    res.json({
      success: true,
      data: users,
      mode: unifiedDb.isOnline() ? 'online' : 'offline'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
};

// Example: Orders Controller
export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const unifiedDb = getUnifiedDatabaseService();
    const syncService = getEnhancedSyncService();

    const orderData = {
      customerId: req.body.customerId,
      userId: req.user?.id,
      total: req.body.total,
      status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
      is_synced: false
    };

    // Use transaction for order creation
    const order = await unifiedDb.query(async (client) => {
      return await client.$transaction(async (tx) => {
        // Create order
        const newOrder = await (tx as any).order.create({
          data: orderData
        });

        // Create order items
        if (req.body.items && req.body.items.length > 0) {
          for (const item of req.body.items) {
            await (tx as any).orderItem.create({
              data: {
                orderId: newOrder.id,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                created_at: new Date(),
                updated_at: new Date(),
                is_synced: false
              }
            });
          }
        }

        return newOrder;
      });
    }, { useTransaction: true });

    // Add to sync queue if offline
    if (unifiedDb.isOffline()) {
      syncService.addToQueue('order', 'create', order);
      if (req.body.items) {
        for (const item of req.body.items) {
          syncService.addToQueue('orderItem', 'create', {
            ...item,
            orderId: order.id
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully',
      mode: unifiedDb.isOnline() ? 'online' : 'offline'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

export const getOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const unifiedDb = getUnifiedDatabaseService();

    const { page = 1, limit = 50, status = '' } = req.query;

    const orders = await unifiedDb.query(async (client) => {
      return await (client as any).order.findMany({
        where: status ? { status: status as string } : {},
        include: {
          items: true,
          customer: true
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { created_at: 'desc' }
      });
    });

    res.json({
      success: true,
      data: orders,
      mode: unifiedDb.isOnline() ? 'online' : 'offline'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get orders',
      error: error.message
    });
  }
};

// Sync status endpoint
export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const syncService = getEnhancedSyncService();
    const unifiedDb = getUnifiedDatabaseService();
    const connectivityService = require('../services/connectivity.service').getConnectivityService();

    const status = syncService.getSyncStatus();
    const connectivity = connectivityService.getStatus();

    res.json({
      success: true,
      data: {
        connectivity: {
          status: connectivity,
          isOnline: unifiedDb.isOnline(),
          isOffline: unifiedDb.isOffline()
        },
        sync: {
          ...status,
          lastSync: null // Can be added from sync_log table
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error.message
    });
  }
};

// Manual sync trigger
export const triggerSync = async (req: Request, res: Response): Promise<void> => {
  try {
    const unifiedDb = getUnifiedDatabaseService();
    const syncService = getEnhancedSyncService();

    let result;
    if (unifiedDb.isOnline()) {
      result = await syncService.syncToPostgreSQL();
    } else {
      result = await syncService.syncToSQLite();
    }

    res.json({
      success: result.success,
      data: result,
      message: result.success ? 'Sync completed successfully' : 'Sync completed with errors'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: error.message
    });
  }
};
