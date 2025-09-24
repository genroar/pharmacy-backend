import { Router } from 'express';
import { getSales, getSale, getSaleByReceiptNumber, getAvailableReceiptNumbers, createSale } from '../controllers/sale.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sales routes (all authenticated users can access)
router.get('/', getSales);
router.get('/:id', getSale);
router.get('/receipt/:receiptNumber', getSaleByReceiptNumber);
router.get('/receipts', getAvailableReceiptNumbers);
router.post('/', createSale);

export default router;


