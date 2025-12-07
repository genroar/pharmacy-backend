/**
 * Example Entities Routes
 */

import { Router } from 'express';
import {
  createUser,
  getUsers,
  createOrder,
  getOrders,
  getSyncStatus,
  triggerSync
} from '../controllers/example-entities.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// User routes
router.post('/users', createUser);
router.get('/users', getUsers);

// Order routes
router.post('/orders', authenticate, createOrder);
router.get('/orders', authenticate, getOrders);

// Sync routes
router.get('/sync/status', getSyncStatus);
router.post('/sync/trigger', triggerSync);

export default router;
